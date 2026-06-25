-- TIMBRAGE : l'employé gère ses propres pointages
create policy employe_self_select_timbrage on public.timbrage
  for select using (employe_id = mon_employe_id());
create policy employe_insert_timbrage on public.timbrage
  for insert with check (employe_id = mon_employe_id());
create policy employe_update_timbrage on public.timbrage
  for update using (employe_id = mon_employe_id()) with check (employe_id = mon_employe_id());

-- INDISPONIBILITES : idem
create policy employe_self_select_indispo on public.indisponibilites
  for select using (employe_id = mon_employe_id());
create policy employe_insert_indispo on public.indisponibilites
  for insert with check (employe_id = mon_employe_id());
create policy employe_update_indispo on public.indisponibilites
  for update using (employe_id = mon_employe_id()) with check (employe_id = mon_employe_id());

-- DEMANDES_VACANCES : l'employé crée/voit/édite ses demandes (l'admin approuve)
create policy employe_self_select_vacances on public.demandes_vacances
  for select using (employe_id = mon_employe_id());
create policy employe_insert_vacances on public.demandes_vacances
  for insert with check (employe_id = mon_employe_id());
create policy employe_update_vacances on public.demandes_vacances
  for update using (employe_id = mon_employe_id()) with check (employe_id = mon_employe_id());

-- PLANNING_EMPLOYES : lecture seule de son planning
create policy employe_self_select_planning on public.planning_employes
  for select using (employe_id = mon_employe_id());

-- FICHES_SALAIRE : lecture seule de ses fiches
create policy employe_self_select_fiches_salaire on public.fiches_salaire
  for select using (employe_id = mon_employe_id());

-- FICHE_SALAIRE_DEDUCTIONS : lecture seule via la fiche parente
create policy employe_self_select_fiche_deductions on public.fiche_salaire_deductions
  for select using (fiche_id in (select id from fiches_salaire where employe_id = mon_employe_id()));
