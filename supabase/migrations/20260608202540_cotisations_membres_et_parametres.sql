-- Table cotisations membres
CREATE TABLE IF NOT EXISTS cotisations_membres (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  annee INTEGER NOT NULL,
  montant NUMERIC(10,2) NOT NULL DEFAULT 180,
  mode_paiement TEXT CHECK (mode_paiement IN ('cash', 'virement', 'prochaine_resa')),
  statut TEXT DEFAULT 'payee' CHECK (statut IN ('payee', 'en_attente')),
  date_paiement DATE,
  reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(client_id, annee)
);

-- Table paramètres globaux
CREATE TABLE IF NOT EXISTS parametres (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cle TEXT UNIQUE NOT NULL,
  valeur TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insérer le montant de la cotisation par défaut
INSERT INTO parametres (cle, valeur, description)
VALUES ('cotisation_montant', '180', 'Montant annuel de la cotisation membre en CHF')
ON CONFLICT (cle) DO NOTHING;
