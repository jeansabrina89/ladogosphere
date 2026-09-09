-- Cotisation membre : validité 12 mois glissants alignée sur le 1er du mois.
--
-- Avant : une cotisation par ANNÉE CIVILE (UNIQUE(client_id, annee)), avec une
-- tolérance applicative janvier-février.
-- Après : chaque cotisation porte sa propre période [date_debut, date_fin] :
--   date_debut = date de paiement (ou fin de la précédente + 1 jour si
--                renouvellement anticipé) ;
--   date_fin   = (1er du mois de date_debut) + 1 an - 1 jour.
-- La colonne `annee` est CONSERVÉE (historique + comptabilité) mais devient
-- dérivée : extract(year from date_debut), posée par trigger.
begin;

-- ---------------------------------------------------------------------------
-- 1. Colonnes de période
-- ---------------------------------------------------------------------------
alter table public.cotisations_membres
  add column if not exists date_debut date,
  add column if not exists date_fin   date;

-- Reprise : lignes payées -> période à partir de la date de paiement.
update public.cotisations_membres
set date_debut = date_paiement,
    date_fin   = (date_trunc('month', date_paiement::timestamp) + interval '1 year' - interval '1 day')::date
where statut = 'payee'
  and date_paiement is not null
  and date_debut is null;

-- Reprise : lignes en attente -> période PROVISOIRE à partir de created_at
-- (recalculée à la confirmation du paiement).
update public.cotisations_membres
set date_debut = created_at::date,
    date_fin   = (date_trunc('month', created_at) + interval '1 year' - interval '1 day')::date
where statut = 'en_attente'
  and date_debut is null;

-- Filet : toute autre ligne résiduelle (payée sans date_paiement, statut exotique).
update public.cotisations_membres
set date_debut = coalesce(date_paiement, created_at::date),
    date_fin   = (date_trunc('month', coalesce(date_paiement, created_at::date)::timestamp) + interval '1 year' - interval '1 day')::date
where date_debut is null;

alter table public.cotisations_membres
  alter column date_debut set not null,
  alter column date_fin   set not null;

alter table public.cotisations_membres
  drop constraint if exists cotisations_membres_periode_valide;
alter table public.cotisations_membres
  add constraint cotisations_membres_periode_valide check (date_fin > date_debut);

-- ---------------------------------------------------------------------------
-- 2. Unicité : plus « une par année », mais « au plus une demande en attente »
-- ---------------------------------------------------------------------------
alter table public.cotisations_membres
  drop constraint if exists cotisations_membres_client_id_annee_key;

create unique index if not exists cotisations_membres_une_en_attente_par_client
  on public.cotisations_membres (client_id)
  where statut = 'en_attente';

create index if not exists idx_cotisations_membres_client_periode
  on public.cotisations_membres (client_id, date_debut, date_fin);

-- ---------------------------------------------------------------------------
-- 3. `annee` dérivée de date_debut (+ période par défaut si non fournie)
-- ---------------------------------------------------------------------------
create or replace function public.cotisations_membres_synchroniser_periode()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  -- Période minimale si l'appelant ne la fournit pas (robustesse : `annee` est
  -- NOT NULL et n'est plus jamais renseignée par le code applicatif).
  if new.date_debut is null then
    new.date_debut := coalesce(new.date_paiement, current_date);
  end if;
  if new.date_fin is null then
    new.date_fin := (date_trunc('month', new.date_debut::timestamp) + interval '1 year' - interval '1 day')::date;
  end if;
  new.annee := extract(year from new.date_debut)::int;
  return new;
end;
$fn$;

drop trigger if exists trg_cotisations_membres_periode on public.cotisations_membres;
create trigger trg_cotisations_membres_periode
before insert or update on public.cotisations_membres
for each row
execute function public.cotisations_membres_synchroniser_periode();

-- ---------------------------------------------------------------------------
-- 4. Fonction de calcul réutilisable (SQL + RPC applicative)
-- ---------------------------------------------------------------------------
-- Renvoie la période à poser pour une cotisation du client `p_client_id` payée
-- le `p_date_paiement`. `p_exclure_id` permet d'ignorer la ligne en cours de
-- mise à jour (renouvellement d'une cotisation déjà 'payee').
create or replace function public.calculer_periode_cotisation(
  p_client_id     uuid,
  p_date_paiement date default current_date,
  p_exclure_id    uuid default null
)
returns table (date_debut date, date_fin date)
language sql
stable
set search_path = public
as $fn$
  with precedente as (
    select max(c.date_fin) as fin
    from public.cotisations_membres c
    where c.client_id = p_client_id
      and c.statut = 'payee'
      and (p_exclure_id is null or c.id <> p_exclure_id)
      and c.date_fin >= p_date_paiement
  ),
  debut as (
    select coalesce(precedente.fin + 1, p_date_paiement) as d from precedente
  )
  select debut.d,
         (date_trunc('month', debut.d::timestamp) + interval '1 year' - interval '1 day')::date
  from debut;
$fn$;

-- Exposée en RPC pour le code applicatif (service_role uniquement) ; pas de
-- surface anon/authenticated (cf. durcissement RLS du Lot 2a).
revoke all on function public.calculer_periode_cotisation(uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.calculer_periode_cotisation(uuid, date, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Flip automatique au paiement d'une réservation (cf. 20260811182638)
--    Pose désormais AUSSI date_paiement et la période calculée.
-- ---------------------------------------------------------------------------
create or replace function public.flip_cotisation_au_paiement_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  c_ligne record;
  periode record;
  d_paiem date;
begin
  if (old.statut_paiement is distinct from 'paye') and (new.statut_paiement = 'paye') then
    d_paiem := coalesce(new.date_paiement, current_date);
    for c_ligne in
      select id, client_id
      from public.cotisations_membres
      where reservation_id = new.id
        and statut = 'en_attente'
    loop
      select * into periode
      from public.calculer_periode_cotisation(c_ligne.client_id, d_paiem, c_ligne.id);

      update public.cotisations_membres
      set statut        = 'payee',
          date_paiement = d_paiem,
          date_debut    = periode.date_debut,
          date_fin      = periode.date_fin
      where id = c_ligne.id;
    end loop;
  end if;
  return new;
end;
$fn$;

-- PostgREST expose les fonctions SECURITY DEFINER en RPC : sans ce REVOKE,
-- l'advisor anon/authenticated_security_definer_function_executable réapparaît.
-- Un trigger se déclenche SANS privilège EXECUTE.
revoke execute on function public.flip_cotisation_au_paiement_reservation() from public, anon, authenticated;

drop trigger if exists trg_flip_cotisation_au_paiement on public.reservations;
create trigger trg_flip_cotisation_au_paiement
after update of statut_paiement on public.reservations
for each row
execute function public.flip_cotisation_au_paiement_reservation();

commit;
