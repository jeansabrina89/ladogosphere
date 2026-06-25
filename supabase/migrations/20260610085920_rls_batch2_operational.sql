do $$
declare t text;
begin
  foreach t in array array[
    'contacts_urgence','chiens','photos_chiens','vaccins','chaleurs',
    'boxes','reservations','reservation_chiens','occupation_boxes','checkin_checkout',
    'ententes_chiens','calendrier_essais','liste_attente',
    'parametres_generaux','parametres','tarifs','services_supplementaires',
    'vacances_scolaires','jours_feries','fermetures_exceptionnelles'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', 'admin_all_'||t, t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin());', 'admin_all_'||t, t);
  end loop;
end $$;
