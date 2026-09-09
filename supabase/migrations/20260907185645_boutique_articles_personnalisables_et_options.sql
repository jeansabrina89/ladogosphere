-- Articles personnalisables : catalogue d'options, et commandes sur mesure.
-- Un article personnalisable ne suit pas de stock de produit fini : ce qui se
-- décompte, ce sont ses composants (sangle, bouclerie, puce NFC).

alter table public.articles
  add column if not exists type_article text not null default 'standard',
  add column if not exists delai_fabrication_jours integer,
  add column if not exists composant boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'articles_type_article_check') then
    alter table public.articles
      add constraint articles_type_article_check
      check (type_article in ('standard','personnalisable'));
  end if;
end $$;

comment on column public.articles.composant is
  'Fourniture qui se stocke mais ne se vend pas seule : ni vitrine, ni caisse.';
comment on column public.articles.type_article is
  'personnalisable : pas de stock de produit fini, le stock_actuel reste à zéro.';

-- ── Catalogue d'options ─────────────────────────────────────────────────────

create table if not exists public.options_groupes (
  id             uuid primary key default gen_random_uuid(),
  article_id     uuid not null references public.articles(id) on delete cascade,
  nom            text not null,
  type           text not null check (type in ('liste','couleur','texte','booleen')),
  obligatoire    boolean not null default true,
  ordre          integer not null default 0,
  aide           text,
  max_caracteres integer,
  created_at     timestamptz not null default now()
);

create index if not exists options_groupes_article_idx
  on public.options_groupes (article_id, ordre);

create table if not exists public.options_valeurs (
  id                     uuid primary key default gen_random_uuid(),
  groupe_id              uuid not null references public.options_groupes(id) on delete cascade,
  libelle                text not null,
  image_path             text,
  code_couleur           text,
  supplement_prix        numeric not null default 0,
  supplement_delai_jours integer not null default 0,
  composant_article_id   uuid references public.articles(id) on delete set null,
  composant_quantite     numeric,
  actif                  boolean not null default true,
  ordre                  integer not null default 0,
  defaut                 boolean not null default false,
  created_at             timestamptz not null default now()
);

create index if not exists options_valeurs_groupe_idx
  on public.options_valeurs (groupe_id, ordre);

-- ── Commandes sur mesure ────────────────────────────────────────────────────

create table if not exists public.commandes_personnalisees (
  id                    uuid primary key default gen_random_uuid(),
  numero                text unique,
  vente_id              uuid references public.ventes(id) on delete restrict,
  client_id             uuid not null references public.clients(id) on delete restrict,
  article_id            uuid not null references public.articles(id) on delete restrict,
  prix_total            numeric not null default 0,
  delai_jours           integer not null default 0,
  date_promise          date,
  statut                text not null default 'a_faire'
                          check (statut in ('a_faire','en_cours','prete','remise','annulee')),
  notes                 text,
  exercice              integer,
  -- Les fournitures ne se décomptent qu'une fois, même si le statut fait
  -- des allers-retours entre « à faire » et « en cours ».
  composants_consommes  boolean not null default false,
  cle_idempotence       text unique,
  created_by            uuid,
  created_at            timestamptz not null default now()
);

create index if not exists commandes_statut_idx  on public.commandes_personnalisees (statut, date_promise);
create index if not exists commandes_client_idx  on public.commandes_personnalisees (client_id);
create index if not exists commandes_article_idx on public.commandes_personnalisees (article_id);

