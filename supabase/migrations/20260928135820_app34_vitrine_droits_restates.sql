-- APP 34 (suite immédiate) — la vitrine, réécrite dans le style du dépôt, avec
-- ses DROITS restatés.
--
-- ── POURQUOI CETTE SECONDE MIGRATION EXISTE ────────────────────────────────
--
-- La précédente (app34_rayons_complements_gamelles) a repris la définition de
-- la vue telle que `pg_get_viewdef` la rend. Elle marche : `create or replace
-- view` ne détruit pas la vue, donc les droits de `anon` et `authenticated` lui
-- ont survécu — vérifié, un visiteur lit toujours la vitrine.
--
-- MAIS ELLE NE SE REJOUE PAS. Sur une base reconstruite depuis le dépôt, ce
-- `create or replace` crée une vue NEUVE, sans aucun droit : la vitrine
-- naîtrait fermée, et le site afficherait « La boutique est momentanément
-- indisponible » sans que rien dans les migrations ne le laisse voir. C'est
-- exactement la panne d'APP 28-bis, par une autre porte.
--
-- « Une base qu'on ne peut pas reconstruire depuis le dépôt n'est sauvegardée
-- nulle part, et on s'en aperçoit le jour où l'on essaie. »
--
-- Cette migration ne change RIEN à ce que la base fait aujourd'hui : elle rend
-- le dépôt capable de refaire la même chose. Un test du dépôt
-- (`vitrinePublique`) exige que la dernière migration qui définit la vue porte
-- ses droits — c'est lui qui l'a signalé.
--
-- ── CE QUI NE DOIT PAS REVENIR (leçon d'APP 28-bis) ────────────────────────
--
-- Le délai est calculé ICI, par deux coalesce, et NON par un appel à
-- delai_commande_effectif, fermée à anon comme toute fonction du dépôt.
--
-- Une vue SECURITY DEFINER reporte les droits de son propriétaire POUR LES
-- TABLES seulement : le privilège EXECUTE d'une fonction est vérifié avec le
-- rôle courant. La vue devenait fermée elle aussi, et la boutique est restée
-- indisponible un jour — pendant que la suite de tests restait verte, parce
-- qu'elle lisait la vue avec la clé de service.
--
-- Ouvrir la fonction à anon serait la MAUVAISE correction : appelable par
-- /rest/v1/rpc avec la clé publique du site, elle rendrait le délai d'un
-- article NON commandable — précisément ce que la vue refuse de publier.

create or replace view public.articles_vitrine
with (security_invoker = false) as
select
  a.id,
  a.reference,
  a.nom,
  a.description,
  a.categorie,
  -- L'ORDRE DU MAGASIN, et la seule chose qui le dise au site vitrine.
  -- Il double `CATEGORIES_ARTICLE` (src/lib/boutiqueLogique.ts) : un test
  -- compare les deux listes terme à terme, parce que rien d'autre ne le ferait.
  array_position(array[
    'alimentation_seche', 'alimentation_humide', 'alimentation_complete',
    'friandises', 'mastication', 'complements', 'litiere',
    'colliers', 'laisses', 'harnais', 'muselieres', 'longes',
    'jouets', 'peluches', 'griffoirs', 'couchages', 'gamelles',
    'cages_enclos', 'soins', 'medaillons_accessoires', 'divers'
  ]::text[], a.categorie) as ordre_categorie,
  a.marque,
  a.prix_vente,
  a.unite,
  a.photo_path,
  a.type_article,
  a.delai_fabrication_jours,
  a.expediable,
  a.poids_grammes,
  -- S-04 : le stock ne sort JAMAIS chiffré. Le visiteur apprend « en stock »
  -- ou « épuisé », jamais combien il en reste.
  (a.type_article = 'personnalisable' or (a.stock_actuel - a.stock_reserve) > 0) as en_stock,
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
  (a.disponible_sur_commande and d.max_jours is not null) as sur_commande,
  case when a.disponible_sur_commande and d.max_jours is not null
       then d.min_jours else null end as delai_commande_min_jours,
  case when a.disponible_sur_commande and d.max_jours is not null
       then d.max_jours else null end as delai_commande_max_jours,
  a.animaux,
  a.especes,
  a.types_soin
from public.articles a
left join public.fournisseurs f on f.id = a.fournisseur_id
-- S-04 encore : le fournisseur est joint pour son DÉLAI, et rien d'autre ne
-- sort de lui. Savoir chez quel grossiste la pension se fournit ne regarde pas
-- le visiteur.
left join lateral (
  select coalesce(a.delai_commande_min_jours, f.delai_commande_min_jours) as min_jours,
         coalesce(a.delai_commande_max_jours, f.delai_commande_max_jours) as max_jours
) d on true
where a.actif = true
  and a.vendable_en_ligne = true
  and a.composant = false
  and a.statut_vitrine = 'publie'
  and (a.date_publication is null or a.date_publication <= now());

-- Les droits, restatés : c'est ce qui manquait pour que le dépôt se rejoue.
revoke all on public.articles_vitrine from anon, authenticated;
grant select on public.articles_vitrine to anon, authenticated;
