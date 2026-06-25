-- Nouvelle colonne texte à 3 valeurs
ALTER TABLE public.chiens
  ADD COLUMN IF NOT EXISTS sterilisation text
  CHECK (sterilisation IN ('oui','non','chimique'));

-- Reprise des données existantes depuis le booléen
UPDATE public.chiens
  SET sterilisation = CASE WHEN sterilise IS TRUE THEN 'oui' ELSE 'non' END
  WHERE sterilisation IS NULL;

-- Valeur par défaut pour les nouveaux chiens
ALTER TABLE public.chiens
  ALTER COLUMN sterilisation SET DEFAULT 'non';
