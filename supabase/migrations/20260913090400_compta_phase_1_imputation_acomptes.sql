-- Compta phase 1 — règle unique d'imputation des acomptes.
--
-- Un acompte peut avoir été encaissé de deux façons :
--   • directement sur la réservation, avant toute facture (paiement sans facture_id) ;
--   • sur une FACTURE D'ACOMPTE émise pour cette réservation.
-- Les deux dorment en 2030 : la facture définitive doit imputer les deux.
--
-- La règle vit ICI et nulle part ailleurs : la RPC d'émission, la
-- synchronisation comptable et le PDF l'appellent tous les trois. Deux calculs
-- séparés finiraient par diverger, et le moteur par delta ferait alors des
-- allers-retours sans fin entre deux cibles.

create or replace function public.acomptes_a_imputer(p_facture_id uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $function$
  with resas as (
    select distinct reservation_id
      from public.facture_lignes
     where facture_id = p_facture_id and reservation_id is not null
  ),
  factures_acompte as (
    select distinct fa.id
      from public.factures fa
      join public.facture_lignes fl on fl.facture_id = fa.id
     where fa.type = 'acompte'
       and fa.numero is not null
       and fa.statut not in ('annulee', 'annulee_par_avoir')
       and fl.reservation_id in (select reservation_id from resas)
  )
  select round(coalesce(sum(p.montant), 0), 2)
    from public.paiements_resa p
   where (p.facture_id is null and p.reservation_id in (select reservation_id from resas))
      or (p.facture_id in (select id from factures_acompte));
$function$;

revoke all on function public.acomptes_a_imputer(uuid) from public, anon, authenticated;

-- L'émission s'appuie désormais sur cette règle.
create or replace function public.emettre_facture(p_facture_id uuid, p_user_id uuid default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_f          record;
  v_nb_lignes  int;
  v_total      numeric;
  v_exercice   int;
  v_prefixe    text;
  v_numero     text;
  v_delai      int;
  v_echeance   date;
  v_acomptes   numeric := 0;
  v_lignes     jsonb   := '[]'::jsonb;
  l            record;
begin
  select * into v_f from public.factures where id = p_facture_id for update;
  if not found then
    raise exception 'Facture introuvable.';
  end if;
  if v_f.numero is not null then
    raise exception 'Facture % déjà émise.', v_f.numero;
  end if;
  if v_f.statut <> 'brouillon' then
    raise exception 'Seul un brouillon peut être émis (statut actuel : %).', v_f.statut;
  end if;
  if v_f.client_id is null then
    raise exception 'Facture sans client : émission impossible.';
  end if;

  select count(*), coalesce(sum(montant), 0) into v_nb_lignes, v_total
    from public.facture_lignes where facture_id = p_facture_id;
  if v_nb_lignes = 0 then
    raise exception 'Facture sans ligne : émission impossible.';
  end if;

  -- L'exercice vient de la date de la facture, jamais de l'horloge.
  v_exercice := extract(year from coalesce(v_f.date_facture, current_date))::int;
  v_prefixe  := case when v_f.type = 'avoir' then 'AV' else 'FAC' end;
  v_numero   := public.prochain_numero_facture(v_exercice, v_prefixe);

  select coalesce(nullif(valeur, ''), '30')::int into v_delai
    from public.parametres where cle = 'delai_paiement_jours';
  v_delai := coalesce(v_delai, 30);
  v_echeance := coalesce(v_f.date_facture, current_date) + v_delai;

  update public.factures
     set numero        = v_numero,
         reference_qr  = public.reference_qrr(v_numero),
         date_echeance = v_echeance,
         montant_total = v_total,
         montant_ttc   = v_total,
         montant_ht    = v_total,
         montant_tva   = 0,
         montant_restant = round(v_total - coalesce(montant_paye, 0), 2),
         statut        = 'envoyee',
         emise_par     = p_user_id,
         emise_le      = now(),
         exercice      = v_exercice
   where id = p_facture_id;

  insert into public.journal_evenements (entite, entite_id, evenement, apres, user_id)
  values ('facture', p_facture_id, 'emission',
          jsonb_build_object('numero', v_numero, 'total', v_total,
                             'echeance', v_echeance, 'type', v_f.type),
          p_user_id);

  -- Un avoir et un acompte ne reconnaissent aucun produit à l'émission.
  if v_f.type in ('avoir', 'acompte') then
    return v_numero;
  end if;

  for l in
    select compte_produit, round(sum(montant), 2) as montant
      from public.facture_lignes
     where facture_id = p_facture_id
     group by compte_produit
     having round(sum(montant), 2) <> 0
  loop
    v_lignes := v_lignes || jsonb_build_object(
      'compte', l.compte_produit,
      'debit',  greatest(-l.montant, 0),
      'credit', greatest(l.montant, 0));
  end loop;

  v_acomptes := least(greatest(public.acomptes_a_imputer(p_facture_id), 0), v_total);

  if v_total <> 0 then
    v_lignes := v_lignes || jsonb_build_object(
      'compte', '1100', 'debit', greatest(v_total, 0), 'credit', greatest(-v_total, 0));
  end if;
  if v_acomptes <> 0 then
    v_lignes := v_lignes || jsonb_build_object('compte', '2030', 'debit', v_acomptes, 'credit', 0);
    v_lignes := v_lignes || jsonb_build_object('compte', '1100', 'debit', 0, 'credit', v_acomptes);
  end if;

  if jsonb_array_length(v_lignes) > 0 and v_total <> 0 then
    perform public.passer_ecriture(
      coalesce(v_f.date_facture, current_date),
      'Facture ' || v_numero,
      'facture',
      p_facture_id,
      v_lignes,
      p_user_id,
      null);
  end if;

  return v_numero;
end;
$function$;

revoke all on function public.emettre_facture(uuid, uuid) from public, anon, authenticated;
