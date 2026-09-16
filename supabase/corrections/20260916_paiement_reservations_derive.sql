-- Reprise : le paiement de chaque réservation se recalcule depuis ses factures.
--
-- Depuis la migration 20260916183512_paiement_reservation_derive, statut_paiement,
-- montant_paye et montant_restant d'une réservation se DÉRIVENT des factures qui
-- la couvrent et du journal des paiements (src/lib/paiementReservation.ts). Les
-- réservations existantes portent encore les valeurs d'avant, écrites par deux
-- chemins qui ne se parlaient pas. Ce script applique la même règle, une fois.
--
-- LA RÈGLE — identique ligne pour ligne à deriverPaiement() ; les deux calculs
-- ont été confrontés sur les 26 réservations avant exécution, sans écart.
--   dû    : lignes de la réservation sur ses factures définitives émises (hors
--           « annulee »), moins celles reprises par des avoirs sur ces factures ;
--           sans facture définitive : le prix, ou 0 si réglée par carte,
--           offerte, ou fiche du personnel.
--   payé  : paiements rattachés à la réservation seule
--         + part des paiements de chaque facture (définitive ou acompte) au
--           prorata des lignes de la réservation
--         − trop-perçus reversés en avoir
--         + avoir consommé sur la réservation AVANT le journal des paiements
--           (migration 20260623181111 — 23 juin 2026 18:11:11 UTC).
--   reste : max(0, dû − payé).
--   statut: paye si reste nul et (payé, facturée, réglée autrement ou dû > 0) ;
--           partiel si une part est payée ; impaye sinon.
--
-- Seules les réservations dont une valeur change sont mises à jour, et chacune
-- laisse une trace au journal (avant / après). Aucune écriture comptable, aucun
-- paiement, aucune facture n'est créé, modifié ni supprimé. Le trigger
-- trg_flip_cotisation_au_paiement peut marquer payée une adhésion embarquée
-- dans une réservation qui passe à « paye » : c'est sa règle, inchangée.

begin;

create temporary table derive_paiement on commit drop as
with lignes as (
  select fl.reservation_id, f.id facture_id, f.type, f.statut, f.facture_origine_id,
         sum(fl.montant) lignes_resa
    from public.facture_lignes fl join public.factures f on f.id = fl.facture_id
   where fl.reservation_id is not null and f.numero is not null
   group by fl.reservation_id, f.id, f.type, f.statut, f.facture_origine_id
),
totaux as (select facture_id, sum(montant) total from public.facture_lignes group by facture_id),
payes as (
  select facture_id, sum(montant) paye from public.paiements_resa
   where facture_id is not null group by facture_id
),
pieces as (
  select l.*, coalesce(t.total, 0) total, coalesce(p.paye, 0) paye, o.type type_origine
    from lignes l
    left join totaux t on t.facture_id = l.facture_id
    left join payes p on p.facture_id = l.facture_id
    left join public.factures o on o.id = l.facture_origine_id
),
calc as (
  select r.id, r.numero,
    r.statut_paiement avant_statut, r.montant_paye avant_paye, r.montant_restant avant_reste,
    (r.abonnement_id is not null or coalesce(r.offerte, false) or coalesce(c.interne, false)) reglee_autrement,
    coalesce(r.montant_final, coalesce(r.montant_calcule, 0) + coalesce(r.ajustement_manuel, 0)) prix,
    exists (select 1 from pieces p where p.reservation_id = r.id
             and p.type in ('facture', 'libre') and p.statut not in ('annulee', 'brouillon')) facturee,
    coalesce((select sum(p.lignes_resa) from pieces p where p.reservation_id = r.id
               and p.type in ('facture', 'libre') and p.statut not in ('annulee', 'brouillon')), 0)
      - coalesce((select sum(p.lignes_resa) from pieces p where p.reservation_id = r.id
               and p.type = 'avoir' and p.statut <> 'brouillon' and p.type_origine in ('facture', 'libre')), 0) du_facture,
    coalesce((select sum(montant) from public.paiements_resa pr
               where pr.reservation_id = r.id and pr.facture_id is null), 0)
      - coalesce((select sum(montant) from public.avoirs_mouvements m
               where m.reservation_id = r.id and m.type = 'trop_percu'), 0)
      - coalesce((select sum(montant) from public.avoirs_mouvements m
               where m.reservation_id = r.id and m.type in ('utilisation', 'annulation_paiement')
                 and m.facture_id is null and m.created_at < timestamptz '2026-06-23 18:11:11+00'), 0)
      + coalesce((select sum(p.paye * p.lignes_resa / p.total) from pieces p where p.reservation_id = r.id
               and p.type <> 'avoir' and p.statut <> 'brouillon' and p.total > 0), 0) paye_brut
  from public.reservations r left join public.clients c on c.id = r.client_id
),
arrondi as (
  select *,
    round(case when facturee then greatest(du_facture, 0)
               when reglee_autrement then 0
               else greatest(prix, 0) end, 2) du,
    round(paye_brut, 2) paye
  from calc
)
select id, numero, avant_statut, avant_paye, avant_reste, du, paye,
  greatest(du - paye, 0) reste,
  case
    when greatest(du - paye, 0) <= 0.005 then
      case when paye > 0.005 or facturee or reglee_autrement or du > 0.005 then 'paye' else 'impaye' end
    when paye > 0.005 then 'partiel'
    else 'impaye'
  end statut
from arrondi;

-- La trace d'abord : ce qui change, avant et après, avec la raison.
insert into public.journal_evenements (entite, entite_id, evenement, avant, apres, motif, user_id)
select 'reservation', d.id, 'paiement_derive',
       jsonb_build_object('statut_paiement', d.avant_statut, 'montant_paye', d.avant_paye, 'montant_restant', d.avant_reste),
       jsonb_build_object('statut_paiement', d.statut, 'montant_paye', d.paye, 'montant_restant', d.reste, 'du', d.du),
       'Reprise du 16 septembre 2026 : le paiement de la réservation se dérive désormais de ses factures.',
       null
  from derive_paiement d
 where d.avant_statut is distinct from d.statut
    or abs(coalesce(d.avant_paye, 0) - d.paye) >= 0.005;

update public.reservations r
   set statut_paiement = d.statut,
       montant_paye    = d.paye,
       montant_restant = d.reste
  from derive_paiement d
 where d.id = r.id
   and (r.statut_paiement is distinct from d.statut
        or abs(coalesce(r.montant_paye, 0) - d.paye) >= 0.005
        or r.montant_restant is distinct from d.reste);

commit;
