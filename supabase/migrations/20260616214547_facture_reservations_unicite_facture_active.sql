ALTER TABLE facture_reservations
  ADD COLUMN IF NOT EXISTS facture_annulee boolean NOT NULL DEFAULT false;

-- Backfill : marque comme annulées les liaisons des factures déjà annulées
UPDATE facture_reservations fr
SET facture_annulee = true
FROM factures f
WHERE f.id = fr.facture_id AND f.statut = 'annulee';

-- Une réservation ne peut être liée qu'à UNE facture active à la fois
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reservation_facture_active
ON facture_reservations (reservation_id)
WHERE facture_annulee = false;
