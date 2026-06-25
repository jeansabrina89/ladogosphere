ALTER TABLE public.chiens
  ADD COLUMN IF NOT EXISTS doit_etre_isole boolean NOT NULL DEFAULT false;
