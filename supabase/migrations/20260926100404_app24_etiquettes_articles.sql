-- ── APP 24-FILTRES · A : les étiquettes des articles ──────────────────────
--
-- Ce qui permet de filtrer le catalogue : l'âge visé, le besoin, la taille du
-- chien, la protéine, la taille de l'article, sa couleur, sa matière, l'usage
-- d'un jouet — et deux cases de composition.
--
-- Le vocabulaire est FERMÉ, tenu par une contrainte CHECK avec l'opérateur
-- <@ : ce que l'écran propose et ce que la base accepte disent la même chose.
-- Sans elle, une écriture faite autrement qu'à l'écran inventerait « Géant »
-- là où le filtre cherche « geant », et l'article disparaîtrait des filtres
-- sans que rien ne le signale. Les valeurs sont donc techniques : sans
-- accent, sans majuscule, sans espace.
--
-- Les libellés français ne sont PAS ici. Ils vivent dans
-- src/lib/etiquettesArticles.ts, seul endroit qui traduise une valeur : un
-- libellé stocké en base est un libellé qu'on ne peut plus corriger sans
-- migration.
--
-- Les couleurs sont la seule liste ouverte : un fournisseur sortira toujours
-- un « bordeaux » auquel personne n'avait pensé. Elles se rangent en
-- minuscules, normalisées à la saisie, et n'ont donc pas de CHECK.
--
-- Rien n'est obligatoire : tableau vide, booléen à false, taille nulle. Les
-- articles existants ne sont pas touchés ; la liste d'articles gagne au même
-- lot un filtre « sans étiquettes » pour retrouver ce qui reste à compléter.

alter table public.articles
  add column if not exists ages            text[]  not null default '{}',
  add column if not exists besoins         text[]  not null default '{}',
  add column if not exists tailles_chien   text[]  not null default '{}',
  add column if not exists proteines       text[]  not null default '{}',
  add column if not exists sans_cereales   boolean not null default false,
  add column if not exists monoproteine    boolean not null default false,
  add column if not exists taille_article  text,
  add column if not exists couleurs        text[]  not null default '{}',
  add column if not exists matieres        text[]  not null default '{}',
  add column if not exists usages_jouet    text[]  not null default '{}';

-- ── Le vocabulaire, en base ────────────────────────────────────────────────

alter table public.articles drop constraint if exists articles_ages_check;
alter table public.articles add constraint articles_ages_check
  check (ages <@ array['chiot','junior','adulte','senior']::text[]);

alter table public.articles drop constraint if exists articles_besoins_check;
alter table public.articles add constraint articles_besoins_check
  check (besoins <@ array['sensible','light','actif']::text[]);

alter table public.articles drop constraint if exists articles_tailles_chien_check;
alter table public.articles add constraint articles_tailles_chien_check
  check (tailles_chien <@ array['petit','moyen','grand','geant']::text[]);

alter table public.articles drop constraint if exists articles_proteines_check;
alter table public.articles add constraint articles_proteines_check
  check (proteines <@ array[
    'poulet','dinde','canard','boeuf','veau','porc','agneau','gibier',
    'renne','elan','cerf','sanglier','saumon','poisson','insecte','vegetal'
  ]::text[]);

alter table public.articles drop constraint if exists articles_matieres_check;
alter table public.articles add constraint articles_matieres_check
  check (matieres <@ array[
    'cuir','nylon','biothane','corde','tissu','caoutchouc','peluche','bois','metal','autre'
  ]::text[]);

alter table public.articles drop constraint if exists articles_usages_jouet_check;
alter table public.articles add constraint articles_usages_jouet_check
  check (usages_jouet <@ array['macher','lancer','tirer','intelligence','calin']::text[]);

-- Un seul choix, et « unique » veut dire taille unique — pas « une seule ».
alter table public.articles drop constraint if exists articles_taille_article_check;
alter table public.articles add constraint articles_taille_article_check
  check (taille_article is null or taille_article in ('XS','S','M','L','XL','unique'));

-- ── Ce que chaque colonne veut dire ────────────────────────────────────────

comment on column public.articles.ages is
  'Âges visés : chiot, junior, adulte, senior. Vocabulaire fermé (CHECK). Plusieurs valeurs possibles ; vide = non renseigné, et non « tous les âges ».';
comment on column public.articles.besoins is
  'Besoins particuliers : sensible, light, actif. Vocabulaire fermé (CHECK).';
comment on column public.articles.tailles_chien is
  'Tailles de chien visées : petit, moyen, grand, geant. Vocabulaire fermé (CHECK). C''est la taille du CHIEN, pas celle de l''article.';
comment on column public.articles.proteines is
  'Protéines présentes : poulet, dinde, canard, boeuf, veau, porc, agneau, gibier, renne, elan, cerf, sanglier, saumon, poisson, insecte, vegetal. Vocabulaire fermé (CHECK). Ce n''est pas la composition légale, seulement de quoi filtrer.';
comment on column public.articles.sans_cereales is
  'Vrai si l''article est annoncé sans céréales. false = non, jamais « on ne sait pas ».';
comment on column public.articles.monoproteine is
  'Vrai si l''article ne contient qu''une seule protéine animale.';
comment on column public.articles.taille_article is
  'Taille de l''ARTICLE : XS, S, M, L, XL, ou unique (taille unique). Un seul choix, null si la question ne se pose pas.';
comment on column public.articles.couleurs is
  'Couleurs, en minuscules. SEULE liste ouverte : aucune contrainte de vocabulaire, la normalisation se fait à la saisie (src/lib/etiquettesArticles.ts).';
comment on column public.articles.matieres is
  'Matières : cuir, nylon, biothane, corde, tissu, caoutchouc, peluche, bois, metal, autre. Vocabulaire fermé (CHECK).';
comment on column public.articles.usages_jouet is
  'Usage d''un jouet : macher, lancer, tirer, intelligence, calin. Vocabulaire fermé (CHECK).';

-- ── Les index des filtres les plus demandés ────────────────────────────────
--
-- GIN, parce qu'un filtre d'étiquette demande « contient l'une de » (&&) sur
-- un tableau : un index B-tree n'y répond pas. Les quatre listes indexées
-- sont celles que le panneau propose d'emblée, avant même qu'une catégorie
-- soit choisie.

create index if not exists articles_ages_gin          on public.articles using gin (ages);
create index if not exists articles_besoins_gin       on public.articles using gin (besoins);
create index if not exists articles_tailles_chien_gin on public.articles using gin (tailles_chien);
create index if not exists articles_proteines_gin     on public.articles using gin (proteines);
