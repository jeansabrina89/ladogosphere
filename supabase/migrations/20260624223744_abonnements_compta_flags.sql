alter table public.abonnements add column if not exists compta_synchronisee boolean not null default true;
alter table public.abonnements add column if not exists compta_erreur text;
alter table public.abonnements add column if not exists compta_sync_at timestamptz;
