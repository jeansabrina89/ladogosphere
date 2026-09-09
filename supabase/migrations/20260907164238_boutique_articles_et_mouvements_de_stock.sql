-- Boutique, premier volet : catalogue d'articles et stock en quantités.
-- Le stock ne se saisit jamais : il découle des mouvements, append-only.

-- 1. Permission ─────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists perm_boutique boolean not null default false;

create or replace function public.peut_boutique()
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and actif is not false
      and (role = 'admin' or (role = 'employe' and perm_boutique))
  );
$$;

-- 2. Articles ───────────────────────────────────────────────────────────────
create table if not exists public.articles (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,
  nom               text not null,
  description       text,
  categorie         text not null check (categorie in (
                      'alimentation','friandises','litiere','jouets','peluches',
                      'laisses_harnais','couchages','soins','divers')),
  marque            text,
  fournisseur_id    uuid references public.fournisseurs(id) on delete set null,
  taux_tva          numeric not null,
  prix_vente        numeric not null check (prix_vente >= 0),
  prix_achat        numeric check (prix_achat >= 0),
  stock_actuel      numeric not null default 0,
  stock_alerte      numeric default 0,
  unite             text not null default 'pièce',
  code_barres       text,
  photo_path        text,
  actif             boolean not null default true,
  vendable_en_ligne boolean not null default true,
  created_at        timestamptz not null default now()
);

create unique index if not exists articles_code_barres_unique
  on public.articles (code_barres)
  where code_barres is not null and code_barres <> '';
create index if not exists articles_categorie_idx   on public.articles (categorie);
create index if not exists articles_fournisseur_idx on public.articles (fournisseur_id);

comment on column public.articles.stock_actuel is
  'Tenu par trigger depuis mouvements_stock. Jamais modifiable directement.';

-- Référence ART-0001, attribuée seulement si elle n''est pas saisie.
create sequence if not exists public.articles_reference_seq;

create or replace function public.attribuer_reference_article()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare v_ref text;
begin
  if new.code_barres is not null and btrim(new.code_barres) = '' then
    new.code_barres := null;
  end if;

  if new.reference is null or btrim(new.reference) = '' then
    loop
      v_ref := 'ART-' || lpad(nextval('public.articles_reference_seq')::text, 4, '0');
      exit when not exists (select 1 from public.articles where reference = v_ref);
    end loop;
    new.reference := v_ref;
  else
    new.reference := btrim(new.reference);
  end if;
  return new;
end;
$$;

drop trigger if exists articles_reference on public.articles;
create trigger articles_reference
  before insert on public.articles
  for each row execute function public.attribuer_reference_article();

-- Le stock ne se corrige pas à la main : il passe par un mouvement.
create or replace function public.articles_stock_non_modifiable()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.code_barres is not null and btrim(new.code_barres) = '' then
    new.code_barres := null;
  end if;
  if new.stock_actuel is distinct from old.stock_actuel
     and coalesce(current_setting('app.stock_via_mouvement', true), 'off') <> 'on' then
    raise exception 'Le stock ne se modifie pas directement : passez par un mouvement de stock.';
  end if;
  return new;
end;
$$;

drop trigger if exists articles_stock_garde on public.articles;
create trigger articles_stock_garde
  before update on public.articles
  for each row execute function public.articles_stock_non_modifiable();

-- 3. Mouvements de stock ────────────────────────────────────────────────────
create table if not exists public.mouvements_stock (
  id              uuid primary key default gen_random_uuid(),
  article_id      uuid not null references public.articles(id) on delete restrict,
  type            text not null check (type in (
                    'entree','vente','ajustement','perte','usage_interne','retour')),
  quantite        numeric not null check (quantite <> 0),
  quantite_apres  numeric,
  motif           text,
  depense_id      uuid references public.depenses(id) on delete restrict,
  vente_id        uuid,                       -- réservé pour la caisse (APP 11)
  date_peremption date,
  user_id         uuid,
  created_at      timestamptz not null default now()
);

create index if not exists mouvements_stock_article_idx on public.mouvements_stock (article_id, created_at desc);
create index if not exists mouvements_stock_depense_idx on public.mouvements_stock (depense_id);

comment on table public.mouvements_stock is
  'Append-only : ni mise à jour ni suppression. Une erreur se corrige par un mouvement inverse motivé.';

create or replace function public.appliquer_mouvement_stock()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_stock numeric;
  v_apres numeric;
