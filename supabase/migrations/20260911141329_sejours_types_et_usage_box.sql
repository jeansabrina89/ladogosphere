-- ── Types de séjour, et usage des box ─────────────────────────────────────
--
-- Une réservation ne dit pas encore POURQUOI le chien est là. Les quatre
-- raisons ne se facturent pas pareil et ne se comptent pas pareil :
--
--   pension   — un client qui paie. C'est l'activité.
--   personnel — le chien d'un membre de l'équipe. Gratuit, déjà en place via
--               `clients.interne` ; le type ne fait que le nommer.
--   urgence   — un accueil en urgence, au tarif d'urgence existant.
--   abandon   — un chien abandonné. Gratuit par défaut, mais un refuge ou une
--               commune peut participer : le montant reste libre.
--
-- Deux règles opposées, et c'est volontaire :
--
--   · les CHIFFRES D'ACTIVITÉ ne comptent que 'pension'. Un chien accueilli
--     gratuitement n'est pas du chiffre d'affaires, et le faire entrer dans la
--     moyenne rendrait le panier moyen et la comparaison annuelle faux.
--   · la DISPONIBILITÉ compte tout. Une place prise est une place prise,
--     quelle qu'en soit la raison : rien n'est filtré côté planning, box,
--     check-in ou vérification de place.
--
-- Aucun comportement de facturation ne change ici : la gratuité du personnel
-- et le tarif d'urgence existaient déjà, le type ne fait que les rattacher.
-- Aucune facture, commande ou écriture passée n'est touchée.

alter table public.reservations
  add column if not exists type_sejour text not null default 'pension';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reservations_type_sejour_check'
  ) then
    alter table public.reservations
      add constraint reservations_type_sejour_check
      check (type_sejour in ('pension', 'personnel', 'urgence', 'abandon'));
  end if;
end $$;

comment on column public.reservations.type_sejour is
  'Pourquoi le chien est là. Seul « pension » entre dans les chiffres d''activité ; tous les types occupent un box.';

-- Le filtre des statistiques porte sur cette colonne : il doit être indexé.
create index if not exists idx_reservations_type_sejour
  on public.reservations (type_sejour);

-- Reprise : ce qui appartient à une fiche interne devient 'personnel'. Tout le
-- reste garde le défaut 'pension' — y compris les réservations marquées
-- `urgence`, qui restent de la pension facturée au tarif d'urgence. Le type
-- 'urgence' est une qualification NOUVELLE, il ne se devine pas depuis
-- l'ancien drapeau.
update public.reservations r
   set type_sejour = 'personnel'
  from public.clients c
 where c.id = r.client_id
   and c.interne = true
   and r.type_sejour = 'pension';

-- ── L'usage d'un box ──────────────────────────────────────────────────────
--
-- Les quatorze box de la maison ne servent pas tous la pension :
--
--   pension          — les douze qui accueillent des clients.
--   prive_hors_sarl  — celui des chiens de Sabrina. Aucun loyer pour la Sàrl.
--   refacture        — celui de Belle : loyer payé à la propriétaire, puis
--                      refacturé au propriétaire du chien.
--
-- Le défaut est 'pension' : c'est le cas des douze, et c'est aussi la valeur
-- qui ne change rien à la disponibilité. Les deux box particuliers sont à
-- qualifier À LA MAIN depuis l'écran Box — on ne les devine pas d'après un nom
-- ou un numéro, qui peuvent changer.

alter table public.boxes
  add column if not exists usage_box text not null default 'pension';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'boxes_usage_box_check'
  ) then
    alter table public.boxes
      add constraint boxes_usage_box_check
      check (usage_box in ('pension', 'prive_hors_sarl', 'refacture'));
  end if;
end $$;

comment on column public.boxes.usage_box is
  'pension : disponible pour la clientèle. prive_hors_sarl : chiens de la propriétaire, hors Sàrl, aucun loyer. refacture : loyer payé puis refacturé au propriétaire du chien. N''enlève aucune place : un box particulier occupe toujours de la surface.';