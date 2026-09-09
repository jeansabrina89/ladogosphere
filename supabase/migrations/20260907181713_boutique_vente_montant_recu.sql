-- Le montant tendu en espèces, pour que le ticket réimprimé affiche encore le
-- rendu. Sans lui, « Rendu : 4.50 » ne serait vrai qu'à l'écran, une fois.
alter table public.ventes add column if not exists montant_recu numeric;

create or replace function public.ventes_inalterables()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Une vente ne se supprime pas : elle s''annule par un retour.';
  end if;

  if new.statut is distinct from old.statut then
    if not (old.statut = 'finalisee' and new.statut = 'annulee') then
      raise exception 'Le statut d''une vente ne va que de « finalisee » à « annulee ».';
    end if;
  end if;

  if row(new.*) is distinct from row(
       old.id, old.numero, old.date_vente, old.canal, old.client_id, old.montant_total,
       old.mode_reglement, old.arrondi, old.facture_id, new.statut, old.vendu_par,
       old.vente_origine_id, coalesce(new.motif, old.motif), old.exercice, old.ecriture_id,
       old.cle_idempotence, old.created_at, old.montant_recu) then
    raise exception 'Une vente finalisée ne se modifie pas : passez un retour motivé.';
  end if;

  return new;
end;
$$;

create or replace function public.finaliser_vente(
  p_cle_idempotence text,
  p_canal           text,
  p_client_id       uuid,
  p_mode            text,
  p_lignes          jsonb,
  p_total           numeric,
  p_arrondi         numeric,
  p_ecriture_lignes jsonb,
  p_facture_id      uuid,
  p_user_id         uuid,
  p_montant_recu    numeric default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_id       uuid := gen_random_uuid();
  v_exercice int  := extract(year from now())::int;
  v_numero   text;
  v_ecriture uuid;
  v_deja     record;
  v_ordre    int;
  v_total_facture numeric;
begin
  if p_cle_idempotence is not null then
    select id, numero into v_deja from public.ventes where cle_idempotence = p_cle_idempotence;
    if found then
      return jsonb_build_object('id', v_deja.id, 'numero', v_deja.numero, 'deja', true);
    end if;
  end if;

  if p_lignes is null or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Le panier est vide.';
  end if;

  v_numero := public.prochain_numero_facture(v_exercice, 'VTE');

  if p_ecriture_lignes is not null and jsonb_array_length(p_ecriture_lignes) > 0 then
    v_ecriture := public.passer_ecriture(
      current_date, 'Vente ' || v_numero, 'vente', v_id, p_ecriture_lignes, p_user_id, null);
  end if;

  insert into public.ventes (
    id, numero, canal, client_id, montant_total, mode_reglement, arrondi,
    facture_id, statut, vendu_par, exercice, ecriture_id, cle_idempotence, montant_recu)
  values (
    v_id, v_numero, coalesce(p_canal, 'comptoir'), p_client_id, p_total, p_mode,
    coalesce(p_arrondi, 0), p_facture_id, 'finalisee', p_user_id, v_exercice,
    v_ecriture, p_cle_idempotence, p_montant_recu);

  insert into public.ventes_lignes (vente_id, article_id, libelle, quantite, prix_unitaire, taux_tva, montant)
  select v_id, nullif(l->>'article_id','')::uuid, l->>'libelle',
         (l->>'quantite')::numeric, (l->>'prix_unitaire')::numeric,
         coalesce((l->>'taux_tva')::numeric, 0), (l->>'montant')::numeric
    from jsonb_array_elements(p_lignes) as l;

  insert into public.mouvements_stock (article_id, type, quantite, vente_id, user_id)
  select nullif(l->>'article_id','')::uuid, 'vente', -(l->>'quantite')::numeric, v_id, p_user_id
    from jsonb_array_elements(p_lignes) as l
   where nullif(l->>'article_id','') is not null;

  if p_facture_id is not null then
    select coalesce(max(ordre), 0) into v_ordre
      from public.facture_lignes where facture_id = p_facture_id;

    insert into public.facture_lignes
      (facture_id, ordre, libelle, quantite, prix_unitaire, compte_produit, taux_tva)
    select p_facture_id, v_ordre + row_number() over (), l->>'libelle',
           (l->>'quantite')::numeric, (l->>'prix_unitaire')::numeric, '3200', 0
      from jsonb_array_elements(p_lignes) as l;

    select coalesce(sum(montant), 0) into v_total_facture
      from public.facture_lignes where facture_id = p_facture_id;

    update public.factures
       set montant_total = v_total_facture, montant_ttc = v_total_facture,
           montant_ht = v_total_facture,
           montant_restant = round(v_total_facture - coalesce(montant_paye, 0), 2)
     where id = p_facture_id;
  end if;

  insert into public.journal_evenements (entite, entite_id, evenement, apres, user_id)
  values ('vente', v_id, 'vente',
          jsonb_build_object('numero', v_numero, 'total', p_total, 'mode', p_mode,
                             'arrondi', coalesce(p_arrondi, 0), 'facture_id', p_facture_id,
                             'lignes', jsonb_array_length(p_lignes)),
          p_user_id);

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'deja', false);

exception
  when unique_violation then
    if p_cle_idempotence is not null then
      select id, numero into v_deja from public.ventes where cle_idempotence = p_cle_idempotence;
      if found then
        return jsonb_build_object('id', v_deja.id, 'numero', v_deja.numero, 'deja', true);
      end if;
    end if;
    raise;
end;
$function$;

drop function if exists public.finaliser_vente(text, text, uuid, text, jsonb, numeric, numeric, jsonb, uuid, uuid);