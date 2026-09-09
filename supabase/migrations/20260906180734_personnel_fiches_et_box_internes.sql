-- Chiens du personnel et box internes.
--
-- Un membre du personnel (employé ou admin) a AU PLUS une fiche `clients`,
-- marquée `interne`, rattachée à son compte pro par le même chemin qu'un
-- client : clients.auth_user_id = profiles.id. Ses réservations sont gratuites
-- et validées d'office, et ses chiens vont de préférence dans un box interne.
--
-- Aucun box n'est créé ni marqué ici : tant qu'aucun box n'est `interne`, le
-- comportement est rigoureusement identique à aujourd'hui.
begin;

-- ---------------------------------------------------------------------------
-- 1. Fiche du personnel
-- ---------------------------------------------------------------------------
alter table public.clients
  add column if not exists interne boolean not null default false;

comment on column public.clients.interne is
  'Fiche du personnel (employé ou admin) : réservations gratuites, validées d''office, sans cotisation.';

-- ---------------------------------------------------------------------------
-- 2. Suivi admin des réservations du personnel
-- ---------------------------------------------------------------------------
alter table public.reservations
  add column if not exists vue_admin_le timestamptz;

comment on column public.reservations.vue_admin_le is
  'Horodatage du « Marquer comme vues » côté admin (réservations du personnel). NULL = à voir.';

-- ---------------------------------------------------------------------------
-- 3. Box internes
-- ---------------------------------------------------------------------------
alter table public.boxes
  add column if not exists interne boolean not null default false,
  add column if not exists proprietaire_client_id uuid references public.clients(id) on delete set null;

comment on column public.boxes.interne is
  'Box réservé au personnel / à la pension : exclu des suggestions et de la capacité client.';
comment on column public.boxes.proprietaire_client_id is
  'Fiche interne du membre du personnel dont c''est le box. NULL = box de la pension, jamais attribué automatiquement.';

-- Un box interne appartient à une fiche INTERNE (ou à personne).
create index if not exists idx_boxes_proprietaire_client_id
  on public.boxes (proprietaire_client_id)
  where proprietaire_client_id is not null;

-- Réservations du personnel restant à voir : requête du badge admin.
create index if not exists idx_reservations_vue_admin_le
  on public.reservations (vue_admin_le)
  where vue_admin_le is null;

commit;
