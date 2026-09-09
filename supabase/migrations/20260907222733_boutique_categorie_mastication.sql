-- « Mastication » : bois de cerf, oreilles et peaux séchées, bâtonnets, cornes.
-- C'est de l'alimentaire (2,6 %), à ne pas confondre avec un objet à mâcher
-- non comestible, qui reste un jouet à 8,1 %. La place dans le tableau ci-
-- dessous est l'ordre du magasin, juste après Friandises — le même ordre que
-- CATEGORIES_ARTICLE dans boutiqueLogique.ts, dont cette vue est le reflet.
alter table public.articles drop constraint if exists articles_categorie_check;
alter table public.articles add constraint articles_categorie_check
  check (categorie = any (array[
    'alimentation', 'friandises', 'mastication', 'litiere',
    'colliers', 'laisses', 'harnais', 'muselieres', 'longes',
    'jouets', 'peluches', 'couchages', 'soins', 'medaillons_accessoires', 'divers'
  ]));

create or replace view public.articles_vitrine as
  select reference,
         nom,
         description,
         categorie,
         array_position(array[
           'alimentation', 'friandises', 'mastication', 'litiere',
           'colliers', 'laisses', 'harnais', 'muselieres', 'longes',
           'jouets', 'peluches', 'couchages', 'soins', 'medaillons_accessoires', 'divers'
         ], categorie) as ordre_categorie,
         marque,
         prix_vente,
         unite,
         photo_path,
         type_article,
         delai_fabrication_jours,
         type_article = 'personnalisable' or stock_actuel > 0::numeric as en_stock
    from articles a
   where actif = true and vendable_en_ligne = true and composant = false;