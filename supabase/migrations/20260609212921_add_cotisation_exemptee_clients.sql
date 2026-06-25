alter table public.clients
  add column if not exists cotisation_exemptee boolean not null default false,
  add column if not exists cotisation_exemptee_raison text;
