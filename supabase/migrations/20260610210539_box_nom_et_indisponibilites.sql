-- 1) Libellé optionnel pour renommer une box (en plus du numéro)
ALTER TABLE public.boxes
  ADD COLUMN IF NOT EXISTS nom text;

-- 2) Indisponibilités par plage de dates
CREATE TABLE IF NOT EXISTS public.box_indisponibilites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id uuid NOT NULL REFERENCES public.boxes(id) ON DELETE CASCADE,
  date_debut date NOT NULL,
  date_fin date NOT NULL,
  motif text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT box_indispo_dates_coherentes CHECK (date_fin >= date_debut)
);

-- Index pour les requêtes de chevauchement de dates
CREATE INDEX IF NOT EXISTS idx_box_indispo_box_dates
  ON public.box_indisponibilites (box_id, date_debut, date_fin);

-- 3) RLS : même schéma que les autres tables (admin uniquement, via is_admin())
ALTER TABLE public.box_indisponibilites ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_box_indisponibilites
  ON public.box_indisponibilites
  FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
