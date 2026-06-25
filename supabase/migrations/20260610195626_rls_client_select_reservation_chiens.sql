create policy client_select_reservation_chiens
on public.reservation_chiens
for select
to authenticated
using (
  reservation_id in (
    select r.id
    from public.reservations r
    where r.client_id in (
      select c.id from public.clients c where c.auth_user_id = auth.uid()
    )
  )
);
