-- 1. Colonne d'ajustement manuel tracé sur reservations
alter table public.reservations
  add column if not exists ajustement_manuel numeric not null default 0;

-- Backfill : préserver l'invariant montant_final = montant_calcule + ajustement_manuel + extras
update public.reservations
  set ajustement_manuel = coalesce(montant_final,0) - coalesce(montant_calcule,0)
  where coalesce(montant_final,0) - coalesce(montant_calcule,0) <> 0;

-- 2. Table des lignes supplémentaires (extras)
create table if not exists public.reservation_extras (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  libelle text not null,
  montant numeric not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_reservation_extras_reservation_id
  on public.reservation_extras(reservation_id);

-- 3. RLS : même pattern que reservation_chiens
alter table public.reservation_extras enable row level security;

create policy admin_all_reservation_extras on public.reservation_extras
  for all using (is_admin()) with check (is_admin());

create policy client_select_reservation_extras on public.reservation_extras
  for select using (
    reservation_id in (
      select r.id from public.reservations r
      where r.client_id in (
        select c.id from public.clients c where c.auth_user_id = auth.uid()
      )
    )
  );
