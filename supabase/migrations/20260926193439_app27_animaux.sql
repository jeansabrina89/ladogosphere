-- APP 27 : la boutique vend pour six animaux, et non plus pour le chien seul.
--
-- Décision de Sabrina : dès l'ouverture, la boutique sert chiens, chats,
-- rongeurs, furets, reptiles et oiseaux.
--
-- ── L'ANIMAL N'EST PAS UNE CATÉGORIE ──────────────────────────────────────
--
-- C'est la décision de structure du lot, et elle mérite d'être écrite. Une
-- catégorie dit ce QU'EST le produit (« Alimentation sèche », « Griffoirs ») ;
-- l'animal dit POUR QUI il est. Les mélanger aurait demandé « Alimentation
-- sèche pour chats » et « Alimentation sèche pour chiens » — deux rayons pour
-- un même type de produit, et l'impossibilité de dire qu'un shampooing sert aux
-- deux. Un article porte donc N animaux, et se retrouve dans N onglets.
--
-- ── Les trois colonnes ajoutées à la vitrine publique ─────────────────────
--
-- CETTE VUE EST PUBLIQUE : le site la lit avec la clé anon (garde S-04). Une
-- colonne de plus se décide donc ici, par écrit, jamais au passage.
--
-- `animaux` — pour quel animal l'article est fait. C'est ce qui le range dans un
--    onglet du catalogue : sans elle, il n'y a pas d'onglets du tout.
--
-- `especes` — l'espèce précise, là où « rongeur » est trop large : un lapin ne
--    mange pas ce qu'un hamster mange, et une cliente doit pouvoir filtrer.
--
-- `types_soin` — ce que le produit soigne. Le filtre du seul rayon « Soins et
--    hygiène ».
--
-- Les trois sont des étiquettes de FILTRE, exactement comme `ages` ou `gouts` :
-- ce que la cliente coche pour trouver. Rien de commercial n'y passe, et le nom
-- du fournisseur ne sort toujours pas.
--
-- ── RELIQUAT D'APP 26 : le délai ne sort que s'il est promis ──────────────
--
-- Constaté à l'essai du 26.09.2026 et inscrit en réserve dans le suivi : la vue
-- publiait `delai_commande_min_jours` et `delai_commande_max_jours` pour TOUS les
-- articles, y compris ceux qui ne sont pas commandables. Un article non coché
-- chez un fournisseur qui a un délai sortait avec `sur_commande = false` ET un
-- délai renseigné.
--
-- Aucun écran ne l'affichait — mais une vue publique ne porte pas de donnée qui
-- ne sert à rien : deux articles du même fournisseur laissaient deviner qu'ils
-- partagent une source, et la garde S-04 veut qu'une colonne publique se décide
-- plutôt qu'elle n'arrive par ricochet. Le `case when` de la vue reprend
-- EXACTEMENT la condition de `sur_commande`, et un test le prouve.

-- ── 1. `animaux` : au moins un, jamais n'importe lequel ───────────────────
--
-- Le défaut est {chien} : tous les articles d'aujourd'hui sont pour chiens, et
-- un nouvel article le sera aussi neuf fois sur dix. La fiche le propose donc
-- coché, et la cardinalité ≥ 1 empêche qu'un article n'appartienne à personne —
-- il serait invisible dans tous les onglets, sans que rien ne le dise.

alter table public.articles
  add column if not exists animaux text[] not null default '{chien}';

-- Les articles existants : tous pour chiens. Le default ne s'applique qu'aux
-- lignes nouvelles, donc on le pose explicitement sur ce qui existe déjà.
update public.articles set animaux = '{chien}' where cardinality(animaux) = 0;

alter table public.articles drop constraint if exists articles_animaux_check;
alter table public.articles add constraint articles_animaux_check check (
  animaux <@ array['chien', 'chat', 'rongeur', 'furet', 'reptile', 'oiseau']::text[]
  and cardinality(animaux) >= 1
);

comment on column public.articles.animaux is
  'Pour QUI cet article est fait : chien, chat, rongeur, furet, reptile, oiseau. Au moins un — un article sans animal n''apparaîtrait dans aucun onglet. Un article peut valoir pour plusieurs animaux (un shampooing, un tapis) et se montre alors dans chacun.';

create index if not exists articles_animaux_gin on public.articles using gin (animaux);

