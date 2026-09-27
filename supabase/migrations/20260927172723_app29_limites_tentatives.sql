-- APP 29 : une limite de tentatives qui survit au redémarrage (C-13).
--
-- ── POURQUOI EN BASE, ET NON EN MÉMOIRE ───────────────────────────────────
--
-- Vercel lance plusieurs instances, et les recycle. Un compteur en mémoire
-- serait remis à zéro à chaque démarrage, et chaque instance aurait le sien :
-- dix instances, dix fois la limite. Une limite qu'on peut contourner en
-- rafraîchissant n'est pas une limite, c'est une décoration.
--
-- ── CE QUE CETTE TABLE COMPTE, ET CE QU'ELLE NE COMPTE PAS ────────────────
--
-- Elle ne remplace PAS les limites de Supabase Auth, qui couvrent la connexion,
-- l'inscription et la réinitialisation du mot de passe. Celles-là sont réglées
-- dans le tableau de bord (Authentication → Rate Limits) et ne sont pas de notre
-- ressort.
--
-- Elle couvre ce qui passe par NOTRE code et déclenche un envoi :
--
--   * `email_compte_existe` — l'e-mail « Vous avez déjà un compte » du lot 28.
--     C'est le seul chemin joignable SANS être connecté, vers une adresse
--     arbitraire. Sans plafond, on se sert de notre domaine pour harceler une
--     boîte, et notre réputation d'expéditeur en paie le prix ;
--   * `email_test` — les envois d'essai des réglages. Derrière la garde de
--     l'administratrice : le risque n'est pas malveillant mais accidentel, une
--     boucle qui consomme le quota Resend.
--
-- ── LA FENÊTRE GLISSANTE, ET POURQUOI PAS UN COMPTEUR PAR HEURE ───────────
--
-- On compte les tentatives des N dernières minutes, pas celles « de l'heure en
-- cours ». Avec un compteur par heure civile, deux tentatives à 10 h 59 et
-- 11 h 01 passent toutes les deux : la limite s'ouvre en grand à chaque changement
-- d'heure. La fenêtre glissante n'a pas ce trou.

-- ── LE DÉTAIL DE CHAQUE COLONNE ET DE CHAQUE FONCTION ────────────────────
--
-- genre : 'email' ou 'ip' — pour lire la table et comprendre ce qui a bloqué.
-- Ce qu'on limite : `email_compte_existe`, `email_test`. Une chaîne libre et
-- non un enum — un enum demanderait une migration pour chaque nouveau geste à
-- plafonner, et ce serait la raison qu'on se donnerait pour ne pas le faire.
-- /
-- À QUI on l'impute : l'adresse visée, ou l'IP, ou les deux.
-- Deux lignes pour une même tentative, donc, et c'est voulu : plafonner par
-- adresse empêche de harceler UNE boîte, plafonner par IP empêche d'en
-- harceler mille. Ni l'un ni l'autre ne suffit seul.
-- /
-- L'index porte les trois colonnes du comptage, dans l'ordre où on filtre :
-- geste, puis clé, puis fenêtre de temps. Sans lui, chaque tentative lit toute
-- la table — et cette table grossit à chaque tentative, donc le remède
-- ralentirait exactement ce qu'il protège.
-- /
-- Personne ne lit ni n'écrit cette table sans la clé de service.
-- RLS activée SANS politique : c'est le régime des tables comptables du dépôt.
-- Un client ne doit pas savoir combien de tentatives ont visé une adresse — ce
-- serait dire que l'adresse existe, et rouvrir C-05 par la porte de derrière.
-- /
-- Compte, décide et enregistre — en UNE seule fois.
-- Deux requêtes séparées (compter, puis écrire) laisseraient passer deux
-- tentatives simultanées sous un plafond de une : chacune compterait zéro avant
-- que l'autre n'écrive. Ici, le comptage et l'écriture tiennent dans le même
-- appel, donc dans la même transaction.
-- Rend `true` si la tentative est AUTORISÉE. L'appelant n'a pas à savoir
-- combien il en reste : lui rendre le compte serait lui dire ce qui s'est passé
-- sur une adresse qui n'est pas la sienne.
-- /
-- Le ménage : les tentatives plus vieilles qu'un jour ne servent plus à rien.
-- Aucune fenêtre ne dépasse une heure ; garder un jour laisse de quoi regarder
-- ce qui s'est passé si une adresse est bloquée, sans laisser la table grossir
-- indéfiniment. Appelée par le cron quotidien, et sans danger si elle ne l'est
-- pas : l'index tient, et la table reste petite.
-- /
create table if not exists public.tentatives_limitees (
  id bigserial primary key,
  geste text not null,
  cle text not null,
  genre text not null,
  tentee_le timestamptz not null default now(),
  constraint tentatives_limitees_genre_check check (genre in ('email', 'ip'))
);

comment on table public.tentatives_limitees is
  'Les tentatives comptées pour les limites de C-13. En base et non en mémoire : Vercel lance plusieurs instances et les recycle, un compteur en mémoire se remettrait à zéro et chaque instance aurait le sien.';

create index if not exists tentatives_limitees_compte_idx
  on public.tentatives_limitees (geste, cle, tentee_le desc);

alter table public.tentatives_limitees enable row level security;
revoke all on public.tentatives_limitees from anon, authenticated;
revoke all on sequence public.tentatives_limitees_id_seq from anon, authenticated;

create or replace function public.tentative_autorisee(
  p_geste text,
  p_cle text,
  p_genre text,
  p_plafond int,
  p_fenetre_minutes int
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_deja int;
begin
  if p_cle is null or btrim(p_cle) = '' then
    -- Sans clé, on ne peut rien imputer : on laisse passer plutôt que de
    -- bloquer tout le monde sous une clé vide commune.
    return true;
  end if;

  select count(*) into v_deja
    from public.tentatives_limitees
   where geste = p_geste
     and cle = lower(btrim(p_cle))
     and tentee_le > now() - make_interval(mins => p_fenetre_minutes);

  if v_deja >= p_plafond then
    return false;
  end if;

  insert into public.tentatives_limitees (geste, cle, genre)
  values (p_geste, lower(btrim(p_cle)), p_genre);

  return true;
end;
$function$;

comment on function public.tentative_autorisee(text, text, text, int, int) is
  'Compte les tentatives de la fenêtre glissante, décide, et enregistre celle-ci — en une seule transaction. Deux requêtes séparées laisseraient passer deux tentatives simultanées sous un plafond de une.';

revoke all on function public.tentative_autorisee(text, text, text, int, int) from public, anon, authenticated;
grant execute on function public.tentative_autorisee(text, text, text, int, int) to service_role;

create or replace function public.purger_tentatives_limitees()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_supprimees integer;
begin
  delete from public.tentatives_limitees where tentee_le < now() - interval '1 day';
  get diagnostics v_supprimees = row_count;
  return v_supprimees;
end;
$function$;

revoke all on function public.purger_tentatives_limitees() from public, anon, authenticated;
grant execute on function public.purger_tentatives_limitees() to service_role;
