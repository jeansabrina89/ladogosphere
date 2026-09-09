-- L'ordre du magasin, tenu par src/lib/boutiqueLogique.ts, que la vue
-- transporte au site vitrine — un projet séparé, sans accès à ce fichier.
drop view if exists public.articles_vitrine;
create view public.articles_vitrine
with (security_invoker = false) as
select
  a.reference,
  a.nom,
  a.description,
  a.categorie,
  array_position(
    array['alimentation','friandises','litiere',
          'colliers','laisses','harnais','muselieres','longes',
          'jouets','peluches','couchages','soins','medaillons_accessoires','divers'],
    a.categorie) as ordre_categorie,
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
  'Catalogue public du site vitrine. Lecture anonyme. Jamais de prix d''achat, de stock chiffré, de fournisseur ni de taux de TVA. Les fournitures en sont exclues. ordre_categorie donne l''ordre du magasin.';