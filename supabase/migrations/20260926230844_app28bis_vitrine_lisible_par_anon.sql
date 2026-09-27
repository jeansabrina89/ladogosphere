-- APP 28-BIS : la vitrine redevient lisible par un visiteur.
--
-- ── LA PANNE, ET CE QU'ELLE A COÛTÉ ───────────────────────────────────────
--
-- Depuis APP 26 (20260926174434), la vue `articles_vitrine` appelait
-- `delai_commande_effectif(a.id)` dans un LEFT JOIN LATERAL. Cette fonction est
-- fermée à `anon` et `authenticated` — comme toute fonction du dépôt, et c'est la
-- bonne règle.
--
-- Conséquence : la vue elle-même est devenue illisible pour ces deux rôles.
--
--   begin; set local role anon; select count(*) from articles_vitrine;
--   → ERROR 42501: permission denied for function delai_commande_effectif
--
-- Le site vitrine, qui lit avec la clé publique, affichait « La boutique est
-- momentanément indisponible ». Pendant un jour entier, la boutique n'existait
-- plus pour personne d'autre que nous.
--
-- ── LA LEÇON, QUI N'ÉTAIT PAS ÉVIDENTE ────────────────────────────────────
--
-- La vue est `security_invoker = false`, donc SECURITY DEFINER : elle lit
-- `articles` avec les droits de son propriétaire, et c'est pour cela qu'un
-- visiteur peut la consulter alors qu'il n'a aucun droit sur `articles`.
--
-- Mais ce report de droits ne vaut QUE POUR LES TABLES. Le privilège EXECUTE
-- d'une fonction est vérifié avec le rôle COURANT, pas avec celui du
-- propriétaire de la vue. Une vue SECURITY DEFINER qui appelle une fonction
-- fermée est donc fermée elle aussi — et rien ne le signale à l'écriture.
--
-- C'est exactement le genre de chose qu'aucune relecture ne rattrape : la
-- migration d'APP 26 était juste, la fonction était bien fermée, et la vue
-- fonctionnait parfaitement avec la clé de service. C'est le test manquant qui
-- l'a laissée passer — aucun test ne lisait la vue avec le rôle `anon`.
--
-- ── LA CORRECTION : DANS LA VUE, PAS DANS LES DROITS ──────────────────────
--
-- Ouvrir `delai_commande_effectif` à `anon` aurait réparé l'écran et ouvert une
-- porte : la fonction est appelable par `/rest/v1/rpc/delai_commande_effectif`
-- avec la clé publique du site, et elle rend le délai de N'IMPORTE QUEL article,
-- y compris un article NON commandable — ce que la vue refuse justement de
-- publier depuis APP 27. On aurait rendu par RPC ce qu'on venait de retirer de la
-- vue.
--
-- Le calcul est donc écrit DANS la vue. Il tient en deux `coalesce` : le délai de
-- l'article s'il en a un, sinon celui de son fournisseur. La jointure sur
-- `fournisseurs` est couverte par le propriétaire de la vue (postgres, vérifié) —
-- c'est une TABLE, donc le report de droits s'applique.
--
-- Le NOM du fournisseur ne sort toujours pas : seules ses deux colonnes de délai
-- sont lues, et aucune n'apparaît dans la liste des colonnes rendues.
--
-- La fonction `delai_commande_effectif` RESTE : `confirmer_commande` s'en sert
-- pour figer le délai sur la ligne de commande. Deux endroits calculent donc le
-- même délai, et c'est le seul moyen d'éviter la panne — mais un test compare
-- désormais les deux, article par article, à chaque exécution de la suite.
--
-- La définition ci-dessous part de `pg_get_viewdef`, jamais de la mémoire :
-- `ordre_categorie` et `en_stock` sont des expressions calculées, le filtre porte
-- cinq conditions, et la liste des rayons compte dix-neuf valeurs dans un ordre
-- qui n'est pas l'alphabet.

create or replace view public.articles_vitrine
with (security_invoker = false) as
select
  a.id,
  a.reference,
  a.nom,
  a.description,
  a.categorie,
  array_position(
    array['alimentation_seche', 'alimentation_humide', 'alimentation_complete',
          'friandises', 'mastication', 'litiere',
          'colliers', 'laisses', 'harnais', 'muselieres', 'longes',
          'jouets', 'peluches', 'griffoirs',
          'couchages', 'cages_enclos',
          'soins', 'medaillons_accessoires', 'divers']::text[],
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
  a.type_article = 'personnalisable' or (a.stock_actuel - a.stock_reserve) > 0::numeric as en_stock,
  a.date_limite,
  a.remise_membre_exclue,
  a.ages,
  a.besoins,
  a.tailles_chien,
  a.proteines,
  a.sans_cereales,
  a.monoproteine,
  a.taille_article,
  a.couleurs,
  a.matieres,
  a.usages_jouet,
  a.gouts,
  a.disponible_sur_commande and d.max_jours is not null as sur_commande,
  -- Le délai ne sort QUE s'il est promis : même condition que `sur_commande`
  -- (reliquat d'APP 26, fermé à APP 27 — voir 20260926193439).
  case when a.disponible_sur_commande and d.max_jours is not null
       then d.min_jours end as delai_commande_min_jours,
  case when a.disponible_sur_commande and d.max_jours is not null
       then d.max_jours end as delai_commande_max_jours,
  a.animaux,
  a.especes,
  a.types_soin
from public.articles a
-- Le fournisseur, pour son délai et pour rien d'autre. C'est une TABLE : le
-- report de droits de la vue SECURITY DEFINER s'y applique, contrairement à
-- l'EXECUTE d'une fonction.
left join public.fournisseurs f on f.id = a.fournisseur_id
-- Le délai effectif, nommé une fois : celui de l'article s'il en a un, sinon
-- celui de son fournisseur. Le nom `d` est celui qu'avait la fonction, pour que
-- les trois expressions au-dessus n'aient pas eu à changer d'un caractère.
left join lateral (
  select coalesce(a.delai_commande_min_jours, f.delai_commande_min_jours) as min_jours,
         coalesce(a.delai_commande_max_jours, f.delai_commande_max_jours) as max_jours
) d on true
where a.actif = true
  and a.vendable_en_ligne = true
  and a.composant = false
  and a.statut_vitrine = 'publie'
  and (a.date_publication is null or a.date_publication <= now());

revoke all on public.articles_vitrine from anon, authenticated;
grant select on public.articles_vitrine to anon, authenticated;
