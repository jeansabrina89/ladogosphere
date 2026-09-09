-- ── APP 16 · A1/A2/B10/C16 ter : la visibilité d'un article ────────────────
--
-- `actif` ne change pas de sens : il dit si l'article EXISTE ENCORE au
-- catalogue interne. `statut_vitrine` dit s'il SE MONTRE. Les deux se lisent
-- ensemble et jamais l'un pour l'autre : un article retiré (actif = false)
-- n'est plus vendu du tout ; un article masqué (statut_vitrine = 'masque')
-- se vend encore au comptoir, mais ne paraît plus en ligne.

alter table articles
  add column if not exists statut_vitrine text not null default 'publie',
  add column if not exists date_publication timestamptz null,
  add column if not exists publier_a_l_entree_stock boolean not null default false,
  add column if not exists date_limite date null,
  add column if not exists remise_membre_exclue boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'articles_statut_vitrine_check'
  ) then
    alter table articles
      add constraint articles_statut_vitrine_check
      check (statut_vitrine in ('brouillon', 'publie', 'masque'));
  end if;
end $$;

comment on column articles.statut_vitrine is
  'brouillon : invisible et invendable partout, y compris à la caisse. publie : visible et vendable. masque : invisible aux clients (catalogue public et boutique en ligne) mais vendable au comptoir. Distinct de `actif`, qui dit si l''article existe encore.';
comment on column articles.date_publication is
  'Avant cette date, l''article ne paraît pas en vitrine, même publié.';
comment on column articles.publier_a_l_entree_stock is
  'Publie le brouillon à la première entrée de stock qui le rend disponible.';
comment on column articles.date_limite is
  'Anti-gaspillage : « À écouler avant le … ».';
comment on column articles.remise_membre_exclue is
  'Cet article ne donne jamais droit à la remise membre, quelle que soit sa catégorie.';

-- La reprise est portée par le DEFAUT : tout ce qui existe est 'publie'.
create index if not exists idx_articles_statut_vitrine on articles (statut_vitrine);