-- profiles : admin total + lecture de son propre profil
alter table public.profiles enable row level security;
drop policy if exists admin_all_profiles on public.profiles;
create policy admin_all_profiles on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists self_read_profiles on public.profiles;
create policy self_read_profiles on public.profiles for select to authenticated
  using (id = auth.uid());

-- clients : admin (accès client = Étape B)
alter table public.clients enable row level security;
drop policy if exists admin_all_clients on public.clients;
create policy admin_all_clients on public.clients for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