create table if not exists public.commandes_choix (
  id              uuid primary key default gen_random_uuid(),
  commande_id     uuid not null references public.commandes_personnalisees(id) on delete cascade,
  groupe_nom      text not null,
  valeur_libelle  text not null,
  valeur_texte    text,
  code_couleur    text,
  supplement_prix numeric not null default 0,
  ordre           integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists commandes_choix_commande_idx on public.commandes_choix (commande_id, ordre);

comment on table public.commandes_choix is
  'Copies figées au moment de la commande : modifier le catalogue d''options ne change jamais une commande passée.';

-- ── Inaltérabilité des choix ────────────────────────────────────────────────

create or replace function public.commandes_choix_inalterables()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_vente uuid;
  v_statut text;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Un choix de commande ne se modifie pas : il est figé au moment de la commande.';
  end if;

  select vente_id, statut into v_vente, v_statut
    from public.commandes_personnalisees where id = old.commande_id;
  -- Une commande jamais encaissée et jamais commencée peut encore être jetée.
  if found and (v_vente is not null or v_statut <> 'a_faire') then
    raise exception 'Un choix de commande ne se supprime pas : la commande est encaissée ou commencée.';
  end if;
  return old;
end;
$$;

drop trigger if exists commandes_choix_pas_de_maj on public.commandes_choix;
create trigger commandes_choix_pas_de_maj
  before update on public.commandes_choix
  for each row execute function public.commandes_choix_inalterables();

drop trigger if exists commandes_choix_pas_de_suppression on public.commandes_choix;
create trigger commandes_choix_pas_de_suppression
  before delete on public.commandes_choix
  for each row execute function public.commandes_choix_inalterables();

-- Une valeur citée par une commande ne se supprime pas : elle se désactive.
create or replace function public.options_valeurs_citees()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare v_article uuid;
begin
  select g.article_id into v_article
    from public.options_groupes g where g.id = old.groupe_id;

  if exists (
    select 1
      from public.commandes_choix c
      join public.commandes_personnalisees cp on cp.id = c.commande_id
      join public.options_groupes g on g.id = old.groupe_id
     where cp.article_id = v_article
       and c.groupe_nom = g.nom
       and c.valeur_libelle = old.libelle
  ) then
    raise exception 'Cette option est citée par une commande : désactivez-la, elle ne se supprime pas.';
  end if;
  return old;
end;
$$;

drop trigger if exists options_valeurs_pas_de_suppression on public.options_valeurs;
create trigger options_valeurs_pas_de_suppression
  before delete on public.options_valeurs
  for each row execute function public.options_valeurs_citees();

-- Un article personnalisable n'a pas de stock de produit fini.
create or replace function public.mouvement_refuse_sur_personnalisable()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare v_type text;
begin
  select type_article into v_type from public.articles where id = new.article_id;
  if v_type = 'personnalisable' then
    raise exception 'Un article personnalisable ne tient pas de stock : ce sont ses fournitures qui se décomptent.';
  end if;
  return new;
end;
$$;

drop trigger if exists mouvements_stock_pas_sur_personnalisable on public.mouvements_stock;
create trigger mouvements_stock_pas_sur_personnalisable
  before insert on public.mouvements_stock
  for each row execute function public.mouvement_refuse_sur_personnalisable();

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.options_groupes enable row level security;
alter table public.options_valeurs enable row level security;
alter table public.commandes_personnalisees enable row level security;
alter table public.commandes_choix enable row level security;

do $$
declare t text;
begin
  foreach t in array array['options_groupes','options_valeurs','commandes_personnalisees','commandes_choix'] loop
    execute format('drop policy if exists "%s lecture personnel" on public.%I', t, t);
    execute format('create policy "%s lecture personnel" on public.%I for select to authenticated using (public.is_personnel())', t, t);
    execute format('drop policy if exists "%s ecriture boutique" on public.%I', t, t);
    execute format('create policy "%s ecriture boutique" on public.%I for insert to authenticated with check (public.peut_boutique())', t, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

drop policy if exists "options_groupes maj boutique" on public.options_groupes;
create policy "options_groupes maj boutique" on public.options_groupes
  for update to authenticated using (public.peut_boutique()) with check (public.peut_boutique());
drop policy if exists "options_groupes suppression boutique" on public.options_groupes;
create policy "options_groupes suppression boutique" on public.options_groupes
  for delete to authenticated using (public.peut_boutique());

drop policy if exists "options_valeurs maj boutique" on public.options_valeurs;
create policy "options_valeurs maj boutique" on public.options_valeurs
  for update to authenticated using (public.peut_boutique()) with check (public.peut_boutique());
drop policy if exists "options_valeurs suppression boutique" on public.options_valeurs;
create policy "options_valeurs suppression boutique" on public.options_valeurs
  for delete to authenticated using (public.peut_boutique());

drop policy if exists "commandes maj boutique" on public.commandes_personnalisees;
create policy "commandes maj boutique" on public.commandes_personnalisees
  for update to authenticated using (public.peut_boutique()) with check (public.peut_boutique());

-- ── Vitrine ─────────────────────────────────────────────────────────────────
-- Les fournitures n'ont rien à y faire ; un article sur mesure est toujours
-- « disponible », il se fabrique.
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
  a.type_article,
  a.delai_fabrication_jours,
  (a.type_article = 'personnalisable' or a.stock_actuel > 0) as en_stock
from public.articles a
where a.actif = true
  and a.vendable_en_ligne = true
  and a.composant = false;

revoke all on public.articles_vitrine from public;
grant select on public.articles_vitrine to anon, authenticated;

comment on view public.articles_vitrine is
  'Catalogue public du site vitrine. Lecture anonyme. Jamais de prix d''achat, de stock chiffré, de fournisseur ni de taux de TVA. Les fournitures en sont exclues.';

-- ── Bucket des photos de la boutique (correction d'APP 10) ──────────────────
-- Un bucket public sans filtre accepte un SVG, c'est-à-dire du script exécuté
-- chez le visiteur. Mêmes garde-fous que les photos de chiens.
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp'],
       file_size_limit = 5242880
 where id = 'boutique-photos';