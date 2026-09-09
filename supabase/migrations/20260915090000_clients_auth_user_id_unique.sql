-- Un compte Auth ne peut tenir qu'UNE fiche client.
--
-- L'index `clients_auth_user_id_unique` a été créé à la main sur la base de
-- production le 7 septembre 2026, sans passer par une migration : le dépôt ne
-- le connaissait pas. Une base reconstruite à partir de ces fichiers n'aurait
-- donc PAS eu la garantie — c'est exactement le genre d'écart qui ne se voit
-- qu'au moment où l'on en a besoin. Cette migration l'enregistre.
--
-- Ce qu'il garantit : le trigger `lier_client_auth` (migration
-- 20260907100000) rattache une fiche libre au compte qui vient de s'inscrire,
-- et refuse désormais de détourner une fiche déjà rattachée. L'index est la
-- ceinture de cette bretelle : même si une écriture passait ailleurs — un
-- script, une reprise, une main sur la console — deux fiches ne pourront
-- jamais pointer vers le même compte. Sans lui, un client pourrait se
-- retrouver avec les réservations, les factures et les avoirs d'un autre.
--
-- Ce qu'il n'empêche PAS : une fiche sans compte. `auth_user_id` reste
-- nullable, et PostgreSQL considère deux NULL comme distincts dans un index
-- unique ordinaire — autant de fiches non rattachées qu'on veut, ce qui est le
-- cas de tous les clients créés au comptoir. Pas besoin d'un index partiel.
--
-- `if not exists` : la production le porte déjà, cette migration n'y touche
-- rien ; une base vierge le crée. Le même fichier joue les deux rôles.

create unique index if not exists clients_auth_user_id_unique
  on public.clients (auth_user_id);

comment on index public.clients_auth_user_id_unique is
  'Un compte Auth ne tient qu''une fiche client. Les fiches sans compte (auth_user_id null) ne sont pas concernées : deux NULL sont distincts.';
