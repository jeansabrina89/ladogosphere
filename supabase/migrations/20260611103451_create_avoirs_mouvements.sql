-- Registre des mouvements d'avoir (le solde = somme des montants par client)
CREATE TABLE IF NOT EXISTS public.avoirs_mouvements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  montant numeric(10,2) NOT NULL,                 -- + crédit, - débit
  type text NOT NULL CHECK (type IN ('ajout_manuel','retrait_manuel','annulation_paiement','utilisation')),
  motif text,
  reservation_id uuid REFERENCES public.reservations(id) ON DELETE SET NULL,
  facture_id uuid REFERENCES public.factures(id) ON DELETE SET NULL,
  paiement_id uuid REFERENCES public.paiements(id) ON DELETE SET NULL,
  created_by uuid,                                -- admin (auth uid), pour l'audit
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avoirs_mouvements_client
  ON public.avoirs_mouvements (client_id, created_at);

ALTER TABLE public.avoirs_mouvements ENABLE ROW LEVEL SECURITY;

-- Admin : accès total (même schéma que les autres tables)
CREATE POLICY admin_all_avoirs_mouvements
  ON public.avoirs_mouvements
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

-- Client : lecture seule de SES propres mouvements (même pattern que chiens/reservations)
CREATE POLICY client_select_avoirs_mouvements
  ON public.avoirs_mouvements
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT clients.id FROM public.clients WHERE clients.auth_user_id = auth.uid()));
