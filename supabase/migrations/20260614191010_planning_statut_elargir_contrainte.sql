-- Élargit les statuts autorisés pour stocker chaque statut UI tel quel
-- (plus de fusion ferie_travaille/absent/heures_sup -> ferie/autre).
-- Élargissement uniquement : aucune donnée existante ne peut violer la nouvelle contrainte.
ALTER TABLE public.planning_employes DROP CONSTRAINT planning_employes_statut_check;

ALTER TABLE public.planning_employes ADD CONSTRAINT planning_employes_statut_check
  CHECK (statut = ANY (ARRAY[
    'travail','repos','vacances','maladie','accident','militaire',
    'ferie','ferie_travaille','absent','heures_sup','autre'
  ]::text[]));
