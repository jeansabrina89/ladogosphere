-- Export annuel des pièces d'un exercice clos.
--
-- Le CO (art. 958f) impose dix ans de conservation, et l'Olico admet la forme
-- électronique. Le plan de stockage est limité à 1 Go : l'exercice clos part
-- vers un stockage tenu par la gérante, puis le bucket est purgé. Ces deux
-- tables portent la TRACE de cette opération, pas les fichiers.
--
-- Ce lot ne fabrique ni ne purge rien : les tables naissent vides et ne sont
-- écrites, pour l'instant, par aucun code. Elles existent pour que les lots
-- suivants aient où inscrire ce qu'ils font.

create table if not exists public.exports_comptables (
  id            uuid primary key default gen_random_uuid(),
  exercice      int not null,
  cree_le       timestamptz not null default now(),
  cree_par      uuid references auth.users,
  -- inventaire : mesuré. fabrique : archives faites. confirme : la gérante a
  -- vérifié les empreintes hors ligne. purge : le bucket a été allégé.
  etat          text not null check (etat in ('inventaire','fabrique','confirme','purge')),
  nb_factures   int,
  nb_pieces     int,
  octets_total  bigint,
  -- Un seul export par exercice : deux inventaires concurrents donneraient
  -- deux vérités sur ce qui a été conservé.
  unique (exercice)
);

create table if not exists public.exports_comptables_lots (
  id           uuid primary key default gen_random_uuid(),
  export_id    uuid not null references public.exports_comptables (id) on delete cascade,
  mois         int not null check (mois between 1 and 12),
  nom_archive  text,
  nb_fichiers  int,
  octets       bigint,
  sha256       text,
  fabrique_le  timestamptz,
  confirme_le  timestamptz,
  unique (export_id, mois)
);

create index if not exists idx_exports_lots_export on public.exports_comptables_lots (export_id);

comment on column public.exports_comptables_lots.sha256 is
  'Empreinte de l''ARCHIVE fabriquée pour ce mois, destinée à être comparée à celle du fichier détenu hors ligne par la gérante. Elle n''atteste PAS du contenu individuel des pièces : une pièce altérée avant la mise en archive donnerait la même empreinte.';

comment on table public.exports_comptables is
  'Trace des exports annuels de pièces comptables. Ne contient aucun fichier : seulement ce qui a été mesuré, fabriqué, confirmé, purgé.';

-- RLS : même politique que les autres tables d'administration comptable
-- (modèle repris de decomptes_tva, migration 20260908192918).
alter table public.exports_comptables enable row level security;
alter table public.exports_comptables_lots enable row level security;

drop policy if exists exports_comptables_admin on public.exports_comptables;
create policy exports_comptables_admin on public.exports_comptables
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists exports_comptables_lots_admin on public.exports_comptables_lots;
create policy exports_comptables_lots_admin on public.exports_comptables_lots
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
