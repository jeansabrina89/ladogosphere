ALTER TABLE public.reservations
  DROP CONSTRAINT reservations_mode_paiement_check;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_mode_paiement_check
  CHECK (mode_paiement = ANY (ARRAY['twint'::text, 'cash'::text, 'iban'::text, 'stripe'::text, 'autre'::text, 'avoir'::text]));
