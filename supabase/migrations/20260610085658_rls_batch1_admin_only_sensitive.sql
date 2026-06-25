do $$
declare t text;
begin
  foreach t in array array[
    'fiches_salaire','fiche_salaire_deductions','modeles_deductions',
    'employes_rh','planning_employes','timbrage','demandes_vacances','indisponibilites',
    'factures','paiements','recus','facture_services',
    'cotisations_membres','adhesions'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', 'admin_all_'||t, t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin());', 'admin_all_'||t, t);
  end loop;
end $$;
