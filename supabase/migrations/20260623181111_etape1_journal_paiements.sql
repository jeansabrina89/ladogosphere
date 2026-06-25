create table if not exists public.paiements_resa (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id),
  client_id uuid,
  date_paiement date not null default current_date,
  mode text not null check (mode in ('cash','twint','stripe','virement','avoir')),
  montant numeric(12,2) not null,
  motif text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_paiements_resa_reservation on public.paiements_resa(reservation_id);
create index if not exists idx_paiements_resa_client on public.paiements_resa(client_id);

create or replace function public.paiements_resa_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'paiements_resa est append-only : un mouvement ne peut etre ni modifie ni supprime.';
end;
$$;

drop trigger if exists trg_paiements_resa_append_only on public.paiements_resa;
create trigger trg_paiements_resa_append_only
before update or delete on public.paiements_resa
for each row execute function public.paiements_resa_append_only();

alter table public.paiements_resa enable row level security;
