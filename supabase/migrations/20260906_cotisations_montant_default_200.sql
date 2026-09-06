-- Montant par défaut de la cotisation membre : 180 -> 200.
-- Déjà appliqué en production ; cette migration met le dépôt en phase avec la
-- base. Idempotente : SET DEFAULT est rejouable sans effet de bord.
alter table public.cotisations_membres alter column montant set default 200;
