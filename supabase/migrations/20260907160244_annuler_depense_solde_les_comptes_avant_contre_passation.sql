-- Correctif : la contre-écriture d'une dépense « à payer » PUIS réglée passait
-- deux fois par le compte 2000 (crédité à la validation, débité au règlement).
-- En inversant ligne à ligne, on produisait une ligne débit ET crédit sur le
-- même compte, refusée par ligne_debit_xor_credit.
--
-- On solde donc chaque compte avant d'inverser : seul le net compte, et un
-- compte déjà soldé (2000, ici) ne ressort pas.
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

  -- Solde net par compte sur TOUTES les écritures de la dépense (charge et
  -- règlement), puis inversion. Un compte au net nul est simplement omis.
  for l in
    select el.compte_numero,
           round(sum(el.debit) - sum(el.credit), 2) as net
      from public.ecritures e
      join public.ecritures_lignes el on el.ecriture_id = e.id
     where e.piece_id = p_depense_id
       and e.piece_type in ('depense', 'depense_paiement')
     group by el.compte_numero
    having round(sum(el.debit) - sum(el.credit), 2) <> 0
  loop
    v_lignes := v_lignes || jsonb_build_object(
      'compte', l.compte_numero,
      'debit',  greatest(-l.net, 0),
      'credit', greatest(l.net, 0));
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