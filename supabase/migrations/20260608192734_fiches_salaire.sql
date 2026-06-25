-- Table des fiches de salaire
CREATE TABLE IF NOT EXISTS fiches_salaire (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id UUID REFERENCES employes_rh(id) ON DELETE CASCADE,
  mois INTEGER NOT NULL, -- 1-12
  annee INTEGER NOT NULL,
  salaire_brut NUMERIC(10,2) NOT NULL,
  salaire_net NUMERIC(10,2) NOT NULL,
  total_deductions NUMERIC(10,2) NOT NULL,
  commentaire TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(employe_id, mois, annee)
);

-- Table des lignes de déduction par fiche
CREATE TABLE IF NOT EXISTS fiche_salaire_deductions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fiche_id UUID REFERENCES fiches_salaire(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pourcentage', 'montant_fixe')),
  valeur NUMERIC(10,4) NOT NULL, -- % ou CHF
  montant_calcule NUMERIC(10,2) NOT NULL,
  ordre INTEGER DEFAULT 0
);

-- Table des modèles de déductions (configurables par admin)
CREATE TABLE IF NOT EXISTS modeles_deductions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pourcentage', 'montant_fixe')),
  valeur NUMERIC(10,4) NOT NULL,
  actif BOOLEAN DEFAULT true,
  ordre INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insérer les déductions standard Valais
INSERT INTO modeles_deductions (label, type, valeur, ordre) VALUES
  ('AVS/AI/APG (part employé)', 'pourcentage', 5.30, 1),
  ('Assurance chômage (AC)', 'pourcentage', 1.10, 2),
  ('Assurance accidents non-professionnels (AANP)', 'pourcentage', 1.20, 3),
  ('Indemnité journalière maladie (IJM)', 'pourcentage', 1.50, 4),
  ('LPP (caisse de retraite)', 'montant_fixe', 200.00, 5),
  ('Impôt à la source', 'pourcentage', 8.00, 6);
