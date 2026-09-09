-- ── APP 16 : le retour reprend la remise du ticket ────────────────────────
--
-- On rend ce qui a été PAYÉ, pas le prix du jour, et le retour dit pourquoi :
-- « Action du mois −20 % » figure sur l'avoir comme il figurait sur le ticket.
-- Seuls les deux inserts de lignes changent.

CREATE OR REPLACE FUNCTION public.retourner_vente(p_vente_id uuid, p_cle_idempotence text, p_lignes jsonb, p_total numeric, p_arrondi numeric, p_ecriture_lignes jsonb, p_motif text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid := gen_random_uuid();
  v_exercice int := extract(year from now())::int;
  v_numero text; v_ecriture uuid; v_origine record; v_deja record;
  v_reste numeric; v_ordre int; v_total_facture numeric;
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
  if not found then raise exception 'Vente introuvable.'; end if;
  if v_origine.vente_origine_id is not null then raise exception 'On ne rend pas un retour.'; end if;
  if v_origine.statut <> 'finalisee' then raise exception 'Cette vente est déjà entièrement rendue.'; end if;

  v_numero := public.prochain_numero_facture(v_exercice, 'RET');

  if p_ecriture_lignes is not null and jsonb_array_length(p_ecriture_lignes) > 0 then
    v_ecriture := public.passer_ecriture(
      current_date,
      'Retour ' || v_numero || ' sur vente ' || coalesce(v_origine.numero, ''),
      'vente_retour', v_id, p_ecriture_lignes, p_user_id, v_origine.ecriture_id);
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

  insert into public.ventes_lignes
    (vente_id, article_id, libelle, quantite, prix_unitaire, taux_tva, motif_tva, montant, secteur_tdfn,
     prix_base, remise_pourcentage, remise_origine, remise_libelle)
  select v_id, nullif(l->>'article_id','')::uuid, l->>'libelle',
         (l->>'quantite')::numeric, (l->>'prix_unitaire')::numeric,
         coalesce((l->>'taux_tva')::numeric, 0), nullif(l->>'motif_tva',''),
         (l->>'montant')::numeric, nullif(l->>'secteur_tdfn',''),
         nullif(l->>'prix_base','')::numeric, nullif(l->>'remise_pourcentage','')::numeric,
         nullif(l->>'remise_origine',''), nullif(l->>'remise_libelle','')
    from jsonb_array_elements(p_lignes) as l;

  insert into public.mouvements_stock (article_id, type, quantite, vente_id, user_id)
  select a.id, 'retour', abs((l->>'quantite')::numeric), v_id, p_user_id
    from jsonb_array_elements(p_lignes) as l
    join public.articles a on a.id = nullif(l->>'article_id','')::uuid
   where a.type_article <> 'personnalisable';

  if v_origine.facture_id is not null then
    select coalesce(max(ordre), 0) into v_ordre
      from public.facture_lignes where facture_id = v_origine.facture_id;

    insert into public.facture_lignes
      (facture_id, ordre, libelle, quantite, prix_unitaire, compte_produit, taux_tva, motif_tva, secteur_tdfn,
       prix_base, remise_pourcentage, remise_origine, remise_libelle)
    select v_origine.facture_id, v_ordre + row_number() over (),
           'Retour — ' || (l->>'libelle'),
           (l->>'quantite')::numeric, (l->>'prix_unitaire')::numeric, '3200',
           coalesce((l->>'taux_tva')::numeric, 0), nullif(l->>'motif_tva',''),
           nullif(l->>'secteur_tdfn',''),
           nullif(l->>'prix_base','')::numeric, nullif(l->>'remise_pourcentage','')::numeric,
           nullif(l->>'remise_origine',''), nullif(l->>'remise_libelle','')
      from jsonb_array_elements(p_lignes) as l;

    select coalesce(sum(montant), 0) into v_total_facture
      from public.facture_lignes where facture_id = v_origine.facture_id;

    update public.factures
       set montant_total = v_total_facture, montant_ttc = v_total_facture,
           montant_ht = v_total_facture,
           montant_restant = round(v_total_facture - coalesce(montant_paye, 0), 2)
     where id = v_origine.facture_id;
  end if;

  select coalesce(sum(reste), 0) into v_reste from (
    select vl.quantite + coalesce((
             select sum(rl.quantite) from public.ventes_lignes rl
               join public.ventes r on r.id = rl.vente_id
              where r.vente_origine_id = p_vente_id
                and rl.article_id is not distinct from vl.article_id
                and rl.libelle = vl.libelle), 0) as reste
      from public.ventes_lignes vl where vl.vente_id = p_vente_id
  ) as restes;

  if v_reste <= 0 then
    update public.ventes set statut = 'annulee' where id = p_vente_id;
  end if;

  insert into public.journal_evenements (entite, entite_id, evenement, apres, motif, user_id)
  values ('vente', p_vente_id, 'retour',
          jsonb_build_object('retour', v_numero, 'total', p_total, 'reste_a_rendre', v_reste),
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