-- Le paiement d'une réservation se DÉRIVE de ses factures.
--
-- Avant : encaisser depuis la fiche facture mettait la facture à jour, pas la
-- réservation ; encaisser depuis la réservation faisait l'inverse. Deux sources
-- pour une même vérité, et une réservation « Impayé » dont la facture était
-- « Payée ».
--
-- Désormais la réservation ne porte plus que des valeurs RECALCULÉES par une
-- seule fonction (src/lib/paiementReservation.ts) depuis les factures qui la
-- couvrent et les paiements du journal :
--   statut_paiement, montant_paye et montant_restant.
--
-- 1. montant_restant : le reste à payer dérivé. Le prix de la réservation
--    (montant_final) ne dit pas ce qui reste dû quand un avoir a effacé tout ou
--    partie de la facture ; ce champ le dit, et c'est lui que lisent les
--    demandes de paiement et les relances. Null tant qu'il n'a pas été calculé.
--
-- 2. payer_reservation_avec_avoir (paiement par avoir depuis l'espace client)
--    n'écrit plus ni montant_paye ni statut_paiement : l'appelant recalcule.
--    Si une facture émise et ouverte couvre la réservation, le paiement s'y
--    rattache — comme un encaissement depuis la fiche facture — au lieu de
--    rester à côté d'elle, invisible pour la facture.

begin;

alter table public.reservations
  add column if not exists montant_restant numeric(10,2);

comment on column public.reservations.montant_restant is
  'Reste à payer DÉRIVÉ des factures qui couvrent la réservation et des paiements du journal. Écrit uniquement par src/lib/paiementReservation.ts.';

create or replace function public.payer_reservation_avec_avoir(p_reservation_id uuid, p_client_id uuid)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_resa    reservations%rowtype;
  v_du      numeric;
  v_solde   numeric;
  v_facture record;
begin
  -- Sérialise les paiements par avoir d'un même client (évite la double dépense concurrente).
  perform pg_advisory_xact_lock(hashtext(p_client_id::text));

  select * into v_resa from reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'Réservation introuvable';
  end if;
  if v_resa.client_id is distinct from p_client_id then
    raise exception 'Cette réservation n''appartient pas à ce client';
  end if;
  if v_resa.statut not in ('validee', 'terminee') then
    raise exception 'Réservation non payable (statut %)', v_resa.statut;
  end if;

  -- Le reste dérivé fait foi ; à défaut (jamais calculé), prix moins payé.
  v_du := coalesce(
    v_resa.montant_restant,
    coalesce(v_resa.montant_final, coalesce(v_resa.montant_calcule, 0) + coalesce(v_resa.ajustement_manuel, 0))
      - coalesce(v_resa.montant_paye, 0));

  -- Une facture émise et ouverte couvre-t-elle la réservation ? Le paiement s'y rattache.
  select f.id, f.montant_restant into v_facture
    from factures f
   where f.numero is not null
     and f.type in ('facture', 'libre')
     and f.statut in ('envoyee', 'partiellement_reglee')
     and exists (select 1 from facture_lignes fl
                  where fl.facture_id = f.id and fl.reservation_id = p_reservation_id)
   order by f.date_facture desc, f.created_at desc
   limit 1;
  if found then
    v_du := least(v_du, coalesce(v_facture.montant_restant, v_du));
  end if;

  v_du := round(v_du, 2);
  if v_du <= 0 then
    raise exception 'Rien à payer sur cette réservation';
  end if;

  select coalesce(sum(montant), 0) into v_solde
    from avoirs_mouvements where client_id = p_client_id;
  if v_solde < v_du then
    raise exception 'Solde avoir insuffisant';
  end if;

  -- Tout-ou-rien : le corps de la fonction est une seule transaction.
  insert into avoirs_mouvements (client_id, montant, type, motif, reservation_id, facture_id)
  values (p_client_id, -v_du, 'utilisation', 'Paiement réservation via avoir', p_reservation_id, v_facture.id);

  if v_facture.id is not null then
    insert into paiements_resa (facture_id, client_id, date_paiement, mode, montant, motif)
    values (v_facture.id, p_client_id, current_date, 'avoir', v_du, 'Paiement par avoir (espace client)');
  else
    insert into paiements_resa (reservation_id, client_id, date_paiement, mode, montant, motif)
    values (p_reservation_id, p_client_id, current_date, 'avoir', v_du, 'Paiement par avoir (espace client)');
  end if;

  -- Plus de montant_paye ni de statut_paiement ici : ils se dérivent.
  update reservations
     set date_paiement = current_date,
         mode_paiement = 'avoir'
   where id = p_reservation_id;

  return v_solde - v_du;
end;
$function$;

commit;