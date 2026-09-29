-- APP 59 — LES FERMETURES DE LA PENSION
--
-- ── LA RÈGLE (décision de Sabrina, 29.09.2026) ────────────────────────────
--
-- Pendant une fermeture, AUCUNE arrivée et AUCUN départ. Les chiens déjà en
-- séjour restent : la pension est tenue, elle n'accueille simplement personne
-- de nouveau et ne rend personne. Un séjour qui ENJAMBE la fermeture — arrivée
-- avant, départ après — est donc parfaitement possible, et c'est la nuance qui
-- distingue cette table d'un simple « jours fermés ».
--
-- Une garderie ou une journée d'essai, elles, tiennent dans la journée :
-- arrivée ET départ tombent le jour fermé, donc elles sont refusées.
--
-- ── CE QUE LA FERMETURE NE FAIT PAS ──────────────────────────────────────
--
-- Elle n'annule rien. Une réservation déjà validée qui tombe dans une nouvelle
-- fermeture reste en place : c'est un appel à passer, pas une ligne à effacer.
-- L'écran de fermeture liste ces réservations sous « À contacter ».
--
-- Elle ne bloque pas le personnel non plus : l'équipe doit pouvoir saisir un
-- cas particulier. Elle est AVERTIE.
--
-- ── LES DROITS ───────────────────────────────────────────────────────────
--
-- Trois cercles, et trois seulement :
--
--  · le PERSONNEL lit la table entière (il a besoin du motif et des dates pour
--    répondre au téléphone) ;
--  · seule l'ADMINISTRATRICE écrit : fermer la pension est une décision, pas
--    un geste d'accueil ;
--  · le CLIENT ne touche JAMAIS la table. Il lit une vue qui n'expose que les
--    trois colonnes qui le concernent — les dates et le motif. `cree_par` et
--    `cree_le` disent qui a décidé et quand, ce qui ne le regarde pas.
--
-- La vue est `security_invoker = false`, donc SECURITY DEFINER : elle lit la
-- table avec les droits de son propriétaire, ce qui permet au client de la
-- consulter sans aucun droit sur la table.
--
-- ATTENTION, et c'est la leçon d'APP 26 : ce report de droits ne vaut QUE POUR
-- LES TABLES. Le privilège EXECUTE d'une fonction est vérifié avec le rôle
-- courant, donc une vue SECURITY DEFINER qui appellerait une fonction fermée
-- serait fermée elle aussi — et la suite de tests, qui lit avec la clé de
-- service, ne le verrait pas. Cette vue n'appelle AUCUNE fonction : elle ne
-- fait que choisir trois colonnes. Elle ne doit jamais en appeler. Un calcul
-- destiné au client s'écrit DANS la vue, pas par un `rpc`.

create table if not exists public.fermetures_pension (
  id         uuid primary key default gen_random_uuid(),
  -- Les deux bornes sont INCLUSIVES : une fermeture du 24 au 26 ferme les
  -- trois jours. C'est ainsi qu'on l'annonce, c'est ainsi qu'on la stocke.
  date_debut date not null,
  date_fin   date not null,
  -- Facultatif, mais VISIBLE DU CLIENT : « Vacances annuelles », « Travaux ».
  -- Une fermeture sans raison se lit comme une panne.
  motif      text,
  cree_par   uuid references auth.users(id) on delete set null,
  cree_le    timestamptz not null default now(),
  constraint fermetures_pension_periode check (date_fin >= date_debut)
);

-- On cherche toujours « les fermetures qui touchent telle période » : les deux
-- bornes sont interrogées ensemble.
create index if not exists fermetures_pension_periode_idx
  on public.fermetures_pension (date_debut, date_fin);

alter table public.fermetures_pension enable row level security;

drop policy if exists fermetures_pension_lecture_personnel on public.fermetures_pension;
create policy fermetures_pension_lecture_personnel
  on public.fermetures_pension for select
  to authenticated
  using (public.is_personnel());

drop policy if exists fermetures_pension_ecriture_admin on public.fermetures_pension;
create policy fermetures_pension_ecriture_admin
  on public.fermetures_pension for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── La vue que lit le client ──────────────────────────────────────────────

drop view if exists public.fermetures_pension_publiques;
create view public.fermetures_pension_publiques
with (security_invoker = false) as
  select date_debut, date_fin, motif
    from public.fermetures_pension;

-- `create or replace view` ne redonne pas les droits sur une base reconstruite
-- depuis le dépôt : on les redit ici (leçon d'APP 34).
revoke all on public.fermetures_pension_publiques from public, anon;
grant select on public.fermetures_pension_publiques to authenticated, service_role;

comment on view public.fermetures_pension_publiques is
  'Les fermetures telles que le client peut les lire : dates et motif, rien de plus. SECURITY DEFINER, et sans aucun appel de fonction (cf. APP 26).';
