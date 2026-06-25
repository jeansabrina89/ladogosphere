-- Lot 6 — base de la cloture d'exercice

-- 1. Compte de report a nouveau (resultat accumule des exercices clotures)
insert into public.comptes (numero, libelle, type)
select '2970', 'Report a nouveau', 'passif'
where not exists (select 1 from public.comptes where numero = '2970');

-- 2. Table des exercices comptables (statut ouvert/cloture)
create table if not exists public.exercices (
  annee        integer primary key,
  statut       text not null default 'ouvert' check (statut in ('ouvert','cloture')),
  date_cloture timestamptz,
  cloture_par  uuid,
  resultat     numeric(12,2),
  created_at   timestamptz not null default now()
);

alter table public.exercices enable row level security;

-- 3. Verrou : interdire toute nouvelle ecriture dans un exercice cloture (CO 958f)
create or replace function public.bloquer_ecriture_exercice_cloture()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_annee  integer := extract(year from NEW.date_ecriture)::int;
  v_statut text;
begin
  select statut into v_statut from public.exercices where annee = v_annee;
  if v_statut = 'cloture' then
    raise exception 'Exercice % cloture : aucune nouvelle ecriture autorisee', v_annee;
  end if;
  return NEW;
end;
$fn$;

drop trigger if exists trg_ecritures_bloc_exercice_cloture on public.ecritures;
create trigger trg_ecritures_bloc_exercice_cloture
  before insert on public.ecritures
  for each row execute function public.bloquer_ecriture_exercice_cloture();
