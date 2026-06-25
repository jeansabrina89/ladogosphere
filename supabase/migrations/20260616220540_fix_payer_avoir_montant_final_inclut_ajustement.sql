CREATE OR REPLACE FUNCTION public.payer_reservation_avec_avoir(p_reservation_id uuid, p_client_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_resa reservations%ROWTYPE;
  v_du numeric;
  v_solde numeric;
BEGIN
  -- Sérialise les paiements par avoir d'un même client (évite la double dépense concurrente)
  PERFORM pg_advisory_xact_lock(hashtext(p_client_id::text));

  -- Verrouille la réservation ciblée
  SELECT * INTO v_resa FROM reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Réservation introuvable';
  END IF;
  IF v_resa.client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'Cette réservation n''appartient pas à ce client';
  END IF;
  IF v_resa.statut NOT IN ('validee','terminee') THEN
    RAISE EXCEPTION 'Réservation non payable (statut %)', v_resa.statut;
  END IF;

  -- montant_final, s'il est renseigné, est le montant net définitif (inclut déjà l'ajustement).
  -- Sinon repli sur montant_calcule + ajustement_manuel.
  v_du := COALESCE(v_resa.montant_final, COALESCE(v_resa.montant_calcule, 0) + COALESCE(v_resa.ajustement_manuel, 0))
        - COALESCE(v_resa.montant_paye, 0);
  IF v_du <= 0 THEN
    RAISE EXCEPTION 'Rien à payer sur cette réservation';
  END IF;

  SELECT COALESCE(SUM(montant), 0) INTO v_solde
  FROM avoirs_mouvements WHERE client_id = p_client_id;
  IF v_solde < v_du THEN
    RAISE EXCEPTION 'Solde avoir insuffisant';
  END IF;

  -- Tout-ou-rien : les deux écritures sont dans la même transaction (le corps de la fonction)
  INSERT INTO avoirs_mouvements (client_id, montant, type, motif, reservation_id)
  VALUES (p_client_id, -v_du, 'utilisation', 'Paiement réservation via avoir', p_reservation_id);

  UPDATE reservations
     SET montant_paye = COALESCE(montant_paye, 0) + v_du,
         statut_paiement = 'paye',
         date_paiement = current_date,
         mode_paiement = 'avoir'
   WHERE id = p_reservation_id;

  RETURN v_solde - v_du;
END;
$function$;
