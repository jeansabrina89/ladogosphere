-- APP 62 — coups de cœur et offre du mois, visibles par le site.
--
-- Décisions de Sabrina (29.09.2026) : une section « Coups de cœur du moment »
-- qu'elle choisit à la main, et une « super offre du mois » — un article
-- remisé, valable partout, un membre gardant la meilleure des deux remises sans
-- cumul. L'offre existe déjà : c'est une Action (`promotions.type = 'action'`),
-- que `prixApplicable` applique à la caisse comme en ligne. Ce qui manquait,
-- c'est que le SITE puisse la montrer : il ne lit que `articles_vitrine`.
--
-- ── CETTE VUE EST PUBLIQUE (S-04) ─────────────────────────────────────────
--
-- Chaque colonne ajoutée se justifie, une par une — à la fin de la liste,
-- parce que Postgres refuse d'insérer une colonne au milieu d'une vue
-- remplacée. Rien n'est retiré, rien n'est renommé.
--
--   • coup_de_coeur — la case cochée par Sabrina sur la fiche. Une mise en
--     avant choisie, faite pour être vue : elle n'a de sens que publique.
--
--   • nouveaute — vrai si l'article est dans une rubrique « Nouveautés »
--     active aujourd'hui et destinée à TOUS. Un booléen, pas la rubrique :
--     le site sait l'afficher, il n'a pas à connaître nos rubriques.
--
--   • offre_pourcentage, offre_nom, offre_texte, offre_date_fin — la
--     meilleure Action ou Anti-gaspillage active aujourd'hui, cible 'tous',
--     qui contient l'article ; NULL sinon. Le nom, le texte et la date de fin
--     sont précisément ce qu'une réclame affiche (« Action du mois −20 %,
--     jusqu'au 31 octobre ») : publics par nature.
--
--   • offre_prix — le prix remisé de offre_pourcentage, arrondi EXACTEMENT
--     comme `prixApplicable` (src/lib/prixLogique.ts) l'arrondit. Voir plus
--     bas : ce n'est pas un `round(…, 2)`.
--
--   • remise_membre_pourcent — le taux membre de la catégorie (actif et
--     non nul), NULL si l'article en est exclu. Le site doit pouvoir dire
--     « −10 % pour les membres » ; le taux est déjà annoncé partout, et un
--     article exclu n'en montre aucune mention, comme dans l'app.
--
--   • cree_le — date_publication, sinon created_at : de quoi poser un
--     « Nouveau » côté site si Sabrina le veut un jour. Une date de mise en
--     rayon n'a rien de commercial.
--
-- ── CE QUI N'EST PAS EXPOSÉ ───────────────────────────────────────────────
--
-- Les rubriques ciblant 'membres' : un visiteur ne peut pas en profiter, et
-- montrer une remise qu'on ne peut pas obtenir est une déception, pas une
-- réclame (même règle que `cibleAtteinte`). La table `promotions` reste
-- FERMÉE à anon : seules ces colonnes calculées sortent, par la vue.
--
-- ── AUCUNE FONCTION N'EST APPELÉE (leçon d'APP 26 et 28-bis) ──────────────
--
-- La vue est SECURITY DEFINER (`security_invoker = false`) : elle lit
-- `promotions`, `promotions_articles` et `remise_membre_categories` avec les
-- droits de son propriétaire. Ce report ne vaut que pour les TABLES : le
-- privilège EXECUTE d'une fonction est vérifié avec le rôle courant, donc avec
-- anon, et une fonction fermée appelée d'ici fermerait la vitrine entière.
-- Ouvrir une telle fonction serait la mauvaise correction : appelable par
-- /rest/v1/rpc avec la clé publique du site, elle rendrait ce que la vue
-- refuse justement de publier (les rubriques « membres »). Tout le calcul est
-- donc écrit DANS la vue.
--
-- ── L'ARRONDI : CELUI DE JAVASCRIPT, PAS CELUI DE POSTGRES ────────────────
--
-- `prixApplicable` calcule en nombres flottants (double) :
--
--   r2 = Math.round(n * 100) / 100
--   remise    = r2(prixBase * pct / 100)
--   prixFinal = r2(prixBase - remise)
--
-- Un calcul exact, `round(prix * (1 - pct / 100), 2)`, donnerait un AUTRE
-- prix dans plus d'un cas sur deux : 12.90 à −15 % fait 10.96 en JavaScript
-- (la remise 1.935 tombe à 1.94), et 10.97 en exact. Le site afficherait alors
-- un prix que la caisse ne prend pas. La vue refait donc le même calcul en
-- float8, opération par opération, et `Math.round` s'écrit
-- `floor(v) + (v - floor(v) >= 0.5)` — ce qui est sa définition (le plus
-- proche, l'égalité vers le haut), et non `round(float8)`, qui arrondit
-- l'égalité au pair. Douze prix comparés en base au calcul JavaScript avant
-- d'écrire ce fichier : douze égaux ; le calcul exact en différait sur sept.
-- `tests/vitrineOffres.test.ts` garde l'égalité.
--
-- « Aujourd'hui » est le jour de Zurich, comme `aujourdhuiISO()` : à 0 h 30
-- en Suisse, l'UTC est encore la veille.

-- ── 1. La case ────────────────────────────────────────────────────────────

alter table public.articles
  add column if not exists coup_de_coeur boolean not null default false;

comment on column public.articles.coup_de_coeur is
  'Coup de cœur du moment : mis en avant en haut de la boutique en ligne. Choisi à la main par Sabrina, 4 à 8 articles idéalement.';

-- ── 2. La vitrine ─────────────────────────────────────────────────────────

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
       (select array_agg(x order by array_position(a.animaux, x))
          from unnest(a.animaux) as x
         where x = any (o.ouverts)) as animaux,
       a.especes,
       a.types_soin,
       -- APP 62 : la mise en avant choisie par Sabrina.
       a.coup_de_coeur,
       -- APP 62 : une rubrique « Nouveautés » en cours, pour tous.
       exists (
         select 1
           from public.promotions_articles pa
           join public.promotions p on p.id = pa.promotion_id
          where pa.article_id = a.id
            and p.type = 'nouveaute'
            and p.cible = 'tous'
            and p.actif = true
            and p.date_debut <= j.aujourdhui
            and (p.date_fin is null or j.aujourdhui <= p.date_fin)
       ) as nouveaute,
       -- APP 62 : la meilleure offre en cours pour tous, NULL sinon.
       off.pourcentage as offre_pourcentage,
       off.nom as offre_nom,
       off.texte as offre_texte,
       off.date_fin as offre_date_fin,
       case when off.pourcentage is not null
            then round(px.final_cts::numeric / 100, 2)
            else null::numeric
       end as offre_prix,
       -- APP 62 : le taux membre de la catégorie ; rien si l'article est exclu.
       case when a.remise_membre_exclue then null::numeric
            else (select r.pourcentage
                    from public.remise_membre_categories r
                   where r.categorie = a.categorie
                     and r.actif = true
                     and r.pourcentage > 0)
       end as remise_membre_pourcent,
       -- APP 62 : la date de mise en rayon.
       coalesce(a.date_publication, a.created_at) as cree_le
  from public.articles a
  left join public.fournisseurs f on f.id = a.fournisseur_id
  left join lateral (
    select coalesce(a.delai_commande_min_jours, f.delai_commande_min_jours) as min_jours,
           coalesce(a.delai_commande_max_jours, f.delai_commande_max_jours) as max_jours
  ) d on true
  left join lateral (
    select coalesce(
      (select array_agg(v)
         from public.parametres p,
              lateral jsonb_array_elements_text(p.valeur::jsonb) as v
        where p.cle = 'animaux_en_ligne'),
      array['chien', 'chat', 'rongeur', 'furet', 'reptile', 'oiseau', 'faune']::text[]
    ) as ouverts
  ) o on true
  -- APP 62 : le jour de Zurich, comme aujourdhuiISO().
  cross join lateral (
    select (now() at time zone 'Europe/Zurich')::date as aujourdhui
  ) j
  -- APP 62 : la meilleure Action ou Anti-gaspillage, comme prixApplicable la
  -- choisit pour un visiteur : le plus fort pourcentage, puis le nom.
  -- `date_fin` est NOT NULL aujourd'hui ; le cas NULL est écrit pour le jour
  -- où elle ne le serait plus.
  left join lateral (
    select p.pourcentage, p.nom, p.texte, p.date_fin
      from public.promotions_articles pa
      join public.promotions p on p.id = pa.promotion_id
     where pa.article_id = a.id
       and p.type in ('action', 'anti_gaspillage')
       and p.cible = 'tous'
       and p.actif = true
       and p.pourcentage > 0
       and p.date_debut <= j.aujourdhui
       and (p.date_fin is null or j.aujourdhui <= p.date_fin)
     order by p.pourcentage desc, p.nom
     limit 1
  ) off on true
  -- APP 62 : prixApplicable, opération par opération, en double. `rond(v)`
  -- s'écrit floor(v) + (v - floor(v) >= 0.5) : c'est Math.round.
  --   base  = rond(prix_vente * 100) / 100
  --   rem   = rond(base * pct / 100 * 100) / 100
  --   final = rond((base - rem) * 100)            (en centimes)
  cross join lateral (
    select a.prix_vente::float8 * 100 as v
  ) b0
  cross join lateral (
    select (floor(b0.v) + case when b0.v - floor(b0.v) >= 0.5 then 1 else 0 end) / 100 as base
  ) b
  cross join lateral (
    select b.base * coalesce(off.pourcentage, 0)::float8 / 100 * 100 as v
  ) r0
  cross join lateral (
    select (floor(r0.v) + case when r0.v - floor(r0.v) >= 0.5 then 1 else 0 end) / 100 as remise
  ) r
  cross join lateral (
    select (b.base - r.remise) * 100 as v
  ) f0
  cross join lateral (
    select floor(f0.v) + case when f0.v - floor(f0.v) >= 0.5 then 1 else 0 end as final_cts
  ) px
 where a.actif = true
   and a.vendable_en_ligne = true
   and a.composant = false
   and a.statut_vitrine = 'publie'::text
   and (a.date_publication is null or a.date_publication <= now())
   and a.animaux && o.ouverts;

/*
 * Les droits sont REDITS : `CREATE OR REPLACE VIEW` les conserve sur une base
 * vivante, mais pas sur une base reconstruite depuis le dépôt — la vitrine y
 * naîtrait fermée à `anon` (leçon d'APP 34).
 */
revoke all on public.articles_vitrine from anon, authenticated;
grant select on public.articles_vitrine to anon, authenticated;
