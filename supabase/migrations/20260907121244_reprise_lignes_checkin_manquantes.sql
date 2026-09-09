-- Correctif de recette B6 — reprise des réservations non annulées dont un chien
-- n'a aucune ligne de check-in. Mêmes règles que assurerLignesCheckin :
-- heure d'un essai forcé, puis heure saisie, puis 09:00 / 17:00.
insert into public.checkin_checkout (reservation_id, chien_id, date_arrivee_prevue, date_depart_prevu, statut)
select
  r.id,
  rc.chien_id,
  (r.date_debut::text || 'T' ||
    coalesce(
      substring(nullif(trim(r.essai_force_heure::text), '') from 1 for 5),
      substring(nullif(trim(r.heure_arrivee::text), '') from 1 for 5),
      '09:00'
    ) || ':00')::timestamp,
  (r.date_fin::text || 'T' ||
    coalesce(substring(nullif(trim(r.heure_depart::text), '') from 1 for 5), '17:00')
    || ':00')::timestamp,
  'attendu'
from public.reservations r
join public.reservation_chiens rc on rc.reservation_id = r.id
left join public.checkin_checkout cc
  on cc.reservation_id = r.id and cc.chien_id = rc.chien_id
where r.statut not in ('annulee', 'refusee')
  and cc.id is null;