-- #6 : le personnel voit le planning complet de l'équipe (en plus de ses propres lignes).
-- Policy additive ; la policy "ses lignes" et admin_all restent en place.
create policy personnel_select_planning on public.planning_employes
  for select to authenticated using (is_personnel());
