-- Rafraîchit le montant des cotisations en attente figées à une ancienne valeur
-- (ex. 180 créées avant le passage à 200) sur la valeur courante du paramètre.
-- Ne touche PAS les cotisations déjà payées (montant historique conservé).
BEGIN;

UPDATE public.cotisations_membres
SET montant = (SELECT valeur::numeric FROM public.parametres WHERE cle = 'cotisation_montant')
WHERE statut = 'en_attente'
  AND montant <> (SELECT valeur::numeric FROM public.parametres WHERE cle = 'cotisation_montant');

COMMIT;
