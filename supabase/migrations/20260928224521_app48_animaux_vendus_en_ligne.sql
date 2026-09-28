-- APP 48 — choisir les animaux vendus en ligne.
--
-- Sabrina veut pouvoir fermer un rayon d'animal à la boutique EN LIGNE sans
-- toucher au comptoir : les reptiles restent en caisse et à l'inventaire, mais
-- disparaissent du site et de l'application. Tant qu'elle ne décoche rien, rien
-- ne change — les sept animaux sont ouverts à la migration.
--
-- ── OÙ LE RÉGLAGE EST RANGÉ, ET POURQUOI ──────────────────────────────────
--
-- Dans `parametres`, comme TOUS les autres réglages de la boutique : la grille
-- des frais de port, le franco, la remise membre, le délai de préparation. Le
-- même endroit, le même écran, et surtout la même trace au journal des gestes
-- — entité « parametre », identifiant de la ligne, avant/après. Une table
-- dédiée aurait demandé d'inventer un identifiant pour le journal, et une
-- seconde façon de lire un réglage.
--
-- RIEN DE NOUVEAU N'EST PUBLIÉ À `anon`. `parametres` est protégé par RLS
-- (admin et personnel seulement) et le reste : c'est la VUE qui le lit, et une
-- vue `security_invoker = false` lit les TABLES avec les droits de son
-- propriétaire. Ce report ne vaudrait pas pour une fonction — le privilège
-- EXECUTE est vérifié avec le rôle courant (leçon d'APP 26) — c'est pourquoi
-- aucune fonction n'est appelée ici.
--
-- ── LE VOCABULAIRE EST TENU PAR LA BASE ───────────────────────────────────
--
-- Une contrainte CHECK refuse un animal inconnu et refuse la liste vide. Sans
-- elle, une valeur mal écrite viderait la boutique en silence — et c'est le
-- genre de panne qu'on découvre par un client, pas par un écran.

-- ── 1. Le réglage ─────────────────────────────────────────────────────────

insert into public.parametres (cle, valeur, description)
values (
  'animaux_en_ligne',
  '["chien","chat","rongeur","furet","reptile","oiseau","faune"]',
  'Les animaux dont les articles sont publiés sur la boutique en ligne. '
  || 'Un animal retiré disparaît du site et de l''application ; ses articles '
  || 'restent vendables au comptoir.'
)
on conflict (cle) do nothing;

/*
 * `case` et non `or` : l'ordre d'évaluation d'un `or` n'est pas garanti, et
 * `valeur::jsonb` sur la grille des frais de port ou sur « 10 » lèverait une
 * erreur au lieu de laisser passer. `case` évalue ses branches dans l'ordre
 * écrit, ce que la documentation garantit.
 *
 * `<@` sur deux tableaux jsonb : chaque élément de gauche doit se trouver à
 * droite. La liste de droite est CELLE d'`articles_animaux_check` — un test
 * relit les deux migrations et les compare, parce que deux vocabulaires qui
 * divergent ne se signalent jamais tout seuls.
 *
 * `>= 1` : la boutique ne se vide pas d'un enregistrement. L'écran le refuse
 * déjà avec une phrase ; la base le refuse sans phrase, mais elle le refuse.
 */
alter table public.parametres
  drop constraint if exists parametres_animaux_en_ligne_check;

alter table public.parametres
  add constraint parametres_animaux_en_ligne_check
  check (
    case when cle = 'animaux_en_ligne'
      then valeur::jsonb <@ '["chien","chat","rongeur","furet","reptile","oiseau","faune"]'::jsonb
           and jsonb_array_length(valeur::jsonb) >= 1
      else true
    end
  );

-- ── 2. La vitrine ─────────────────────────────────────────────────────────

/*
 * Reprise de `pg_get_viewdef`, avec DEUX ajouts et rien d'autre :
 *
 *   • une jointure latérale `o` qui lit la liste ouverte ;
 *   • `a.animaux && o.ouverts` dans le WHERE — au moins un animal ouvert ;
 *   • la colonne `animaux` réduite aux animaux OUVERTS.
 *
 * Ce dernier point est celui qui compte pour les onglets : un article
 * « oiseau + faune » dont la faune est fermée ne doit apparaître QUE sous
 * Oiseaux. Publier ses deux animaux ferait naître un onglet « Faune sauvage »
 * sur le site, qui ne contiendrait que des articles qu'on a justement décidé
 * de ne pas vendre là.
 *
 * LE REPLI QUAND LA CLÉ MANQUE : les sept animaux. Une clé effacée par erreur
 * ne doit pas vider la boutique — elle doit la laisser comme avant. C'est le
 * sens le moins dommageable des deux.
 *
 * Colonnes, ordre, `ordre_categorie` et clause de publication : inchangés.
 *
 * ── AUCUNE FONCTION N'EST APPELÉE, ET AUCUN DROIT N'EST OUVERT ────────────
 *
 * La vue est SECURITY DEFINER (`security_invoker = false`) : elle lit
 * `parametres` avec les droits de son propriétaire, et ce report ne vaut que
 * pour les TABLES. Il ne vaudrait PAS pour une fonction : le privilège EXECUTE
 * d'une fonction est vérifié avec le rôle courant,
 * donc avec `anon`, et une fonction fermée appelée d'ici fermerait la vitrine
 * entière. C'est arrivé le 26 septembre 2026 (APP 26), et la boutique a affiché
 * « momentanément indisponible » pendant un jour.
 *
 * Ouvrir la fonction serait la MAUVAISE correction : appelable par
 * `/rest/v1/rpc` avec la clé publique du site, elle rendrait ce que la vue
 * refuse justement de publier. Le calcul se fait donc DANS la vue, et le
 * réglage se lit dans une table qui reste fermée à `anon`.
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
       -- APP 48 : seulement les animaux OUVERTS, dans l'ordre de l'article.
       (select array_agg(x order by array_position(a.animaux, x))
          from unnest(a.animaux) as x
         where x = any (o.ouverts)) as animaux,
       a.especes,
       a.types_soin
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
 where a.actif = true
   and a.vendable_en_ligne = true
   and a.composant = false
   and a.statut_vitrine = 'publie'::text
   and (a.date_publication is null or a.date_publication <= now())
   -- APP 48 : au moins un animal ouvert, sinon l'article n'est pas en ligne.
   and a.animaux && o.ouverts;

/*
 * Les droits sont REDITS : `CREATE OR REPLACE VIEW` les conserve sur une base
 * vivante, mais pas sur une base reconstruite depuis le dépôt — la vitrine y
 * naîtrait fermée à `anon` (leçon d'APP 34, trouvée par le test, pas par la
 * base).
 */
revoke all on public.articles_vitrine from anon, authenticated;
grant select on public.articles_vitrine to anon, authenticated;
