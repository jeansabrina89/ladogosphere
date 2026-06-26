-- Modeles d'emails transactionnels personnalisables (repli sur defauts codes si null)
create table if not exists public.modeles_email (
  type text primary key,
  sujet text,
  titre text,
  intro text,
  message_final text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.modeles_email enable row level security;

drop policy if exists admin_all_modeles_email on public.modeles_email;
create policy admin_all_modeles_email on public.modeles_email
  for all to authenticated using (is_admin()) with check (is_admin());

-- Historique des envois groupes (messages aux membres / clients)
create table if not exists public.emails_campagnes (
  id uuid primary key default gen_random_uuid(),
  sujet text not null,
  corps text not null,
  cible text not null check (cible in ('membres_actifs','tous_clients')),
  nb_destinataires integer not null default 0,
  nb_echecs integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.emails_campagnes enable row level security;

drop policy if exists admin_all_emails_campagnes on public.emails_campagnes;
create policy admin_all_emails_campagnes on public.emails_campagnes
  for all to authenticated using (is_admin()) with check (is_admin());
