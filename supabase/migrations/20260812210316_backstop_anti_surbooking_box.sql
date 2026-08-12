-- Backstop anti double-réservation de box (défense en profondeur).
-- Empêche, au niveau base, le cas dangereux et non ambigu : un même box occupé
-- par un AUTRE client sur des dates qui se chevauchent réellement (> 1 jour partagé).
-- Ne bloque JAMAIS :
--   * la co-occupation d'un même box par les chiens d'une MÊME famille (même client_id) ;
--   * les relais le même jour (date_fin d'une résa = date_debut d'une autre) — laissés
--     à la logique applicative (créneaux matin/soir), car greatest(debut) < least(fin)
--     est faux quand seul le jour-frontière est partagé.
-- Les règles fines (capacité famille, isolement, compatibilité gabarit, horaires du
-- jour-frontière) restent gérées par l'application ; ce trigger est un filet de sécurité
-- contre la course (TOCTOU) entre deux créations simultanées.
-- Un verrou consultatif par box sérialise les insertions concurrentes sur le même box.

create or replace function public.bloquer_surbooking_box()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_new uuid;
  v_conflits int;
begin
  if new.box_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.box_id::text, 0));

  select r.client_id into v_client_new
  from public.reservations r
  where r.id = new.reservation_id;

  select count(*) into v_conflits
  from public.occupation_boxes o
  join public.reservations r2 on r2.id = o.reservation_id
  where o.box_id = new.box_id
    and o.id is distinct from new.id
    and o.reservation_id is distinct from new.reservation_id
    and r2.client_id is distinct from v_client_new
    and greatest(o.date_debut, new.date_debut) < least(o.date_fin, new.date_fin);

  if v_conflits > 0 then
    raise exception 'Ce box est déjà occupé par un autre client sur des dates qui se chevauchent (protection anti double-réservation). Choisissez un autre box ou d''autres dates.'
      using errcode = 'exclusion_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.bloquer_surbooking_box() from public, anon, authenticated;

drop trigger if exists trg_occupation_boxes_anti_surbooking on public.occupation_boxes;

create trigger trg_occupation_boxes_anti_surbooking
before insert on public.occupation_boxes
for each row
execute function public.bloquer_surbooking_box();
