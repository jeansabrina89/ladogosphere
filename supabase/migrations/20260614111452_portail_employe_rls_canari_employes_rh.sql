-- Personnel = admin ou employé actif
create or replace function public.is_personnel()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('admin','employe')
      and actif is not false
  );
$$;

-- id de la fiche employes_rh liée au compte connecté (security definer = contourne la RLS, pas de récursion)
create or replace function public.mon_employe_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from employes_rh where profile_id = auth.uid() limit 1;
$$;

-- CANARI : un employé peut lire SA propre fiche RH (en plus de la policy admin existante)
create policy employe_self_select_employes_rh
  on public.employes_rh
  for select
  using (profile_id = auth.uid());
