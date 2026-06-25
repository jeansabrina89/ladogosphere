ALTER TABLE public.planning_employes DROP CONSTRAINT planning_employes_statut_check;
ALTER TABLE public.planning_employes ADD CONSTRAINT planning_employes_statut_check
  CHECK (statut = ANY (ARRAY['travail'::text, 'repos'::text, 'vacances'::text, 'repos_vacances'::text, 'maladie'::text, 'accident'::text, 'militaire'::text, 'ferie'::text, 'ferie_travaille'::text, 'absent'::text, 'heures_sup'::text, 'autre'::text]));
