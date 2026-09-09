-- Le compte de la dette fiscale nette. Ce n'est PAS une charge : c'est une
-- réduction du produit, puisque le produit a été comptabilisé TTC.
insert into public.comptes (numero, libelle, type, actif)
values ('3806', 'Décompte TVA (dette fiscale nette)', 'produit', true)
on conflict (numero) do nothing;

-- Un décompte par période. Une fois déclaré, il ne bouge plus : on corrige par
-- la période suivante, comme l'AFC le demande.
create table if not exists public.decomptes_tva (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  periode_debut date not null,
  periode_fin date not null,
  methode text not null,
  periodicite text not null,
  detail jsonb not null default '[]'::jsonb,
  ca_total numeric not null default 0,
  total_du numeric not null default 0,
  statut text not null default 'declare',
  ecriture_id uuid references public.ecritures(id),
  paye_le date,
  ecriture_paiement_id uuid references public.ecritures(id),
  declare_le timestamptz not null default now(),
  declare_par uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint decomptes_tva_periode_check check (periode_fin >= periode_debut),
  constraint decomptes_tva_methode_check check (methode in ('tdfn','effective')),
  constraint decomptes_tva_statut_check check (statut in ('declare','paye'))
);

comment on table public.decomptes_tva is
  'Décomptes TVA déclarés. Append-only : une période déclarée ne se recalcule jamais, on corrige par la suivante.';

create unique index if not exists decomptes_tva_periode_unique
  on public.decomptes_tva (periode_debut, periode_fin);

-- Aucun chevauchement de périodes, même partiel : deux décomptes qui se
-- recouvrent, c'est du chiffre d'affaires compté deux fois.
create index if not exists decomptes_tva_bornes on public.decomptes_tva (periode_debut, periode_fin);

/**
 * Un décompte déclaré est figé. Seuls le paiement et son écriture peuvent
 * encore être renseignés : le reste est de l'histoire.
 */
create or replace function public.decompte_tva_fige()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un décompte TVA déclaré ne se supprime pas : corrigez par la période suivante.';
  end if;

  if new.code is distinct from old.code
     or new.periode_debut is distinct from old.periode_debut
     or new.periode_fin is distinct from old.periode_fin
     or new.methode is distinct from old.methode
     or new.detail is distinct from old.detail
     or new.ca_total is distinct from old.ca_total
     or new.total_du is distinct from old.total_du
     or new.ecriture_id is distinct from old.ecriture_id then
    raise exception 'Le décompte TVA % est déclaré : il ne se recalcule pas. Corrigez par la période suivante.', old.code;
  end if;

  return new;
end;
$$;

drop trigger if exists decompte_tva_fige_trigger on public.decomptes_tva;
create trigger decompte_tva_fige_trigger
  before update or delete on public.decomptes_tva
  for each row execute function public.decompte_tva_fige();

alter table public.decomptes_tva enable row level security;

drop policy if exists decomptes_tva_admin on public.decomptes_tva;
create policy decomptes_tva_admin on public.decomptes_tva
  for all to authenticated using (public.is_admin()) with check (public.is_admin());