-- Réservations au tarif membre uniquement.
-- Désactive (sans supprimer) tous les tarifs non-membres. Réversible :
--   UPDATE public.tarifs SET actif = true WHERE membre = false;
-- Le calcul et les pages (admin + client) filtrent déjà actif = true et
-- résolvent le prix sur le tarif membre.
BEGIN;

UPDATE public.tarifs SET actif = false WHERE membre = false;

COMMIT;
