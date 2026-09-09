-- Caisse au comptoir : ventes, lignes figées et retours.
-- Une vente finalisée ne se modifie pas et ne se supprime pas : elle s'annule
-- par un retour, qui est lui-même une vente négative, numérotée et tracée.

create table if not exists public.ventes (
  id               uuid primary key default gen_random_uuid(),
  numero           text unique,
  date_vente       timestamptz not null default now(),
  canal            text not null default 'comptoir' check (canal in ('comptoir','en_ligne')),
  client_id        uuid references public.clients(id) on delete set null,
  montant_total    numeric not null default 0,
  mode_reglement   text check (mode_reglement in ('especes','twint','carte','facture_client')),
  arrondi          numeric not null default 0,
  facture_id       uuid references public.factures(id) on delete set null,
  statut           text not null default 'finalisee' check (statut in ('finalisee','annulee')),
  vendu_par        uuid,
  -- Un retour porte la vente qu'il corrige, et son motif. C'est ce qui le
  -- distingue d'une vente : il n'y a pas d'autre marqueur à tenir à jour.
  vente_origine_id uuid references public.ventes(id) on delete restrict,
  motif            text,
  exercice         integer,
  ecriture_id      uuid,
  cle_idempotence  text unique,
  created_at       timestamptz not null default now()
);

create index if not exists ventes_date_idx     on public.ventes (date_vente desc);
create index if not exists ventes_origine_idx  on public.ventes (vente_origine_id);
create index if not exists ventes_facture_idx  on public.ventes (facture_id);
create index if not exists ventes_client_idx   on public.ventes (client_id);

comment on table public.ventes is
  'Ventes de la boutique. Append-only après finalisation : seul le passage au statut annulee, par retour intégral, est permis.';
comment on column public.ventes.vente_origine_id is
  'Renseigné sur un retour : la vente qu''il corrige. Une ligne sans origine est une vente.';

create table if not exists public.ventes_lignes (
  id            uuid primary key default gen_random_uuid(),
  vente_id      uuid not null references public.ventes(id) on delete restrict,
  article_id    uuid references public.articles(id) on delete restrict,
  -- Libellé, prix et taux sont COPIÉS au moment de la vente : modifier
  -- l'article plus tard ne change jamais un ticket passé.
  libelle       text not null,
  quantite      numeric not null check (quantite <> 0),
  prix_unitaire numeric not null,
  taux_tva      numeric not null default 0,
  montant       numeric not null,
  created_at    timestamptz not null default now()
);

create index if not exists ventes_lignes_vente_idx   on public.ventes_lignes (vente_id);
create index if not exists ventes_lignes_article_idx on public.ventes_lignes (article_id);

-- Le mouvement de stock d'une vente pointe désormais vraiment sa vente.
alter table public.mouvements_stock
  drop constraint if exists mouvements_stock_vente_id_fkey;
alter table public.mouvements_stock
  add constraint mouvements_stock_vente_id_fkey
  foreign key (vente_id) references public.ventes(id) on delete restrict;
create index if not exists mouvements_stock_vente_idx on public.mouvements_stock (vente_id);

-- ── Inaltérabilité ──────────────────────────────────────────────────────────

create or replace function public.ventes_inalterables()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Une vente ne se supprime pas : elle s''annule par un retour.';
  end if;

  -- Seule évolution permise : la vente entièrement rendue passe à « annulee ».
  if new.statut is distinct from old.statut then
    if not (old.statut = 'finalisee' and new.statut = 'annulee') then
      raise exception 'Le statut d''une vente ne va que de « finalisee » à « annulee ».';
    end if;
  end if;

  if row(new.*) is distinct from row(
       old.id, old.numero, old.date_vente, old.canal, old.client_id, old.montant_total,
       old.mode_reglement, old.arrondi, old.facture_id, new.statut, old.vendu_par,
       old.vente_origine_id, coalesce(new.motif, old.motif), old.exercice, old.ecriture_id,
       old.cle_idempotence, old.created_at) then
    raise exception 'Une vente finalisée ne se modifie pas : passez un retour motivé.';
  end if;

  return new;
end;
$$;

drop trigger if exists ventes_pas_de_modification on public.ventes;
create trigger ventes_pas_de_modification
  before update on public.ventes
  for each row execute function public.ventes_inalterables();

drop trigger if exists ventes_pas_de_suppression on public.ventes;
create trigger ventes_pas_de_suppression
  before delete on public.ventes
  for each row execute function public.ventes_inalterables();

create or replace function public.ventes_lignes_inalterables()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  raise exception 'Une ligne de vente ne se modifie ni ne se supprime : elle est figée au moment de la vente.';
end;
$$;

drop trigger if exists ventes_lignes_pas_de_maj on public.ventes_lignes;
create trigger ventes_lignes_pas_de_maj
  before update on public.ventes_lignes
  for each row execute function public.ventes_lignes_inalterables();

drop trigger if exists ventes_lignes_pas_de_suppression on public.ventes_lignes;
create trigger ventes_lignes_pas_de_suppression
  before delete on public.ventes_lignes
  for each row execute function public.ventes_lignes_inalterables();

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.ventes enable row level security;
alter table public.ventes_lignes enable row level security;

drop policy if exists "ventes lecture personnel" on public.ventes;
create policy "ventes lecture personnel" on public.ventes
  for select to authenticated using (public.is_personnel());

drop policy if exists "ventes creation boutique" on public.ventes;
create policy "ventes creation boutique" on public.ventes
  for insert to authenticated with check (public.peut_boutique());

drop policy if exists "ventes lignes lecture personnel" on public.ventes_lignes;
create policy "ventes lignes lecture personnel" on public.ventes_lignes
  for select to authenticated using (public.is_personnel());

drop policy if exists "ventes lignes creation boutique" on public.ventes_lignes;
create policy "ventes lignes creation boutique" on public.ventes_lignes
  for insert to authenticated with check (public.peut_boutique());
-- Volontairement aucune policy UPDATE ni DELETE : personne, jamais.

revoke all on public.ventes from anon;
revoke all on public.ventes_lignes from anon;