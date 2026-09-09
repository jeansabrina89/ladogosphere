-- APP 13j — La vitrine devient la source du catalogue public.
--
-- `articles_vitrine` ne portait pas l'identifiant de l'article : impossible d'y
-- accrocher un lien vers une fiche produit. On l'ajoute — un uuid ne dit rien
-- de la marge ni du fournisseur.
--
-- Le reste de la vue ne bouge pas : ce sont ses colonnes, et elles seules, qui
-- partent vers un visiteur sans compte. Ajouter une colonne en tête oblige à
-- recréer la vue (Postgres refuse de renommer une colonne existante).

drop view if exists public.articles_vitrine;

create view public.articles_vitrine as
  select
    a.id,
    a.reference,
    a.nom,
    a.description,
    a.categorie,
    array_position(
      array['alimentation_seche','alimentation_humide','friandises','mastication',
            'litiere','colliers','laisses','harnais','muselieres','longes','jouets',
            'peluches','couchages','soins','medaillons_accessoires','divers'],
      a.categorie
    ) as ordre_categorie,
    a.marque,
    a.prix_vente,
    a.unite,
    a.photo_path,
    a.type_article,
    a.delai_fabrication_jours,
    a.expediable,
    a.poids_grammes,
    greatest(a.stock_actuel - a.stock_reserve, 0::numeric) as stock_disponible,
    (a.type_article = 'personnalisable' or (a.stock_actuel - a.stock_reserve) > 0) as en_stock
  from public.articles a
  where a.actif = true and a.vendable_en_ligne = true and a.composant = false;

comment on view public.articles_vitrine is
  'Le catalogue tel qu''un visiteur sans compte peut le voir. Ni prix d''achat, ni marge, ni fournisseur. stock_disponible reste pour l''usage interne : le public ne lit que en_stock.';

grant select on public.articles_vitrine to anon, authenticated;