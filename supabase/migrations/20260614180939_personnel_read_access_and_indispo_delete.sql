-- Lecture pour le personnel (admin + employé actif) sur les tables opérationnelles.
-- Policies ADDITIVES : aucune policy existante supprimée, admin_all conservé.
-- Règle #3 (suggestion de box), #4 (calcul de prix), et débloque la sélection chien/client.

create policy personnel_select_boxes on public.boxes
  for select to authenticated using (is_personnel());

create policy personnel_select_box_indisponibilites on public.box_indisponibilites
  for select to authenticated using (is_personnel());

create policy personnel_select_occupation_boxes on public.occupation_boxes
  for select to authenticated using (is_personnel());

create policy personnel_select_tarifs on public.tarifs
  for select to authenticated using (is_personnel());

create policy personnel_select_parametres on public.parametres
  for select to authenticated using (is_personnel());

create policy personnel_select_reservations on public.reservations
  for select to authenticated using (is_personnel());

create policy personnel_select_clients on public.clients
  for select to authenticated using (is_personnel());

create policy personnel_select_chiens on public.chiens
  for select to authenticated using (is_personnel());

-- Règle #1 : l'employé peut supprimer ses propres jours d'indisponibilité RH.
create policy employe_delete_indispo on public.indisponibilites
  for delete to public using (employe_id = mon_employe_id());
