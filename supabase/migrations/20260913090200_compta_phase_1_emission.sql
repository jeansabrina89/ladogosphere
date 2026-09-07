-- Compta phase 1 — émission d'une facture, en une seule transaction.
--
-- Le numéro n'est consommé QUE par cette fonction : plus de trou dans la
-- séquence. Le compteur est verrouillé FOR UPDATE, l'exercice vient de
-- date_facture (jamais de now()).
--
-- Les écritures passent par passer_ecriture, comme partout ailleurs :
--   facture / libre : D 1100 (total) / C compte_produit (par ligne)
--                     puis imputation des acomptes déjà encaissés : D 2030 / C 1100 ;
--   acompte         : aucune écriture de produit (l'acompte est un passif,
--                     reconnu à son encaissement : D liquidité / C 2030) ;
--   avoir           : écritures posées par la couche applicative, qui connaît
--                     le choix « porter au crédit » ou « rembourser ».

-- ── Référence QRR (modulo 10 récursif), équivalent SQL de referenceQrrDepuisNumero
create or replace function public.reference_qrr(p_numero text)
returns text
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_table int[][] := array[
    array[0,9,4,6,8,2,7,1,3,5],
    array[9,4,6,8,2,7,1,3,5,0],
    array[4,6,8,2,7,1,3,5,0,9],
    array[6,8,2,7,1,3,5,0,9,4],
    array[8,2,7,1,3,5,0,9,4,6],
    array[2,7,1,3,5,0,9,4,6,8],
    array[7,1,3,5,0,9,4,6,8,2],
    array[1,3,5,0,9,4,6,8,2,7],
    array[3,5,0,9,4,6,8,2,7,1],
    array[5,0,9,4,6,8,2,7,1,3]];
  v_chiffres text;
  v_base     text;
  v_report   int := 0;
  i          int;
begin
  v_chiffres := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
  if v_chiffres = '' then v_chiffres := '0'; end if;
  v_base := right(lpad(v_chiffres, 26, '0'), 26);

  for i in 1..26 loop
    v_report := v_table[v_report + 1][substr(v_base, i, 1)::int + 1];
  end loop;

  return v_base || ((10 - v_report) % 10)::text;
end;
$function$;

-- ── Numéro suivant pour un exercice et un préfixe (verrou exclusif) ─────────
create or replace function public.prochain_numero_facture(p_exercice int, p_prefixe text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n int;
begin
  insert into public.facture_numerotation (exercice, prefixe, prochain)
  values (p_exercice, p_prefixe, 1)
  on conflict (exercice, prefixe) do nothing;

  select prochain into v_n
    from public.facture_numerotation
   where exercice = p_exercice and prefixe = p_prefixe
     for update;

  update public.facture_numerotation
     set prochain = v_n + 1
   where exercice = p_exercice and prefixe = p_prefixe;

  return p_prefixe || '-' || p_exercice::text || '-' || lpad(v_n::text, 4, '0');
end;
$function$;

-- ── Émission ────────────────────────────────────────────────────────────────
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

  -- L'exercice vient de la date de la facture, pas de l'horloge.
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

  -- D 1100 (total) / C compte_produit (par ligne, TTC tant que la TVA dort).
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

  -- Acomptes déjà encaissés sur les réservations de cette facture : ils
  -- dorment en 2030, l'émission les bascule sur le débiteur.
  select coalesce(sum(p.montant), 0) into v_acomptes
    from public.paiements_resa p
   where p.facture_id is null
     and p.reservation_id in (select distinct reservation_id
                                from public.facture_lignes
                               where facture_id = p_facture_id and reservation_id is not null);
  v_acomptes := least(round(greatest(v_acomptes, 0), 2), v_total);

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
revoke all on function public.prochain_numero_facture(int, text) from public, anon, authenticated;

-- L'ancienne numérotation globale n'a plus de raison d'être : tout numéro
-- passe désormais par emettre_facture.
drop function if exists public.generer_numero_facture();
