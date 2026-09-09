-- ── APP 16 · A4 : la vitrine ne sert que ce qui est publié ────────────────
--
-- Le filtre est dans la VUE, pas à l'affichage : un brouillon ne doit fuir ni
-- son prix, ni sa photo, ni son nom — même pas dans le corps d'une réponse
-- HTTP. Un article masqué disparaît d'ici aussi, mais reste vendable au
-- comptoir : la caisse ne lit pas cette vue.
--
-- `date_limite` s'ajoute en fin de liste : c'est elle qui porte
-- « À écouler avant le 12 octobre » sur la fiche d'un anti-gaspillage.

create or replace view articles_vitrine as
select
  a.id,
  a.reference,
  a.nom,
  a.description,
  a.categorie,
  array_position(array[
    'alimentation_seche','alimentation_humide','friandises','mastication','litiere',
    'colliers','laisses','harnais','muselieres','longes','jouets','peluches',
    'couchages','soins','medaillons_accessoires','divers'
  ], a.categorie) as ordre_categorie,
  a.marque,
  a.prix_vente,
  a.unite,
  a.photo_path,
  a.type_article,
  a.delai_fabrication_jours,
  a.expediable,
  a.poids_grammes,
  greatest(a.stock_actuel - a.stock_reserve, 0) as stock_disponible,
  a.type_article = 'personnalisable' or (a.stock_actuel - a.stock_reserve) > 0 as en_stock,
  a.date_limite,
  a.remise_membre_exclue
from articles a
where a.actif = true
  and a.vendable_en_ligne = true
  and a.composant = false
  and a.statut_vitrine = 'publie'
  and (a.date_publication is null or a.date_publication <= now());