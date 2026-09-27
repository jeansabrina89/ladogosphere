-- APP 28-BIS : une fiche cliente ne se rattache qu'à une adresse CONFIRMÉE.
--
-- ── LE DÉFAUT, RELEVÉ AU LOT 28 ───────────────────────────────────────────
--
-- `lier_client_auth` était posé en `AFTER INSERT ON auth.users`. Le rattachement
-- d'une fiche cliente à un compte se faisait donc à l'instant où le compte était
-- créé, avant toute preuve que la personne possède l'adresse.
--
-- Ce que cela permettait : quelqu'un qui connaît l'adresse d'une cliente sans
-- compte s'inscrivait avec cette adresse et prenait possession de sa fiche —
-- ses chiens, son historique, ses réservations. Le lot 28 a rendu l'inscription
-- muette (C-05) ; muette, elle laissait toujours passer la prise de contrôle.
--
-- Mesuré le 27.09.2026, avant correction : 9 fiches rattachées, dont UNE à un
-- compte non confirmé. Le défaut n'était pas théorique.
--
-- ── CE QUI SE DÉPLACE, ET CE QUI RESTE ────────────────────────────────────
--
-- Le PROFIL applicatif reste créé à l'insertion. Il ne porte aucune donnée d'une
-- autre personne : c'est le profil DE CE compte, et il doit exister dès la
-- création, sans quoi les gardes de l'application (`lireAppelant`) ne trouvent
-- rien à lire pour un compte qui vient de naître.
--
-- Le RATTACHEMENT DE FICHE, lui, attend la confirmation. Il a désormais deux
-- moments, et deux seulement :
--
--   1. à la confirmation, quand `email_confirmed_at` passe de NULL à une date ;
--   2. à l'insertion, MAIS seulement si l'adresse arrive déjà confirmée.
--
-- Le second cas n'est pas une échappatoire : c'est celui d'un compte créé par
-- l'administratrice avec `email_confirm: true`
-- (`app/(admin)/(espace-equipe)/employes/actions.ts`). Là, c'est Sabrina qui
-- atteste l'adresse, et son geste vaut confirmation. Aucun autre chemin de
-- l'application ne crée de compte : ni invitation, ni lien magique.
--
-- ── CE QUI NE CHANGE PAS ──────────────────────────────────────────────────
--
-- `auth_user_id is null` reste une condition du UPDATE. Une fiche déjà rattachée
-- n'est jamais reprise par un autre compte — c'est la correction du 06.09.2026
-- (`20260906173106`), et elle est ici mot pour mot.
--
-- Le trigger ne crée toujours AUCUNE fiche : correctif de recette I5
-- (`20260907134532`). Un compte du personnel créait autrefois une fiche cliente
-- vide, et le déclencheur ne connaît pas le rôle au moment de l'inscription.

-- Le rattachement lui-même, écrit une fois pour les deux moments.
-- ── CE QUE PORTENT LES TROIS FONCTIONS, EN DÉTAIL ────────────────────────
--
-- Une fiche LIBRE portant la même adresse, casse ignorée.
-- `auth_user_id is null` n'est pas une commodité : sans lui, quiconque
-- connaîtrait l'adresse d'une cliente reprendrait sa fiche. C'est la
-- correction du 06.09.2026, et elle reste entière.
-- /
-- Le rattachement N'A PLUS LIEU ICI, sauf si l'adresse arrive déjà confirmée.
-- C'est le cas d'un compte créé par l'administratrice (`email_confirm: true`) :
-- elle atteste l'adresse, et son geste vaut confirmation. Pour une inscription
-- publique, `email_confirmed_at` est NULL à cet instant — la fiche attendra le
-- trigger de confirmation.
-- /
-- Le profil, lui, est créé dans tous les cas : il ne porte que ce compte, et
-- les gardes de l'application le lisent dès la première requête.
-- Aucune fiche `clients` n'est créée — correctif de recette I5 : le
-- déclencheur ne connaît pas encore le rôle, et un compte du personnel
-- héritait d'une fiche cliente vide.
-- /
create or replace function public.rattacher_fiche_client_confirmee(
  p_user_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.clients
     set auth_user_id = p_user_id
   where lower(email) = lower(p_email)
     and auth_user_id is null;
end;
$function$;

comment on function public.rattacher_fiche_client_confirmee(uuid, text) is
  'Rattache une fiche cliente LIBRE au compte dont l''adresse vient d''être confirmée. Jamais appelée avant confirmation : c''est ce qui empêche de prendre possession de la fiche d''autrui en s''inscrivant sous son adresse.';

revoke all on function public.rattacher_fiche_client_confirmee(uuid, text) from public, anon, authenticated;
grant execute on function public.rattacher_fiche_client_confirmee(uuid, text) to service_role;

-- ── 1. À l'insertion : le profil toujours, la fiche seulement si confirmée ──

create or replace function public.lier_client_auth()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.email_confirmed_at is not null then
    perform public.rattacher_fiche_client_confirmee(new.id, new.email);
  end if;

  insert into public.profiles (id, email, role, actif)
  values (new.id, new.email, 'client', true)
  on conflict (id) do nothing;

  return new;
end;
$function$;

-- ── 2. À la confirmation : le rattachement, et rien d'autre ────────────────

create or replace function public.lier_client_auth_confirmee()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.rattacher_fiche_client_confirmee(new.id, new.email);
  return new;
end;
$function$;

drop trigger if exists on_auth_user_confirmed on auth.users;

-- `WHEN` plutôt qu'un `if` dans le corps : la condition est alors évaluée par
-- Postgres avant d'appeler la fonction, et elle se lit dans la définition du
-- trigger — donc dans `pg_get_triggerdef`, donc dans tout audit futur.
-- De NULL vers une date, et pas l'inverse : une confirmation qu'on retirerait
-- ne doit pas détacher une fiche, et une date qui change (re-confirmation) ne
-- doit rien rejouer.
-- /

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.lier_client_auth_confirmee();
