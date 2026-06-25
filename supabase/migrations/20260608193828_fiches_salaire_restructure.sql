-- Supprimer les anciennes tables et recréer avec la bonne structure
DROP TABLE IF EXISTS fiche_salaire_deductions CASCADE;
DROP TABLE IF EXISTS fiches_salaire CASCADE;

CREATE TABLE fiches_salaire (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employe_id UUID REFERENCES employes_rh(id) ON DELETE CASCADE,
  mois INTEGER NOT NULL,
  annee INTEGER NOT NULL,
  salaire_brut NUMERIC(10,2) NOT NULL,
  salaire_net NUMERIC(10,2) NOT NULL,
  total_deductions NUMERIC(10,2) NOT NULL,
  commentaire TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(employe_id, mois, annee)
);

CREATE TABLE fiche_salaire_deductions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fiche_id UUID REFERENCES fiches_salaire(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pourcentage', 'montant_fixe')),
  valeur NUMERIC(10,4) NOT NULL,
  montant_calcule NUMERIC(10,2) NOT NULL,
  ordre INTEGER DEFAULT 0
);
