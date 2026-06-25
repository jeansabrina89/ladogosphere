-- clients : le client lit sa propre fiche
drop policy if exists client_self_select on public.clients;
create policy client_self_select on public.clients for select to authenticated
  using (auth_user_id = auth.uid());

-- chiens : le client lit ses propres chiens
drop policy if exists client_select_chiens on public.chiens;
create policy client_select_chiens on public.chiens for select to authenticated
  using (client_id in (select id from public.clients where auth_user_id = auth.uid()));

-- reservations : le client lit ses propres réservations
drop policy if exists client_select_reservations on public.reservations;
create policy client_select_reservations on public.reservations for select to authenticated
  using (client_id in (select id from public.clients where auth_user_id = auth.uid()));

-- calendrier_essais : tout utilisateur connecté peut lire les disponibilités
drop policy if exists auth_read_calendrier_essais on public.calendrier_essais;
create policy auth_read_calendrier_essais on public.calendrier_essais for select to authenticated
  using (true);
