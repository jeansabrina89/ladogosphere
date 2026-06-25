-- Resserre la lecture de calendrier_essais : admin + personnel uniquement.
-- (admin garde l'accès via la policy ALL admin_all_calendrier_essais)
drop policy if exists "auth_read_calendrier_essais" on public.calendrier_essais;

create policy "personnel_select_calendrier_essais"
  on public.calendrier_essais
  for select
  to authenticated
  using (is_admin() or is_personnel());
