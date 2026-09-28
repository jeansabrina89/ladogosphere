-- APP 34 — deux rayons de plus : « Compléments alimentaires » et « Gamelles ».
--
-- Décision de Sabrina du 28.09.2026. Aucun rayon équivalent n'existait : les
-- articles concernés sont aujourd'hui dans « Divers » (17 relevés le 28.09).
--
-- « Alimentation complète » est le voisin dont il faut se méfier — c'est un
-- repas ENTIER (granulés, foin des NAC), pas ce qu'on ajoute par-dessus. Les
-- compléments sont un rayon à part, et c'est pour cela qu'ils s'insèrent après
-- la mastication et non après lui.
--
-- ── AUCUN ARTICLE N'EST DÉPLACÉ ICI ────────────────────────────────────────
--
-- Pas un seul UPDATE sur `articles` : le reclassement des 118 articles se fait
-- après ce lot, à la main. Une migration qui devinerait le rayon d'un article
-- d'après son nom se tromperait sur les cas limites — et personne ne saurait
-- lesquels.

-- ── 1. La contrainte ───────────────────────────────────────────────────────
--
-- Relue dans pg_get_constraintdef avant d'être réécrite : elle listait
-- dix-neuf rayons, elle en liste vingt et un. Une contrainte CHECK ne s'étend
-- pas, elle se remplace.

alter table public.articles drop constraint articles_categorie_check;

alter table public.articles add constraint articles_categorie_check
  check (categorie = any (array[
    'alimentation_seche', 'alimentation_humide', 'alimentation_complete',
    'friandises', 'mastication',
    -- APP 34 : juste après la mastication. Ce qui se donne EN PLUS du repas.
    'complements',
    'litiere', 'colliers', 'laisses', 'harnais', 'muselieres', 'longes',
    'jouets', 'peluches', 'griffoirs', 'couchages',
    -- APP 34 : juste après les couchages. L'équipement du coin repas.
    'gamelles',
    'cages_enclos', 'soins', 'medaillons_accessoires', 'divers'
  ]::text[]));

-- ── 2. L'ordre publié sur le site vitrine ──────────────────────────────────
--
-- `ordre_categorie` est la SEULE chose qui dit au site dans quel ordre ranger
-- ses rayons. Un rayon absent de ce tableau reçoit NULL et se range donc où le
-- tri le laisse — c'est-à-dire nulle part de sûr.
--
-- La définition est reprise de pg_get_viewdef, telle quelle, et SEUL le tableau
-- change. `security_invoker = false` est réécrit explicitement : c'est ce qui
-- permet à un visiteur de lire la vitrine sans aucun droit sur `articles`, et
-- le perdre rendrait la boutique illisible pour les visiteurs (APP 28-bis).
--
-- ── CE QUI NE DOIT PAS REVENIR, ET POURQUOI (leçon d'APP 28-bis) ───────────
--
-- Le délai est calculé ICI, par deux coalesce, et NON par un appel à
-- delai_commande_effectif. Cette fonction est fermée à anon, comme toute
-- fonction du dépôt — et c'est la bonne règle.
--
-- Une vue SECURITY DEFINER reporte les droits de son propriétaire POUR LES
-- TABLES seulement : le privilège EXECUTE d'une fonction, lui, est vérifié avec
-- le rôle courant. La vue devenait donc fermée elle aussi, et le site vitrine a
-- affiché « La boutique est momentanément indisponible » pendant un jour —
-- pendant que la suite de tests restait verte, parce qu'elle lisait la vue avec
-- la clé de service.
--
-- La correction évidente — ouvrir la fonction à anon — est la MAUVAISE : elle
-- réparerait l'écran et rouvrirait par /rest/v1/rpc, avec la clé publique du
-- site, exactement ce que la vue refuse de publier — le délai d'un article NON
-- commandable.

create or replace view public.articles_vitrine
with (security_invoker = false) as
 SELECT a.id,
    a.reference,
    a.nom,
    a.description,
    a.categorie,
    array_position(ARRAY['alimentation_seche'::text, 'alimentation_humide'::text, 'alimentation_complete'::text, 'friandises'::text, 'mastication'::text, 'complements'::text, 'litiere'::text, 'colliers'::text, 'laisses'::text, 'harnais'::text, 'muselieres'::text, 'longes'::text, 'jouets'::text, 'peluches'::text, 'griffoirs'::text, 'couchages'::text, 'gamelles'::text, 'cages_enclos'::text, 'soins'::text, 'medaillons_accessoires'::text, 'divers'::text], a.categorie) AS ordre_categorie,
    a.marque,
    a.prix_vente,
    a.unite,
    a.photo_path,
    a.type_article,
    a.delai_fabrication_jours,
    a.expediable,
    a.poids_grammes,
    a.type_article = 'personnalisable'::text OR (a.stock_actuel - a.stock_reserve) > 0::numeric AS en_stock,
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
    a.disponible_sur_commande AND d.max_jours IS NOT NULL AS sur_commande,
        CASE
            WHEN a.disponible_sur_commande AND d.max_jours IS NOT NULL THEN d.min_jours
            ELSE NULL::integer
        END AS delai_commande_min_jours,
        CASE
            WHEN a.disponible_sur_commande AND d.max_jours IS NOT NULL THEN d.max_jours
            ELSE NULL::integer
        END AS delai_commande_max_jours,
    a.animaux,
    a.especes,
    a.types_soin
   FROM articles a
     LEFT JOIN fournisseurs f ON f.id = a.fournisseur_id
     LEFT JOIN LATERAL ( SELECT COALESCE(a.delai_commande_min_jours, f.delai_commande_min_jours) AS min_jours,
            COALESCE(a.delai_commande_max_jours, f.delai_commande_max_jours) AS max_jours) d ON true
  WHERE a.actif = true AND a.vendable_en_ligne = true AND a.composant = false AND a.statut_vitrine = 'publie'::text AND (a.date_publication IS NULL OR a.date_publication <= now());

-- ── 3. La remise d'adhésion des deux rayons neufs ──────────────────────────
--
-- CE N'EST PAS UNE DONNÉE D'ARTICLE, et c'est pour cela que ces deux lignes
-- sont ici malgré la consigne « aucune écriture ».
--
-- Le défaut est documenté depuis APP 27 : l'écran de gestion PROPOSE 10 % pour
-- un rayon sans ligne, alors que le calcul du prix ne lit que les lignes
-- existantes et rend ZÉRO. Sabrina lirait « 10 % » sur les gamelles, et une
-- membre paierait le plein tarif — sans le savoir, donc sans se plaindre.
--
-- La migration app27_remise_membre_rayons_neufs a fait exactement cela pour les
-- trois rayons d'alors, et un test (`remiseMembreCategories`) garde la règle.
-- Un rayon neuf sans sa ligne naîtrait cassé.

insert into public.remise_membre_categories (categorie, pourcentage)
values ('complements', 10), ('gamelles', 10)
on conflict (categorie) do nothing;
