-- Finalisation et retour, en une seule transaction chacun.
-- Le numéro, l'écriture, les lignes figées, les mouvements de stock et le
-- journal partent ensemble : si le stock refuse, rien ne subsiste, pas même
-- un numéro consommé.
--
-- Les lignes d'écriture sont CALCULÉES en TypeScript (caisseLogique) et
-- transmises telles quelles à passer_ecriture : le moteur d'écritures n'est
-- pas contourné, il est appelé.

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
  p_user_id         uuid
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
      current_date,
      'Vente ' || v_numero,
      'vente',
      v_id,
      p_ecriture_lignes,
      p_user_id,
      null);
  end if;

  insert into public.ventes (
    id, numero, canal, client_id, montant_total, mode_reglement, arrondi,
    facture_id, statut, vendu_par, exercice, ecriture_id, cle_idempotence)
  values (
    v_id, v_numero, coalesce(p_canal, 'comptoir'), p_client_id, p_total, p_mode,
    coalesce(p_arrondi, 0), p_facture_id, 'finalisee', p_user_id, v_exercice,
    v_ecriture, p_cle_idempotence);

  insert into public.ventes_lignes (vente_id, article_id, libelle, quantite, prix_unitaire, taux_tva, montant)
  select v_id,
         nullif(l->>'article_id','')::uuid,
         l->>'libelle',
         (l->>'quantite')::numeric,
         (l->>'prix_unitaire')::numeric,
         coalesce((l->>'taux_tva')::numeric, 0),
         (l->>'montant')::numeric
    from jsonb_array_elements(p_lignes) as l;

  -- Sortie de stock : le refus du stock négatif d'APP 10 s'applique ici même.
  insert into public.mouvements_stock (article_id, type, quantite, vente_id, user_id)
  select nullif(l->>'article_id','')::uuid,
         'vente',
         -(l->>'quantite')::numeric,
         v_id,
         p_user_id
    from jsonb_array_elements(p_lignes) as l
   where nullif(l->>'article_id','') is not null;

  -- Vente portée sur la facture du client : aucune trésorerie, des lignes.
  if p_facture_id is not null then
    select coalesce(max(ordre), 0) into v_ordre
      from public.facture_lignes where facture_id = p_facture_id;

    insert into public.facture_lignes
      (facture_id, ordre, libelle, quantite, prix_unitaire, compte_produit, taux_tva)
    select p_facture_id,
           v_ordre + row_number() over (),
           l->>'libelle',
           (l->>'quantite')::numeric,
           (l->>'prix_unitaire')::numeric,
           '3200',
           0
      from jsonb_array_elements(p_lignes) as l;

    select coalesce(sum(montant), 0) into v_total_facture
      from public.facture_lignes where facture_id = p_facture_id;

    update public.factures
       set montant_total = v_total_facture,
           montant_ttc   = v_total_facture,
           montant_ht    = v_total_facture,
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
    -- Deux clics au même instant : la seconde transaction retrouve la première.
    if p_cle_idempotence is not null then
      select id, numero into v_deja from public.ventes where cle_idempotence = p_cle_idempotence;
      if found then
        return jsonb_build_object('id', v_deja.id, 'numero', v_deja.numero, 'deja', true);
      end if;
    end if;
    raise;
end;
$function$;


