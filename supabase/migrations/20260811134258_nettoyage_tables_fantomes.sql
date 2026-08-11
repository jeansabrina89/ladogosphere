-- Nettoyage des tables fantômes réellement mortes (audit #18, révisé le 2026-08-11).
-- paiements CONSERVÉE : encore utilisée par le règlement de facture groupée
--   (app/(admin)/factures/[id]/actions.ts). Vérifié : les 4 tables ci-dessous ont
--   0 ligne, aucune référence dans le code, aucune FK entrante depuis une table conservée.
BEGIN;

DROP TABLE IF EXISTS
  public.facture_services,
  public.recus,
  public.parametres_generaux,
  public.adhesions;

-- paiements redevient une table vivante : on indexe sa clé étrangère active.
CREATE INDEX IF NOT EXISTS idx_paiements_facture_id ON public.paiements(facture_id);

COMMIT;
