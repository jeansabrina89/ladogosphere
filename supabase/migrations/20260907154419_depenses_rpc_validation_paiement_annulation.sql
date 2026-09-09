-- Validation, règlement et annulation d'une dépense.
-- Les lignes d'écriture sont construites côté TypeScript (src/lib/depensesLogique.ts,
-- couvert par des tests) et passées ici : la fonction garde ce qui doit être
-- atomique — la pièce justificative, le numéro et l'écriture.

create or replace function public.valider_depense(
  p_depense_id uuid,
  p_lignes     jsonb,
  p_user_id    uuid default null
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_d        record;
  v_nb_piece int;
  v_exercice int;
  v_numero   text;
  v_ecriture uuid;
begin
  select * into v_d from public.depenses where id = p_depense_id for update;
  if not found then
    raise exception 'Dépense introuvable.';
  end if;
  if v_d.numero is not null then
    raise exception 'Dépense % déjà validée.', v_d.numero;
  end if;
  if v_d.statut <> 'brouillon' then
    raise exception 'Seul un brouillon peut être validé (statut actuel : %).', v_d.statut;
  end if;

  -- Règle centrale : pas de dépense validée sans justificatif.
  select count(*) into v_nb_piece
    from public.pieces
   where entite = 'depense' and entite_id = p_depense_id;
  if v_nb_piece = 0 then
    raise exception 'Ajoutez le justificatif : une dépense ne se valide pas sans pièce.';
  end if;

  v_exercice := extract(year from v_d.date_depense)::int;
  v_numero   := public.prochain_numero_facture(v_exercice, 'DEP');

  v_ecriture := public.passer_ecriture(
    v_d.date_depense,
    'Dépense ' || v_numero || ' — ' || v_d.libelle,
    'depense',
    p_depense_id,
    p_lignes,
    p_user_id,
    null);

  update public.depenses
     set numero      = v_numero,
         exercice    = v_exercice,
         statut      = case when mode_paiement = 'a_payer' then 'validee' else 'payee' end,
         date_paiement = case when mode_paiement = 'a_payer' then date_paiement
                              else coalesce(date_paiement, v_d.date_depense) end,
         ecriture_id = v_ecriture
   where id = p_depense_id;

  insert into public.journal_evenements (entite, entite_id, evenement, apres, user_id)
  values ('depense', p_depense_id, 'validation',
          jsonb_build_object('numero', v_numero, 'montant', v_d.montant,
                             'compte', v_d.compte_charge, 'mode', v_d.mode_paiement,
                             'ecriture_id', v_ecriture),
          p_user_id);

  return v_numero;
end;
$function$;

-- Règlement d'une dépense restée « à payer » : le compte 2000 est soldé par la
-- liquidité choisie.
create or replace function public.payer_depense(
  p_depense_id uuid,
  p_lignes     jsonb,
  p_mode       text,
  p_date       date,
  p_user_id    uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_d        record;
  v_ecriture uuid;
begin
  select * into v_d from public.depenses where id = p_depense_id for update;
  if not found then
    raise exception 'Dépense introuvable.';
  end if;
  if v_d.statut <> 'validee' then
    raise exception 'Seule une dépense validée et non réglée peut être payée (statut actuel : %).', v_d.statut;
  end if;
  if v_d.mode_paiement <> 'a_payer' then
    raise exception 'Cette dépense a déjà été réglée à la saisie.';
  end if;
  if p_mode not in ('banque','caisse','carte','twint') then
    raise exception 'Mode de règlement invalide : %.', p_mode;
  end if;

  v_ecriture := public.passer_ecriture(
    p_date,
    'Règlement dépense ' || v_d.numero,
    'depense_paiement',
    p_depense_id,
    p_lignes,
    p_user_id,
    null);

  update public.depenses
     set statut               = 'payee',
         date_paiement        = p_date,
         mode_paiement        = p_mode,
         ecriture_paiement_id = v_ecriture
   where id = p_depense_id;

  insert into public.journal_evenements (entite, entite_id, evenement, apres, user_id)
  values ('depense', p_depense_id, 'paiement',
          jsonb_build_object('mode', p_mode, 'date', p_date, 'ecriture_id', v_ecriture),
          p_user_id);

  return v_ecriture;
end;
$function$;

-- Annulation : jamais de suppression, une contre-écriture avec motif.
create or replace function public.annuler_depense(
  p_depense_id uuid,
  p_motif      text,
  p_user_id    uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_d        record;
  v_lignes   jsonb := '[]'::jsonb;
  v_contre   uuid;
  l          record;
begin
  select * into v_d from public.depenses where id = p_depense_id for update;
  if not found then
    raise exception 'Dépense introuvable.';
  end if;
  if v_d.numero is null then
    raise exception 'Un brouillon se supprime, il ne s''annule pas.';
  end if;
  if v_d.statut = 'annulee' then
    raise exception 'Dépense % déjà annulée.', v_d.numero;
  end if;
  if coalesce(trim(p_motif), '') = '' then
    raise exception 'Indiquez le motif de l''annulation.';
  end if;

  -- Contre-passation de toutes les écritures de la dépense : la charge et le
  -- règlement éventuel repartent en sens inverse.
  for l in
    select el.compte_numero, sum(el.debit) as debit, sum(el.credit) as credit
      from public.ecritures e
      join public.ecritures_lignes el on el.ecriture_id = e.id
     where e.piece_id = p_depense_id
       and e.piece_type in ('depense','depense_paiement')
       and e.contre_passe_id is null
     group by el.compte_numero
    having sum(el.debit) <> 0 or sum(el.credit) <> 0
  loop
    v_lignes := v_lignes || jsonb_build_object(
      'compte', l.compte_numero,
      'debit',  l.credit,
      'credit', l.debit);
  end loop;

  if jsonb_array_length(v_lignes) = 0 then
    raise exception 'Aucune écriture à contre-passer pour cette dépense.';
  end if;

  v_contre := public.passer_ecriture(
    current_date,
    'Annulation dépense ' || v_d.numero || ' — ' || p_motif,
    'depense_annulation',
    p_depense_id,
    v_lignes,
    p_user_id,
    v_d.ecriture_id);

  update public.depenses
     set statut = 'annulee', motif_annulation = p_motif
   where id = p_depense_id;

  insert into public.journal_evenements (entite, entite_id, evenement, motif, apres, user_id)
  values ('depense', p_depense_id, 'annulation', p_motif,
          jsonb_build_object('contre_ecriture_id', v_contre), p_user_id);

  return v_contre;
end;
$function$;