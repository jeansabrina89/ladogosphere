-- APP 64 — LES HORAIRES D'ACCUEIL, LISIBLES PAR LE SITE
--
-- Décision de Sabrina (30.09.2026) : toutes les heures de la pension suivent
-- Réglages → Entreprise → Horaires d'accueil. Le site ladogosphere.ch doit
-- donc pouvoir les lire, avec la clé publique, sans qu'on les recopie à la
-- main dans ses pages — une recopie, c'est un horaire qui finit par mentir.
--
-- ── CE QUE LA VUE EXPOSE, ET RIEN D'AUTRE ─────────────────────────────────
--
-- `parametres` contient bien plus que des horaires : la grille des frais de
-- port, le régime de TVA, les textes d'e-mails, des réglages internes. Elle
-- reste FERMÉE à anon. La vue n'en sort que DEUX colonnes (`cle`, `valeur`)
-- et CINQ lignes : exactement les clés de `CLES_HORAIRES`
-- (src/lib/horaires.ts). Un test relit cette liste et la compare à celle du
-- code, terme à terme : une sixième clé ajoutée ici, ou oubliée là, le fait
-- rougir.
--
-- ── LES DROITS (sur le modèle de `fermetures_pension_publiques`) ──────────
--
-- La vue est `security_invoker = false`, donc SECURITY DEFINER : elle lit la
-- table avec les droits de son propriétaire, ce qui permet au visiteur de la
-- consulter sans aucun droit sur `parametres` — et c'est précisément ce qu'on
-- veut : cinq lignes visibles, trente-trois invisibles.
--
-- ATTENTION, et c'est la leçon d'APP 26 : ce report de droits ne vaut QUE POUR
-- LES TABLES. Le privilège EXECUTE d'une fonction est vérifié avec le rôle
-- courant, donc une vue SECURITY DEFINER qui appellerait une fonction fermée
-- serait fermée elle aussi — et la suite de tests, qui lit avec la clé de
-- service, ne le verrait pas. Cette vue n'appelle AUCUNE fonction : elle ne
-- fait que choisir deux colonnes et cinq lignes. Elle ne doit jamais en
-- appeler. Ouvrir une fonction à anon pour la servir serait la mauvaise
-- correction : appelable par /rest/v1/rpc avec la clé publique du site, elle
-- rendrait ce que la vue refuse justement de publier.
--
-- À la différence de `fermetures_pension_publiques`, réservée aux clients
-- connectés, celle-ci est lisible par anon : le site est public, et des
-- horaires d'ouverture n'ont rien de confidentiel — ils sont affichés sur la
-- porte.
--
-- Pas de `description` ni d'`updated_at` : ce sont des notes pour l'équipe et
-- une trace de travail, pas des horaires.

create or replace view public.horaires_publics
with (security_invoker = false) as
  select p.cle, p.valeur
    from public.parametres p
   where p.cle in (
     'horaires_journee_arrivee',
     'horaires_journee_depart',
     'horaires_sejour',
     'horaires_essai_arrivee',
     'horaires_essai_depart'
   );

-- `create or replace view` ne redonne pas les droits sur une base reconstruite
-- depuis le dépôt : on les dit ici (leçon d'APP 34). Lecture seule.
revoke all on public.horaires_publics from public, anon, authenticated;
grant select on public.horaires_publics to anon, authenticated;

comment on view public.horaires_publics is
  'Les cinq horaires d''accueil (CLES_HORAIRES) tels que le site public les lit : cle et valeur, rien de plus. SECURITY DEFINER, et sans aucun appel de fonction (cf. APP 26).';
