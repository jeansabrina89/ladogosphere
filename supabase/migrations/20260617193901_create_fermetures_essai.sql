create table if not exists public.fermetures_essai (
  id uuid primary key default gen_random_uuid(),
  date_debut date not null,
  date_fin date not null,
  motif text,
  created_at timestamptz not null default now(),
  constraint fermetures_essai_dates_ok check (date_fin >= date_debut)
);

-- RLS activée sans policy : accès uniquement via service_role
-- (server actions + API route via supabaseAdmin). Aucun accès direct client/employé.
alter table public.fermetures_essai enable row level security;
