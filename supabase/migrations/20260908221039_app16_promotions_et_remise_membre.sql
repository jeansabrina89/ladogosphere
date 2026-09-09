-- ── APP 16 · B7 : les trois rubriques ──────────────────────────────────────
--
-- Une rubrique est une VITRINE avec, parfois, un prix. « Nouveautés » n'a pas
-- de pourcentage : elle met en avant, elle ne remise pas. « Action du mois » et
-- « Anti-gaspillage » en ont un, obligatoirement.

create table if not exists promotions (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  type text not null check (type in ('nouveaute', 'action', 'anti_gaspillage')),
  pourcentage numeric null check (pourcentage is null or (pourcentage > 0 and pourcentage <= 100)),
  date_debut date not null,
  date_fin date not null,
  cible text not null default 'tous' check (cible in ('tous', 'membres')),
  texte text null,
  actif boolean not null default true,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid null,
  -- Une action sans pourcentage ne remise rien ; une nouveauté avec un
  -- pourcentage ferait deux choses à la fois. La base le refuse.
  constraint promotions_pourcentage_selon_type check (
    (type = 'nouveaute' and pourcentage is null)
    or (type in ('action', 'anti_gaspillage') and pourcentage is not null)
  ),
  constraint promotions_periode check (date_fin >= date_debut)
);

comment on table promotions is
  'Rubriques de la boutique : Nouveautés (mise en avant seule), Action du mois et Anti-gaspillage (remise). Une rubrique passée ne se supprime pas : elle se désactive et reste consultable.';

create table if not exists promotions_articles (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references promotions (id) on delete cascade,
  article_id uuid not null references articles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (promotion_id, article_id)
);

create index if not exists idx_promotions_articles_article on promotions_articles (article_id);
create index if not exists idx_promotions_periode on promotions (actif, date_debut, date_fin);

-- ── APP 16 · C16 bis : la remise membre, catégorie par catégorie ───────────
--
-- 0 % ou inactive : la catégorie est EXCLUE. Annoncer une remise qui ne
-- s'applique pas est pire que ne rien annoncer.

create table if not exists remise_membre_categories (
  categorie text primary key,
  pourcentage numeric not null default 10 check (pourcentage >= 0 and pourcentage <= 100),
  actif boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table remise_membre_categories is
  'Remise d''adhésion par catégorie d''articles. Reprise : toutes les catégories à 10 % et actives, ce qui est le régime en vigueur.';

-- Reprise : les seize catégories du magasin, à 10 %, actives.
insert into remise_membre_categories (categorie, pourcentage, actif)
select c, 10, true
from unnest(array[
  'alimentation_seche', 'alimentation_humide', 'friandises', 'mastication',
  'litiere', 'colliers', 'laisses', 'harnais', 'muselieres', 'longes',
  'jouets', 'peluches', 'couchages', 'soins', 'medaillons_accessoires', 'divers'
]) as c
on conflict (categorie) do nothing;