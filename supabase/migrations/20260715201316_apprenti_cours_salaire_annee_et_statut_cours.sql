alter table public.employes_rh
  add column if not exists jour_cours smallint,
  add column if not exists salaire_annee_1 numeric,
  add column if not exists salaire_annee_2 numeric,
  add column if not exists salaire_annee_3 numeric,
  add column if not exists annee_apprentissage smallint;

alter table public.planning_employes drop constraint if exists planning_employes_statut_check;
alter table public.planning_employes add constraint planning_employes_statut_check
  check (statut = any (array[
    'travail','repos','vacances','repos_vacances','maladie','accident',
    'militaire','ferie','ferie_travaille','absent','heures_sup','autre','cours'
  ]));