-- ── 2. `especes` : le rang sous l'animal, et comment il s'étendra ─────────
--
-- « Rongeur » est trop large pour choisir une litière ou un foin : un lapin ne
-- mange pas ce qu'un hamster mange. L'espèce précise donc l'animal, sans le
-- remplacer.
--
-- COMMENT AJOUTER DES ESPÈCES DE REPTILES OU D'OISEAUX PLUS TARD, sans refaire
-- le modèle — c'est la question posée, et voici la réponse retenue :
--
--   * le vocabulaire s'allonge dans `articles_especes_check` ;
--   * le lien espèce → animal s'ajoute par UNE contrainte de plus, bâtie sur le
--     MÊME patron : `articles_especes_<animal>_check`. Pour les reptiles, ce
--     serait « si une espèce de reptile est cochée, alors 'reptile' est dans
--     animaux ». Rien d'autre ne change : une seule colonne, un patron répété.
--
-- L'autre conception envisagée était une table `especes_animaux` lue par un
-- TRIGGER de validation, qui aurait permis d'ajouter une espèce sans migration
-- du tout. Elle est écartée pour une raison précise : un CHECK ne se contourne
-- pas, un trigger se désactive (`alter table ... disable trigger`) — et la
-- check-list de mise en production prévoit justement de lever des triggers de
-- façon bornée pour vider le journal. Une garde qu'une autre procédure sait
-- éteindre n'est pas une garde. Le prix payé est une migration par animal
-- ajouté, ce qui reste un geste de quelques lignes.

alter table public.articles
  add column if not exists especes text[] not null default '{}';

alter table public.articles drop constraint if exists articles_especes_check;
alter table public.articles add constraint articles_especes_check check (
  especes <@ array['cochon_inde', 'lapin', 'hamster', 'rat', 'souris',
                   'chinchilla', 'degu', 'gerbille']::text[]
);

-- Le patron, à répéter tel quel pour un futur animal.
alter table public.articles drop constraint if exists articles_especes_rongeur_check;
alter table public.articles add constraint articles_especes_rongeur_check check (
  not (especes && array['cochon_inde', 'lapin', 'hamster', 'rat', 'souris',
                        'chinchilla', 'degu', 'gerbille']::text[])
  or 'rongeur' = any(animaux)
);

comment on column public.articles.especes is
  'L''espèce précise, sous l''animal : aujourd''hui les rongeurs seulement (un lapin ne mange pas ce qu''un hamster mange). Vide = vaut pour tout l''animal. Pour ajouter des espèces d''un autre animal : allonger articles_especes_check, puis ajouter une contrainte articles_especes_<animal>_check sur le même patron que celle du rongeur.';

create index if not exists articles_especes_gin on public.articles using gin (especes);

-- ── 3. « chaton » rejoint le vocabulaire des âges ─────────────────────────
--
-- « junior », « adulte » et « senior » existaient déjà et servent tels quels aux
-- NAC ; il manquait le petit du chat. Quel âge se propose pour quel animal est
-- une règle d'AFFICHAGE, tenue par `etiquettesArticles.ts` : la base garde le
-- vocabulaire complet, et ne dira jamais qu'un chiot est un chat.

alter table public.articles drop constraint if exists articles_ages_check;
alter table public.articles add constraint articles_ages_check check (
  ages <@ array['chiot', 'chaton', 'junior', 'adulte', 'senior']::text[]
);

-- ── 4. `types_soin` : ce que le produit soigne ────────────────────────────
--
-- Le seul rayon qui l'emploie est « Soins et hygiène ». Une cliente qui cherche
-- un démêlant ne veut pas parcourir les antiparasitaires.
--
-- COMMENT ALLONGER LA LISTE : une migration qui refait ce seul CHECK, exactement
-- comme celle-ci. Pas de table, pas de trigger — le vocabulaire est court, il
-- change rarement, et le voir en clair dans la contrainte vaut mieux que de le
-- chercher dans des lignes de données.

alter table public.articles
  add column if not exists types_soin text[] not null default '{}';

alter table public.articles drop constraint if exists articles_types_soin_check;
alter table public.articles add constraint articles_types_soin_check check (
  types_soin <@ array['pattes', 'truffe', 'pelage', 'shampooing', 'demelant',
                      'apres_shampooing', 'antiparasitaire', 'yeux', 'oreilles',
                      'dents', 'griffes']::text[]
);

comment on column public.articles.types_soin is
  'Ce que le produit soigne : pattes, truffe, pelage, shampooing, demelant, apres_shampooing, antiparasitaire, yeux, oreilles, dents, griffes. Employé par le seul rayon « Soins et hygiène ». Pour allonger la liste : une migration qui refait articles_types_soin_check.';

create index if not exists articles_types_soin_gin on public.articles using gin (types_soin);

-- ── 5. Les rayons : trois de plus, trois libellés élargis ─────────────────
--
-- CE QUI N'EST PAS CRÉÉ, et c'est la réponse à la question posée : `litiere`
-- (« Litière ») et `soins` existaient DÉJÀ. Créer `soins_hygiene` à côté de
-- `soins` aurait fait exactement le doublon que Sabrina interdit — deux rayons
-- pour la même chose, et des articles répartis entre les deux au hasard de la
-- date de saisie. `soins` est donc réutilisée, son libellé élargi à « Soins et
-- hygiène » (comme `friandises` → « Friandises et snacks »).
--
-- Trois seulement sont neuves : cages_enclos, griffoirs, alimentation_complete.
--
-- Les libellés vivent dans `boutiqueLogique.ts`, pas ici : la base ne garde que
-- le vocabulaire.