create or replace function public.retourner_vente(
  p_vente_id        uuid,
  p_cle_idempotence text,
  p_lignes          jsonb,
  p_total           numeric,
  p_arrondi         numeric,
  p_ecriture_lignes jsonb,
  p_motif           text,
  p_user_id         uuid
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_id       uuid := gen_random_uuid();
  v_exercice int  := extract(year from now())::int;
  v_numero   text;
  v_ecriture uuid;
  v_origine  record;
  v_deja     record;
  v_reste    numeric;
  v_ordre    int;
  v_total_facture numeric;
begin
  if p_cle_idempotence is not null then
    select id, numero into v_deja from public.ventes where cle_idempotence = p_cle_idempotence;
    if found then
      return jsonb_build_object('id', v_deja.id, 'numero', v_deja.numero, 'deja', true);
    end if;
  end if;

  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Indiquez le motif du retour.';
  end if;
  if p_lignes is null or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Choisissez au moins une ligne à rendre.';
  end if;

  select * into v_origine from public.ventes where id = p_vente_id for update;
  if not found then
    raise exception 'Vente introuvable.';
  end if;
  if v_origine.vente_origine_id is not null then
    raise exception 'On ne rend pas un retour.';
  end if;
  if v_origine.statut <> 'finalisee' then
    raise exception 'Cette vente est déjà entièrement rendue.';
  end if;

  -- Rien ne se rend deux fois : on compare à ce qui a déjà été repris.
  select coalesce(sum(reste), 0) into v_reste from (
    select vl.id,
           vl.quantite + coalesce((
             select sum(rl.quantite)
               from public.ventes_lignes rl
               join public.ventes r on r.id = rl.vente_id
              where r.vente_origine_id = p_vente_id
                and rl.article_id is not distinct from vl.article_id
                and rl.libelle = vl.libelle
           ), 0) as reste
      from public.ventes_lignes vl
     where vl.vente_id = p_vente_id
  ) as restes;

  v_numero := public.prochain_numero_facture(v_exercice, 'RET');

  if p_ecriture_lignes is not null and jsonb_array_length(p_ecriture_lignes) > 0 then
    v_ecriture := public.passer_ecriture(
      current_date,
      'Retour ' || v_numero || ' sur vente ' || coalesce(v_origine.numero, ''),
      'vente_retour',
      v_id,
      p_ecriture_lignes,
      p_user_id,
      v_origine.ecriture_id);
  end if;

  insert into public.ventes (
    id, numero, canal, client_id, montant_total, mode_reglement, arrondi,
    facture_id, statut, vendu_par, vente_origine_id, motif, exercice,
    ecriture_id, cle_idempotence)
  values (
    v_id, v_numero, v_origine.canal, v_origine.client_id, p_total,
    v_origine.mode_reglement, coalesce(p_arrondi, 0), v_origine.facture_id,
    'finalisee', p_user_id, p_vente_id, btrim(p_motif), v_exercice,
    v_ecriture, p_cle_idempotence);

  insert into public.ventes_lignes (vente_id, article_id, libelle, quantite, prix_unitaire, taux_tva, montant)
  select v_id,
         nullif(l->>'article_id','')::uuid,
         l->>'libelle',
         (l->>'quantite')::numeric,
         (l->>'prix_unitaire')::numeric,
         coalesce((l->>'taux_tva')::numeric, 0),
         (l->>'montant')::numeric
    from jsonb_array_elements(p_lignes) as l;

  -- Le stock remonte : quantité positive, type « retour ».
  insert into public.mouvements_stock (article_id, type, quantite, vente_id, user_id)
  select nullif(l->>'article_id','')::uuid,
         'retour',
         abs((l->>'quantite')::numeric),
         v_id,
         p_user_id
    from jsonb_array_elements(p_lignes) as l
   where nullif(l->>'article_id','') is not null;

  -- Vente portée sur une facture encore en brouillon : la facture suit.
  if v_origine.facture_id is not null then
    select coalesce(max(ordre), 0) into v_ordre
      from public.facture_lignes where facture_id = v_origine.facture_id;

    insert into public.facture_lignes
      (facture_id, ordre, libelle, quantite, prix_unitaire, compte_produit, taux_tva)
    select v_origine.facture_id,
           v_ordre + row_number() over (),
           'Retour — ' || (l->>'libelle'),
           (l->>'quantite')::numeric,
           (l->>'prix_unitaire')::numeric,
           '3200',
           0
      from jsonb_array_elements(p_lignes) as l;

    select coalesce(sum(montant), 0) into v_total_facture
      from public.facture_lignes where facture_id = v_origine.facture_id;

    update public.factures
       set montant_total = v_total_facture,
           montant_ttc   = v_total_facture,
           montant_ht    = v_total_facture,
           montant_restant = round(v_total_facture - coalesce(montant_paye, 0), 2)
     where id = v_origine.facture_id;
  end if;

  -- Tout rendu : la vente d'origine passe à « annulee ». On ne la supprime pas.
  select coalesce(sum(reste), 0) into v_reste from (
    select vl.quantite + coalesce((
             select sum(rl.quantite)
               from public.ventes_lignes rl
               join public.ventes r on r.id = rl.vente_id
              where r.vente_origine_id = p_vente_id
                and rl.article_id is not distinct from vl.article_id
                and rl.libelle = vl.libelle
           ), 0) as reste
      from public.ventes_lignes vl
     where vl.vente_id = p_vente_id
  ) as restes;

  if v_reste <= 0 then
    update public.ventes set statut = 'annulee' where id = p_vente_id;
  end if;

  insert into public.journal_evenements (entite, entite_id, evenement, apres, motif, user_id)
  values ('vente', p_vente_id, 'retour',
          jsonb_build_object('retour', v_numero, 'total', p_total,
                             'reste_a_rendre', v_reste),
          btrim(p_motif), p_user_id);

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'deja', false,
                            'vente_annulee', v_reste <= 0);

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