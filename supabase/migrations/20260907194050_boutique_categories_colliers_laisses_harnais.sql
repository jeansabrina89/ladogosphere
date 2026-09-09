-- « Laisses et harnais » était un fourre-tout : un collier, une laisse et un
-- harnais ne se rangent pas au même endroit dans le magasin, ni dans la tête
-- d'une cliente qui cherche.
--
-- Reprise : tout ce qui était en 'laisses_harnais' passe en 'laisses', et la
-- liste des articles touchés est remise à Sabrina pour qu'elle corrige à la
-- main ceux qui sont en réalité des colliers ou des harnais.

alter table public.articles drop constraint if exists articles_categorie_check;

update public.articles set categorie = 'laisses' where categorie = 'laisses_harnais';

alter table public.articles
  add constraint articles_categorie_check
  check (categorie in (
    'alimentation','friandises','litiere',
    'colliers','laisses','harnais',
    'jouets','peluches','couchages','soins','divers'));

-- L'ordre d'affichage suit la logique du magasin, pas l'alphabet. Il est tenu
-- par src/lib/boutiqueLogique.ts pour nos écrans ; la vue le transporte pour
-- le site vitrine, qui est un projet séparé et n'a pas accès à ce fichier.
drop view if exists public.articles_vitrine;
create view public.articles_vitrine
with (security_invoker = false) as
select
  a.reference,
  a.nom,
  a.description,
  a.categorie,
  array_position(
    array['alimentation','friandises','litiere','colliers','laisses','harnais',
          'jouets','peluches','couchages','soins','divers'],
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