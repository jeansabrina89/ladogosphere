-- APP 25-GOÛT : la saveur annoncée, séparée de ce que contient la recette.
--
-- Décision de Sabrina : un seul filtre ne peut pas servir à la fois l'envie et
-- l'allergie. Le « Purely Pâté avec agneau » de Bozita contient 52 % de poulet :
-- la personne qui cherche de l'agneau parce que son chien l'aime, et celle qui
-- fuit le poulet parce qu'il y réagit, ne posent pas la même question. Répondre
-- aux deux avec la même colonne, c'est mentir à l'une des deux.
--
--   `gouts`     — la saveur annoncée sur l'emballage. NOUVEAU.
--   `proteines` — tout ce que contient la recette. Inchangée en base : seul son
--                 libellé change à l'écran, « Protéines » devient « Contient ».
--
-- Le vocabulaire de `gouts` est EXACTEMENT celui de `proteines` — relu dans la
-- contrainte `articles_proteines_check` et non de mémoire. Deux vocabulaires qui
-- dériveraient l'un de l'autre rendraient les deux filtres incomparables, et
-- « agneau » d'un côté ne retrouverait plus « agneau » de l'autre.
--
-- AUCUNE valeur n'est écrite ici : les articles Bozita seront remplis après ce
-- lot. Une migration qui devine des saveurs ferait entrer dans le catalogue des
-- données que personne n'a lues sur un emballage.
--
-- POURQUOI `gouts` ENTRE DANS LA VITRINE PUBLIQUE : une saveur est imprimée sur
-- le paquet, en grand, sur la face avant. Elle est déjà publique par nature, et
-- c'est exactement ce que le visiteur cherche quand il filtre. La vue ne reçoit
-- QUE cette colonne de plus : la liste des colonnes tient lieu de garde depuis
-- APP 24-filtres (S-04), et chaque ajout se justifie une par une.

alter table public.articles
  add column if not exists gouts text[] not null default '{}';

alter table public.articles
  drop constraint if exists articles_gouts_check;

alter table public.articles
  add constraint articles_gouts_check
  check (gouts <@ array[
    'poulet', 'dinde', 'canard', 'boeuf', 'veau', 'porc', 'agneau', 'gibier',
    'renne', 'elan', 'cerf', 'sanglier', 'saumon', 'poisson', 'insecte', 'vegetal'
  ]::text[]);

comment on column public.articles.gouts is
  'La saveur ANNONCÉE sur l''emballage, pour le filtre « Goût ». À distinguer de proteines, qui dit tout ce que contient la recette : un pâté « avec agneau » peut contenir plus de poulet que d''agneau. Même vocabulaire que proteines, pour que les deux filtres se comparent.';

create index if not exists articles_gouts_gin on public.articles using gin (gouts);

-- La vitrine publique reçoit `gouts`, et rien d'autre.
--
-- La définition ci-dessous est celle qui existe, relue par `pg_get_viewdef` et
-- non reconstituée : `ordre_categorie` et `en_stock` sont des expressions
-- CALCULÉES, et le filtre porte sur cinq conditions. Une vue réécrite de mémoire
-- aurait éteint la vitrine sans que rien ne le dise — la première version de
-- cette migration inventait un `visible_en_ligne` qui n'existe pas.
--
-- Elle reste SECURITY DEFINER, comme au lot APP 24-filtres : `articles` est en
-- RLS et sa seule politique de lecture vise le personnel — en SECURITY INVOKER,
-- la vitrine publique du site serait vide. C'est donc la LISTE DES COLONNES qui
-- tient lieu de garde.
--
-- `gouts` est ajoutée EN FIN de liste, et non près de `proteines` où elle se
-- lirait mieux : Postgres refuse d'insérer une colonne au milieu d'une vue
-- remplacée (« cannot change name of view column »), et l'y mettre demanderait
-- un `drop view` — qui emporterait les droits et toute dépendance. L'ordre des
-- colonnes d'une vue ne veut rien dire de toute façon : on les lit par leur nom.
-- C'est l'ÉCRAN qui montre « Goût » avant « Contient ».
create or replace view public.articles_vitrine
with (security_invoker = false) as
select
  a.id,
  a.reference,
  a.nom,
  a.description,
  a.categorie,
  array_position(
    array['alimentation_seche', 'alimentation_humide', 'friandises', 'mastication',
          'litiere', 'colliers', 'laisses', 'harnais', 'muselieres', 'longes',
          'jouets', 'peluches', 'couchages', 'soins', 'medaillons_accessoires',
          'divers']::text[],
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
  a.gouts
from public.articles a
where a.actif = true
  and a.vendable_en_ligne = true
  and a.composant = false
  and a.statut_vitrine = 'publie'
  and (a.date_publication is null or a.date_publication <= now());

-- Les droits restent réduits à la seule lecture, comme au lot APP 24-filtres :
-- `create or replace view` ne les remet pas à zéro, mais on le redit plutôt que
-- de le supposer.
revoke all on public.articles_vitrine from anon, authenticated;
grant select on public.articles_vitrine to anon, authenticated;