alter table public.articles drop constraint if exists articles_categorie_check;
alter table public.articles add constraint articles_categorie_check check (
  categorie = any (array[
    'alimentation_seche', 'alimentation_humide', 'alimentation_complete',
    'friandises', 'mastication', 'litiere',
    'colliers', 'laisses', 'harnais', 'muselieres', 'longes',
    'jouets', 'peluches', 'griffoirs',
    'couchages', 'cages_enclos',
    'soins', 'medaillons_accessoires', 'divers'
  ]::text[])
);

-- ── 6. La vitrine publique ────────────────────────────────────────────────
--
-- La définition ci-dessous est relue par `pg_get_viewdef`, jamais reconstituée :
-- `ordre_categorie` et `en_stock` sont des expressions CALCULÉES et le filtre
-- porte cinq conditions. Au lot APP 25, une vue réécrite de mémoire aurait
-- éteint la vitrine.
--
-- CE QUI CASSE SI L'ON AJOUTE UNE CATÉGORIE SANS TOUCHER CETTE VUE, et c'est la
-- raison pour laquelle l'ordre des rayons est ici ET dans `boutiqueLogique.ts` :
-- `array_position` rend NULL pour une valeur absente du tableau. Le rayon neuf
-- n'aurait pas d'ordre, et le site le classerait n'importe où — ou nulle part.
-- Les trois catégories neuves sont donc dans le tableau, à leur place.
--
-- L'ORDRE DES RAYONS est celui du magasin, pas l'alphabet : ce qui se mange
-- d'abord, puis les consommables, puis l'équipement, puis les soins. Les trois
-- neufs s'y insèrent par voisinage de sens — l'alimentation complète avec les
-- autres aliments, les griffoirs près des jouets, les cages près des couchages.
--
-- ── LES TROIS COLONNES AJOUTÉES, ET POURQUOI ELLES SONT PUBLIQUES ─────────
--
-- CETTE VUE EST PUBLIQUE : le site la lit avec la clé anon (garde S-04). Une
-- colonne de plus se décide donc ici, par écrit, jamais au passage.
--
-- `animaux` — pour quel animal l'article est fait. C'est ce qui range l'article
--    dans un onglet du catalogue : sans elle, il n'y a pas d'onglets.
-- `especes` — l'espèce précise (rongeurs). Un filtre, comme les autres.
-- `types_soin` — ce que le produit soigne. Un filtre du rayon « Soins et
--    hygiène ».
--
-- Toutes trois sont des étiquettes de FILTRE, exactement comme `ages` ou
-- `gouts` : ce que la cliente coche pour trouver. Rien de commercial n'y passe.
--
-- ── RELIQUAT D'APP 26 : le délai ne sort que s'il est promis ──────────────
--
-- Constaté à l'essai du 26.09.2026 et inscrit en réserve dans le suivi : la vue
-- publiait le délai de commande pour TOUS les articles, y compris ceux qui ne
-- sont pas commandables. Un article non coché chez un fournisseur qui a un délai
-- sortait avec `sur_commande = false` ET un délai renseigné.
--
-- Aucun écran ne l'affichait, et le nom du fournisseur ne sortait pas — mais une
-- vue publique ne porte pas de donnée qui ne sert à rien. Deux articles du même
-- fournisseur laissaient deviner qu'ils partagent une source, et la garde S-04
-- veut qu'une colonne publique se décide plutôt qu'elle n'arrive par ricochet.
--
-- Le `case when` ci-dessous reprend EXACTEMENT la condition de `sur_commande` :
-- un délai n'est publié que s'il est promis. Un test le prouve sur un article
-- non coché dont le fournisseur a un délai.

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
  -- Le délai ne sort QUE s'il est promis : même condition que `sur_commande`.
  case when a.disponible_sur_commande and d.max_jours is not null
       then d.min_jours end as delai_commande_min_jours,
  case when a.disponible_sur_commande and d.max_jours is not null
       then d.max_jours end as delai_commande_max_jours,
  -- En fin de liste parce que Postgres refuse d'insérer une colonne au milieu
  -- d'une vue remplacée (« cannot change name of view column »). L'ordre des
  -- colonnes ne veut rien dire ici.
  a.animaux,
  a.especes,
  a.types_soin
from public.articles a
left join lateral public.delai_commande_effectif(a.id) d on true
where a.actif = true
  and a.vendable_en_ligne = true
  and a.composant = false
  and a.statut_vitrine = 'publie'
  and (a.date_publication is null or a.date_publication <= now());

revoke all on public.articles_vitrine from anon, authenticated;
grant select on public.articles_vitrine to anon, authenticated;
