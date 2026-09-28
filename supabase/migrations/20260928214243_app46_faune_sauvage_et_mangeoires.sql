-- APP 46 — un animal « faune » et un rayon « mangeoires ».
--
-- Décisions de Sabrina du 28.09.2026 : les écureuils, les hérissons et le
-- nourrissage des oiseaux sauvages au jardin ne sont pas des animaux de
-- compagnie, et les mangeoires ne sont pas des gamelles. Les deux existaient
-- déjà en rayon sous un classement provisoire ; ce lot leur donne leur place.
--
-- AUCUNE DONNÉE D'ARTICLE N'EST ÉCRITE ICI. Les seize articles en brouillon
-- seront déplacés et publiés à la main après ce lot.
--
-- ── LA SEULE ÉCRITURE, ET POURQUOI ────────────────────────────────────────
--
-- Une ligne dans `remise_membre_categories`. Sans elle, l'écran annonce −10 %
-- au membre et la caisse facture le prix plein : le piège trouvé au lot APP 27,
-- silencieux des deux côtés. Un rayon sans sa ligne de remise n'est pas un
-- rayon fini.

-- ── 1. L'animal ───────────────────────────────────────────────────────────

/*
 * `animaux` est un TABLEAU : un article peut être à la fois « oiseau » et
 * « faune » — une boule de graisse nourrit la mésange du jardin comme la
 * perruche du salon. La contrainte garde son « au moins un » : un article sans
 * animal n'apparaît nulle part, et personne ne comprendrait pourquoi.
 */
alter table public.articles
  drop constraint if exists articles_animaux_check;

alter table public.articles
  add constraint articles_animaux_check
  check (
    animaux <@ array[
      'chien', 'chat', 'rongeur', 'furet', 'reptile', 'oiseau',
      'faune'   -- APP 46 : écureuils, hérissons, oiseaux du jardin.
    ]::text[]
    and cardinality(animaux) >= 1
  );

-- ── 2. Le rayon ───────────────────────────────────────────────────────────

alter table public.articles
  drop constraint if exists articles_categorie_check;

alter table public.articles
  add constraint articles_categorie_check
  check (categorie = any (array[
    'alimentation_seche',
    'alimentation_humide',
    'alimentation_complete',
    'friandises',
    'mastication',
    'complements',
    'litiere',
    'colliers',
    'laisses',
    'harnais',
    'muselieres',
    'longes',
    'jouets',
    'peluches',
    'griffoirs',
    'couchages',
    'gamelles',
    'mangeoires',   -- APP 46 : mangeoires, maisonnettes à oiseaux et hérissons.
    'cages_enclos',
    'soins',
    'medaillons_accessoires',
    'divers'
  ]::text[]));

-- ── 3. La vitrine ─────────────────────────────────────────────────────────

/*
 * Reprise de `pg_get_viewdef`, avec « mangeoires » inséré à SA place dans
 * `ordre_categorie` — juste après « gamelles », comme dans la contrainte.
 *
 * Les deux listes doivent rester dans le même ordre : `array_position` sur une
 * liste qui aurait divergé rendrait un rang faux, et le catalogue rangerait les
 * mangeoires ailleurs que la fiche. Un test relit les deux et les compare.
 *
 * Rien d'autre ne change : mêmes colonnes, même clause WHERE, même jointure.
 *
 * `security_invoker = false` est REDIT : c'est ce qui permet au visiteur de
 * lire la vue sans aucun droit sur `articles`.
 *
 * LA VUE N'APPELLE AUCUNE FONCTION, et aucun droit d'exécution n'a été ouvert
 * pour elle. Le report de droits d'une vue SECURITY DEFINER ne vaut que pour
 * les TABLES : le privilège EXECUTE d'une fonction, lui, est vérifié avec le
 * rôle courant, donc avec `anon`. Une fonction fermée appelée d'ici fermerait
 * la vitrine entière — c'est arrivé le 26 septembre 2026 (APP 26), et la
 * boutique a affiché « momentanément indisponible » pendant un jour.
 *
 * Ouvrir la fonction serait la MAUVAISE correction : appelable par
 * `/rest/v1/rpc` avec la clé publique du site, elle rendrait ce que la vue
 * refuse justement de publier. Le calcul d'une colonne publique s'écrit DANS
 * la vue — c'est ce que fait `array_position` ici.
 */
create or replace view public.articles_vitrine
with (security_invoker = false) as
select a.id,
       a.reference,
       a.nom,
       a.description,
       a.categorie,
       array_position(array[
         'alimentation_seche', 'alimentation_humide', 'alimentation_complete',
         'friandises', 'mastication', 'complements', 'litiere', 'colliers',
         'laisses', 'harnais', 'muselieres', 'longes', 'jouets', 'peluches',
         'griffoirs', 'couchages', 'gamelles', 'mangeoires', 'cages_enclos',
         'soins', 'medaillons_accessoires', 'divers'
       ]::text[], a.categorie) as ordre_categorie,
       a.marque,
       a.prix_vente,
       a.unite,
       a.photo_path,
       a.type_article,
       a.delai_fabrication_jours,
       a.expediable,
       a.poids_grammes,
       a.type_article = 'personnalisable'::text
         or (a.stock_actuel - a.stock_reserve) > 0::numeric as en_stock,
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
       case
         when a.disponible_sur_commande and d.max_jours is not null then d.min_jours
         else null::integer
       end as delai_commande_min_jours,
       case
         when a.disponible_sur_commande and d.max_jours is not null then d.max_jours
         else null::integer
       end as delai_commande_max_jours,
       a.animaux,
       a.especes,
       a.types_soin
  from public.articles a
  left join public.fournisseurs f on f.id = a.fournisseur_id
  left join lateral (
    select coalesce(a.delai_commande_min_jours, f.delai_commande_min_jours) as min_jours,
           coalesce(a.delai_commande_max_jours, f.delai_commande_max_jours) as max_jours
  ) d on true
 where a.actif = true
   and a.vendable_en_ligne = true
   and a.composant = false
   and a.statut_vitrine = 'publie'::text
   and (a.date_publication is null or a.date_publication <= now());

/*
 * Les droits sont REDITS. `CREATE OR REPLACE VIEW` les conserve sur une base
 * vivante, mais pas sur une base reconstruite depuis le dépôt : la vitrine y
 * naîtrait fermée à `anon`, et on s'en apercevrait le jour de la reconstruction
 * — c'est-à-dire le pire jour. Trouvé au lot APP 34, par le test, pas par la base.
 */
revoke all on public.articles_vitrine from anon, authenticated;
grant select on public.articles_vitrine to anon, authenticated;

-- ── 4. La remise d'adhésion du rayon neuf ─────────────────────────────────

insert into public.remise_membre_categories (categorie, pourcentage)
values ('mangeoires', 10)
on conflict (categorie) do nothing;
