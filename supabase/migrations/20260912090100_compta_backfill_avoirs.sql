-- Rattrapage comptable des avoirs clients (idempotent, rejouable).
--
-- Couche A — une écriture par mouvement d'avoir manuel ou de trop-perçu, avec
-- la même règle que le code (comptaAvoirLogique) et le même moteur par delta :
--   ajout manuel / retrait manuel : contrepartie 3800 ;
--   trop-perçu                    : contrepartie 1100.
--
-- Couche B — régularisation d'ouverture. Les mouvements 'utilisation',
-- 'reprise', 'mise_en_avoir' et 'annulation_paiement' sont normalement portés
-- par la comptabilité de la réservation (paiements_resa en mode 'avoir'), mais
-- les mouvements historiques sont antérieurs à ce journal : rien ne les porte
-- au grand livre. Une écriture de régularisation amène le solde du compte 2035
-- au total réel des avoirs, contrepartie 1100 (débiteurs clients).

-- ── Couche A ────────────────────────────────────────────────────────────────
do $$
declare
  m record;
  v_contrepartie text;
  v_cible numeric;
  v_deja_c numeric;
  v_deja_a numeric;
  v_delta_c numeric;
  v_delta_a numeric;
  v_lignes jsonb;
begin
  for m in
    select id, type, montant, created_at
      from public.avoirs_mouvements
     where type in ('ajout_manuel', 'retrait_manuel', 'trop_percu')
     order by created_at
  loop
    v_contrepartie := case when m.type = 'trop_percu' then '1100' else '3800' end;
    v_cible := round(coalesce(m.montant, 0), 2);

    select
      coalesce(sum(case when l.compte_numero = v_contrepartie then l.debit - l.credit else 0 end), 0),
      coalesce(sum(case when l.compte_numero = '2035'         then l.debit - l.credit else 0 end), 0)
      into v_deja_c, v_deja_a
      from public.ecritures e
      join public.ecritures_lignes l on l.ecriture_id = e.id
     where e.piece_type = 'avoir_mouvement' and e.piece_id = m.id;

    v_delta_c := round(v_cible - v_deja_c, 2);
    v_delta_a := round(-v_cible - v_deja_a, 2);
    if v_delta_c = 0 and v_delta_a = 0 then
      continue;
    end if;

    v_lignes := '[]'::jsonb;
    if v_delta_c <> 0 then
      v_lignes := v_lignes || jsonb_build_object(
        'compte', v_contrepartie,
        'debit',  greatest(v_delta_c, 0),
        'credit', greatest(-v_delta_c, 0));
    end if;
    if v_delta_a <> 0 then
      v_lignes := v_lignes || jsonb_build_object(
        'compte', '2035',
        'debit',  greatest(v_delta_a, 0),
        'credit', greatest(-v_delta_a, 0));
    end if;

    perform public.passer_ecriture(
      (coalesce(m.created_at, now()))::date,
      'Avoir client ' || left(m.id::text, 8),
      'avoir_mouvement',
      m.id,
      v_lignes,
      null, null);
  end loop;
end $$;

-- ── Couche B ────────────────────────────────────────────────────────────────
do $$
declare
  v_cible numeric;
  v_actuel numeric;
  v_delta numeric;
begin
  select round(coalesce(sum(montant), 0), 2) into v_cible from public.avoirs_mouvements;
  select round(coalesce(sum(credit - debit), 0), 2) into v_actuel
    from public.ecritures_lignes where compte_numero = '2035';

  v_delta := round(v_cible - v_actuel, 2);
  if v_delta = 0 then
    return;
  end if;

  perform public.passer_ecriture(
    current_date,
    'Régularisation avoirs clients — mise en concordance du compte 2035 avec le solde réel des avoirs (mouvements antérieurs au journal des paiements)',
    'regularisation_avoirs',
    null,
    case when v_delta > 0 then
      jsonb_build_array(
        jsonb_build_object('compte', '1100', 'debit', v_delta, 'credit', 0),
        jsonb_build_object('compte', '2035', 'debit', 0, 'credit', v_delta))
    else
      jsonb_build_array(
        jsonb_build_object('compte', '2035', 'debit', -v_delta, 'credit', 0),
        jsonb_build_object('compte', '1100', 'debit', 0, 'credit', -v_delta))
    end,
    null, null);
end $$;
