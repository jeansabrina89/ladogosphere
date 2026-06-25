ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS reference_qr text;
COMMENT ON COLUMN public.factures.reference_qr IS 'Reference QRR (27 chiffres) figee a l emission de la facture, pour le rapprochement camt.054';
