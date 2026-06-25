-- Lot A : tracabilite de la synchro comptable sur la reservation
alter table public.reservations add column if not exists compta_synchronisee boolean not null default true;
alter table public.reservations add column if not exists compta_erreur text;
alter table public.reservations add column if not exists compta_sync_at timestamptz;

-- Lot A : idempotence des paiements (anti double-clic) — table append-only, on ajoute une cle
alter table public.paiements_resa add column if not exists cle_idempotence text;
create unique index if not exists uq_paiements_resa_idempotence
  on public.paiements_resa(reservation_id, cle_idempotence)
  where cle_idempotence is not null;

-- Lot B : journal des emails envoyes (historique + erreurs)
create table if not exists public.emails_envoyes (
  id uuid primary key default gen_random_uuid(),
  destinataire text not null,
  type text not null,
  sujet text,
  statut text not null default 'envoye',
  resend_id text,
  erreur text,
  reservation_id uuid,
  created_at timestamptz not null default now()
);
alter table public.emails_envoyes enable row level security;
drop policy if exists admin_all_emails_envoyes on public.emails_envoyes;
create policy admin_all_emails_envoyes on public.emails_envoyes
  for all to authenticated using (is_admin()) with check (is_admin());

-- #22 : amorcer les exercices (mecanisme de cloture)
insert into public.exercices(annee, statut)
select y, 'ouvert' from generate_series(2024, 2026) as y
where not exists (select 1 from public.exercices e where e.annee = y);
