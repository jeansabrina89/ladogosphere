ALTER TABLE public.employes_rh
  ADD COLUMN IF NOT EXISTS cfc boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.employes_rh.cfc IS 'Titulaire du CFC de Gardienne d''animaux. Au moins une personne CFC doit etre presente au chenil chaque jour (contrainte planning).';
