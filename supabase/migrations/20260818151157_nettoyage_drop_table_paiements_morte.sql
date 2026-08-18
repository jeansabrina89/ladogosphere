-- Table paiements : morte depuis le passage a paiements_resa (journal atomique par
-- paiement). Verifie avant suppression : 0 ligne, aucune reference dans le code,
-- aucun trigger, aucune vue dependante, aucune fonction. Seule dependance : la
-- colonne avoirs_mouvements.paiement_id (0 valeur non nulle sur 28 lignes), qui
-- portait la FK et disparait avec elle.
ALTER TABLE public.avoirs_mouvements DROP COLUMN IF EXISTS paiement_id;
DROP TABLE IF EXISTS public.paiements;