begin
  if new.motif is not null and btrim(new.motif) = '' then
    new.motif := null;
  end if;
  if new.type in ('ajustement','perte','usage_interne') and new.motif is null then
    raise exception 'Indiquez le motif du mouvement.';
  end if;

  select stock_actuel into v_stock
    from public.articles where id = new.article_id for update;
  if not found then
    raise exception 'Article introuvable.';
  end if;

  v_apres := v_stock + new.quantite;

  -- Aucun stock négatif silencieux. Seul l''ajustement d''inventaire fait foi :
  -- ce qui est compté dans le local prime sur ce que dit la base.
  if v_apres < 0 and new.type <> 'ajustement' then
    raise exception 'Stock insuffisant : il reste % en stock, la sortie demandée est de %.',
      trim(to_char(v_stock, 'FM999999990.999')),
      trim(to_char(abs(new.quantite), 'FM999999990.999'));
  end if;

  new.quantite_apres := v_apres;

  perform set_config('app.stock_via_mouvement', 'on', true);
  update public.articles set stock_actuel = v_apres where id = new.article_id;
  perform set_config('app.stock_via_mouvement', 'off', true);

  return new;
end;
$$;

drop trigger if exists mouvements_stock_appliquer on public.mouvements_stock;
create trigger mouvements_stock_appliquer
  before insert on public.mouvements_stock
  for each row execute function public.appliquer_mouvement_stock();

create or replace function public.mouvements_stock_inalterables()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  raise exception 'Un mouvement de stock ne se modifie ni ne se supprime : passez un mouvement inverse motivé.';
end;
$$;

drop trigger if exists mouvements_stock_pas_de_maj on public.mouvements_stock;
create trigger mouvements_stock_pas_de_maj
  before update on public.mouvements_stock
  for each row execute function public.mouvements_stock_inalterables();

drop trigger if exists mouvements_stock_pas_de_suppression on public.mouvements_stock;
create trigger mouvements_stock_pas_de_suppression
  before delete on public.mouvements_stock
  for each row execute function public.mouvements_stock_inalterables();

-- 4. RLS ────────────────────────────────────────────────────────────────────
alter table public.articles enable row level security;
alter table public.mouvements_stock enable row level security;

drop policy if exists "articles lecture personnel" on public.articles;
create policy "articles lecture personnel" on public.articles
  for select to authenticated using (public.is_personnel());

drop policy if exists "articles creation boutique" on public.articles;
create policy "articles creation boutique" on public.articles
  for insert to authenticated with check (public.peut_boutique());

drop policy if exists "articles modification boutique" on public.articles;
create policy "articles modification boutique" on public.articles
  for update to authenticated using (public.peut_boutique()) with check (public.peut_boutique());

drop policy if exists "articles suppression boutique" on public.articles;
create policy "articles suppression boutique" on public.articles
  for delete to authenticated using (public.peut_boutique());

drop policy if exists "mouvements lecture personnel" on public.mouvements_stock;
create policy "mouvements lecture personnel" on public.mouvements_stock
  for select to authenticated using (public.is_personnel());

drop policy if exists "mouvements creation boutique" on public.mouvements_stock;
create policy "mouvements creation boutique" on public.mouvements_stock
  for insert to authenticated with check (public.peut_boutique());
-- Volontairement aucune policy UPDATE ni DELETE : personne, jamais.

revoke all on public.articles from anon;
revoke all on public.mouvements_stock from anon;

-- 5. Vitrine publique ───────────────────────────────────────────────────────
-- Vue en security definer (security_invoker = false) : c''est elle, et elle
-- seule, qui est ouverte à l''anonyme. La table articles reste fermée, et
-- aucune colonne de gestion (prix d''achat, stock, fournisseur, taux) ne sort.
drop view if exists public.articles_vitrine;
create view public.articles_vitrine
with (security_invoker = false) as
select
  a.reference,
  a.nom,
  a.description,
  a.categorie,
  a.marque,
  a.prix_vente,
  a.unite,
  a.photo_path,
  (a.stock_actuel > 0) as en_stock
from public.articles a
where a.actif = true
  and a.vendable_en_ligne = true;

revoke all on public.articles_vitrine from public;
grant select on public.articles_vitrine to anon, authenticated;

comment on view public.articles_vitrine is
  'Catalogue public du site vitrine. Lecture anonyme. Jamais de prix d''achat, de stock chiffré, de fournisseur ni de taux de TVA.';

-- 6. Comptes et paramètre ───────────────────────────────────────────────────
insert into public.comptes (numero, libelle, type)
select '1200', 'Stock de marchandises', 'actif'
where not exists (select 1 from public.comptes where numero = '1200');

insert into public.comptes (numero, libelle, type)
select '3200', 'Ventes boutique', 'produit'
where not exists (select 1 from public.comptes where numero = '3200');

insert into public.parametres (cle, valeur, description)
values ('compte_stock', '1200', 'Compte de stock de marchandises (boutique)')
on conflict (cle) do nothing;

-- 7. Bucket public des photos de la vitrine ─────────────────────────────────
insert into storage.buckets (id, name, public)
values ('boutique-photos', 'boutique-photos', true)
on conflict (id) do nothing;