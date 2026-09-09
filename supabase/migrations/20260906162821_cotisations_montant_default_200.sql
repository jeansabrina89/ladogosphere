-- APPLIQUÉE DEUX FOIS en production, sous ce nom : 20260906162821 (ce fichier)
-- puis 20260906164724. Un seul fichier ici, nommé d'après la première : le
-- dépôt ne porte pas de doublon. L'instruction est idempotente, la seconde
-- application n'a donc rien changé — mais la table `schema_migrations` en garde
-- les deux lignes, et c'est elle qui dit la vérité de ce qui a tourné.
--
-- Montant par défaut de la cotisation membre : 180 -> 200.
-- Déjà appliqué en production ; cette migration met le dépôt en phase avec la
-- base. Idempotente : SET DEFAULT est rejouable sans effet de bord.
alter table public.cotisations_membres alter column montant set default 200;
