-- APP 74 — « MON CHIEN SEUL DANS UN BOX », À LA RÉSERVATION
--
-- Décision de Sabrina (03.10.2026) : pour une réservation donnée (journée ou
-- séjour), un client peut demander que son chien SOCIABLE soit seul dans un
-- box. Il paie alors le tarif « seul » (journee_privatif / sejour_privatif),
-- et ses journées de garderie se débitent sur une carte « 1 chien seul ».
--
-- ── 1. LA COLONNE ─────────────────────────────────────────────────────────
--
-- `box_seul` dit le CHOIX fait pour cette réservation. Il ne remplace pas le
-- profil du chien : un chien « doit être isolé » reste seul sans qu'on coche
-- quoi que ce soit. La règle unique, côté application, est
-- `estPrivatifReservation` (src/lib/cohabitation.ts) : box_seul OU profil.
--
-- Les réservations existantes restent à false. Leur prix est déjà calculé et
-- figé ; rien ne le recalcule à cause de cette colonne.

alter table public.reservations
  add column if not exists box_seul boolean not null default false;

comment on column public.reservations.box_seul is
  'Le client (ou l''équipe) a demandé que le chien soit seul dans un box pour cette réservation : tarif « seul », carte « 1 chien seul », box entier. APP 74.';

-- ── 2. LE FILET DE SÉCURITÉ ANTI-SURBOOKING ──────────────────────────────
--
-- Ce que le trigger d'avant (20260812210152) refusait, il le refuse
-- toujours, et rien de plus large : un box occupé par un AUTRE client sur des
-- dates qui se chevauchent vraiment (plus d'un jour partagé). Il ne regardait
-- JAMAIS le profil des chiens, pas même « doit être isolé » : l'isolement
-- restait une règle de l'application seule.
--
-- Ce qui s'ajoute : une réservation qui occupe le box ENTIER ne le partage
-- avec AUCUNE autre réservation sur des dates qui se chevauchent — pas même
-- avec un chien de la même famille, que le trigger laissait passer jusqu'ici.
-- Et l'inverse : on ne loge personne dans un box déjà pris par elle.
--
-- Une réservation occupe le box entier quand (décision de Sabrina,
-- 03.10.2026, « exactement comme ») :
--   · elle porte `box_seul` ;
--   · OU l'un de ses chiens est marqué « doit être isolé ».
-- Le profil est lu ICI, dans la fonction, par une jointure sur
-- reservation_chiens → chiens : aucune fonction appelée, donc aucune porte
-- ouverte (la règle d'AGENTS.md « une fonction SQL naît fermée » tient).
--
-- Vérifié avant d'appliquer (3 octobre 2026) : aucune occupation existante,
-- données de test comprises, ne viole cette règle — 11 occupations, aucune
-- paire qui se chevauche, aucune réservation avec un chien isolé.
--
-- Le relais du même jour (une réservation part, l'autre arrive le même jour)
-- reste permis, comme avant : c'est la logique des créneaux matin / soir de
-- l'application qui en décide (greatest(début) < least(fin) est faux quand
-- seul le jour-frontière est partagé).

create or replace function public.bloquer_surbooking_box()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_new uuid;
  v_seule_new boolean;
  v_conflits int;
begin
  if new.box_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.box_id::text, 0));

  -- La réservation qu'on loge : son client, et occupe-t-elle le box entier ?
  select r.client_id,
         coalesce(r.box_seul, false) or exists (
           select 1
             from public.reservation_chiens rc
             join public.chiens c on c.id = rc.chien_id
            where rc.reservation_id = r.id
              and c.doit_etre_isole = true
         )
    into v_client_new, v_seule_new
  from public.reservations r
  where r.id = new.reservation_id;

  select count(*) into v_conflits
  from public.occupation_boxes o
  join public.reservations r2 on r2.id = o.reservation_id
  where o.box_id = new.box_id
    and o.id is distinct from new.id
    and o.reservation_id is distinct from new.reservation_id
    and greatest(o.date_debut, new.date_debut) < least(o.date_fin, new.date_fin)
    and (
      -- La règle d'avant : un autre client.
      r2.client_id is distinct from v_client_new
      -- APP 74 : la réservation qu'on loge occupe le box entier…
      or coalesce(v_seule_new, false)
      -- … ou celle qui y est déjà : box_seul, ou un chien « doit être isolé ».
      or coalesce(r2.box_seul, false)
      or exists (
        select 1
          from public.reservation_chiens rc2
          join public.chiens c2 on c2.id = rc2.chien_id
         where rc2.reservation_id = r2.id
           and c2.doit_etre_isole = true
      )
    );

  if v_conflits > 0 then
    raise exception 'Ce box est déjà occupé sur des dates qui se chevauchent (autre client, ou chien seul dans son box). Choisissez un autre box ou d''autres dates.'
      using errcode = 'exclusion_violation';
  end if;

  return new;
end;
$$;

-- Une fonction SQL naît fermée (AGENTS.md) : seul le trigger l'exécute, avec
-- les droits de son propriétaire. Personne ne l'appelle par /rest/v1/rpc.
revoke execute on function public.bloquer_surbooking_box() from public, anon, authenticated;
grant execute on function public.bloquer_surbooking_box() to service_role;

-- Le trigger lui-même ne change pas ; il est redit pour qu'une base
-- reconstruite depuis le dépôt soit identique à celle-ci.
drop trigger if exists trg_occupation_boxes_anti_surbooking on public.occupation_boxes;

create trigger trg_occupation_boxes_anti_surbooking
before insert on public.occupation_boxes
for each row
execute function public.bloquer_surbooking_box();
