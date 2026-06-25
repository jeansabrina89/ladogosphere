-- 1) Table de liaison facture <-> reservations (N:N) pour les factures groupées
create table public.facture_reservations (
  id uuid primary key default gen_random_uuid(),
  facture_id uuid not null references public.factures(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete restrict,
  montant numeric not null default 0,
  created_at timestamptz default now(),
  unique (facture_id, reservation_id)
);

create index idx_facture_reservations_facture on public.facture_reservations(facture_id);
create index idx_facture_reservations_reservation on public.facture_reservations(reservation_id);

-- RLS cohérent avec factures/paiements : admin via session ; les routes écrivent en supabaseAdmin
alter table public.facture_reservations enable row level security;
create policy "admin_all_facture_reservations"
  on public.facture_reservations
  for all to authenticated
  using (is_admin());

-- 2) Numérotation séquentielle des factures : FAC-YYYY-NNNN (compteur continu, sans trou)
create sequence if not exists public.factures_numero_seq;

create or replace function public.generer_numero_facture()
returns text
language sql
volatile
set search_path = public
as $$
  select 'FAC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.factures_numero_seq')::text, 4, '0');
$$;
