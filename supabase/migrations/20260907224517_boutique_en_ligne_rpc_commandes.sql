-- Réserve (p_sens = 1) ou libère (p_sens = -1) le stock d'une commande.
-- Les articles personnalisables sont hors stock : ils se fabriquent.
create or replace function public.reserver_stock_commande(p_commande_id uuid, p_sens int)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.articles a
     set stock_reserve = greatest(a.stock_reserve + p_sens * s.q, 0)
    from (
      select l.article_id, sum(l.quantite) as q
        from public.commandes_lignes l
        join public.articles ar on ar.id = l.article_id
       where l.commande_id = p_commande_id
         and ar.type_article <> 'personnalisable'
       group by l.article_id
    ) s
   where a.id = s.article_id;
end;
$function$;

/**
 * Confirmation d'une commande en ligne.
 *
 * Le stock disponible est REVÉRIFIÉ ici, dans la transaction : entre la mise
 * au panier et la validation, quelqu'un a pu acheter le dernier au comptoir.
 * Un article devenu indisponible bloque tout, en se nommant.
 *
 * Idempotence comme sur les ventes : un double clic ne crée pas deux commandes.
 */
create or replace function public.confirmer_commande(
  p_commande_id uuid,
  p_mode_remise text,
  p_reservation_id uuid,
  p_adresse jsonb,
  p_frais_port numeric,
  p_remise_membre numeric,
  p_montant_total numeric,
  p_mode_paiement text,
  p_cle_idempotence text,
  p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cmd      record;
  v_exercice int := extract(year from now())::int;
  v_numero   text;
  v_manque   record;
begin
  select * into v_cmd from public.commandes where id = p_commande_id for update;
  if not found then raise exception 'Commande introuvable.'; end if;

  -- Déjà confirmée : on rend ce qui existe, sans rien refaire.
  if v_cmd.statut <> 'panier' then
    return jsonb_build_object('id', v_cmd.id, 'numero', v_cmd.numero, 'deja', true);
  end if;

  if p_cle_idempotence is not null then
    perform 1 from public.commandes
      where cle_idempotence = p_cle_idempotence and id <> p_commande_id;
    if found then raise exception 'Cette commande a déjà été enregistrée.'; end if;
  end if;

  if not exists (select 1 from public.commandes_lignes where commande_id = p_commande_id) then
    raise exception 'Votre panier est vide.';
  end if;

  -- Le stock disponible, article par article, maintenant.
  select ar.nom, ar.stock_actuel - ar.stock_reserve as dispo, sum(l.quantite) as demande
    into v_manque
    from public.commandes_lignes l
    join public.articles ar on ar.id = l.article_id
   where l.commande_id = p_commande_id
     and ar.type_article <> 'personnalisable'
   group by ar.id, ar.nom, ar.stock_actuel, ar.stock_reserve
  having sum(l.quantite) > ar.stock_actuel - ar.stock_reserve
   limit 1;

  if found then
    raise exception '« % » n''est plus disponible en quantité suffisante : il en reste %, vous en demandez %.',
      v_manque.nom, greatest(v_manque.dispo, 0), v_manque.demande;
  end if;

  perform public.reserver_stock_commande(p_commande_id, 1);

  v_numero := public.prochain_numero_facture(v_exercice, 'WEB');

  update public.commandes
     set numero = v_numero,
         statut = 'confirmee',
         mode_remise = p_mode_remise,
         reservation_id = p_reservation_id,
         adresse_livraison = p_adresse,
         frais_port = coalesce(p_frais_port, 0),
         remise_membre = coalesce(p_remise_membre, 0),
         montant_total = p_montant_total,
         mode_paiement = p_mode_paiement,
         exercice = v_exercice,
         cle_idempotence = p_cle_idempotence,
         confirmee_le = now()
   where id = p_commande_id;

  insert into public.journal_evenements (entite, entite_id, evenement, apres, user_id)
  values ('commande_en_ligne', p_commande_id, 'confirmation',
          jsonb_build_object('numero', v_numero, 'total', p_montant_total,
                             'mode_remise', p_mode_remise, 'mode_paiement', p_mode_paiement,
                             'remise_membre', coalesce(p_remise_membre, 0),
                             'frais_port', coalesce(p_frais_port, 0)),
          p_user_id);

  return jsonb_build_object('id', p_commande_id, 'numero', v_numero, 'deja', false);
end;
$function$;

/**
 * Remise ou expédition : la vente est créée par le moteur d'APP 11, qui passe
 * lui-même les mouvements de stock définitifs. On se contente de libérer la
 * réservation — sinon la quantité serait retirée deux fois.
 */
create or replace function public.remettre_commande(
  p_commande_id uuid,
  p_statut text,
  p_numero_suivi text,
  p_vente jsonb,
  p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cmd   record;
  v_vente jsonb;
  v_id    uuid;
begin
  select * into v_cmd from public.commandes where id = p_commande_id for update;
  if not found then raise exception 'Commande introuvable.'; end if;

  if p_statut not in ('remise', 'expediee') then
    raise exception 'Une commande se remet ou s''expédie, rien d''autre.';
  end if;
  if v_cmd.statut in ('remise', 'expediee') then
    return jsonb_build_object('id', v_cmd.id, 'vente_id', v_cmd.vente_id, 'deja', true);
  end if;
  if v_cmd.statut not in ('confirmee', 'en_preparation', 'prete') then
    raise exception 'Seule une commande confirmée se remet.';
  end if;

  if p_vente is not null then
    v_vente := public.finaliser_vente(
      p_vente->>'cle_idempotence',
      'en_ligne',
      v_cmd.client_id,
      p_vente->>'mode',
      p_vente->'lignes',
      (p_vente->>'total')::numeric,
      coalesce((p_vente->>'arrondi')::numeric, 0),
      p_vente->'ecriture_lignes',
      nullif(p_vente->>'facture_id', '')::uuid,
      p_user_id,
      nullif(p_vente->>'montant_recu', '')::numeric);
    v_id := (v_vente->>'id')::uuid;
  end if;

  -- La vente a sorti le stock : la réservation n'a plus lieu d'être.
  perform public.reserver_stock_commande(p_commande_id, -1);

  update public.commandes
     set statut = p_statut,
         vente_id = coalesce(v_id, vente_id),
         numero_suivi = coalesce(nullif(btrim(coalesce(p_numero_suivi, '')), ''), numero_suivi)
   where id = p_commande_id;

  insert into public.journal_evenements (entite, entite_id, evenement, apres, user_id)
  values ('commande_en_ligne', p_commande_id, p_statut,
          jsonb_build_object('vente_id', v_id, 'numero_suivi', p_numero_suivi), p_user_id);

  return jsonb_build_object('id', p_commande_id, 'vente_id', v_id, 'deja', false);
end;
$function$;

/** Annulation : la réservation retourne au stock disponible, motif obligatoire. */
create or replace function public.annuler_commande_en_ligne(
  p_commande_id uuid, p_motif text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_cmd record;
begin
  select * into v_cmd from public.commandes where id = p_commande_id for update;
  if not found then raise exception 'Commande introuvable.'; end if;
  if v_cmd.statut in ('remise', 'expediee') then
    raise exception 'Une commande déjà remise ne s''annule pas : passez un retour.';
  end if;
  if v_cmd.statut = 'annulee' then return; end if;
  if btrim(coalesce(p_motif, '')) = '' then
    raise exception 'Indiquez le motif de l''annulation.';
  end if;

  if v_cmd.statut in ('confirmee', 'en_preparation', 'prete') then
    perform public.reserver_stock_commande(p_commande_id, -1);
  end if;

  update public.commandes
     set statut = 'annulee', motif_annulation = btrim(p_motif)
   where id = p_commande_id;

  insert into public.journal_evenements (entite, entite_id, evenement, apres, user_id)
  values ('commande_en_ligne', p_commande_id, 'annulation',
          jsonb_build_object('numero', v_cmd.numero, 'motif', btrim(p_motif)), p_user_id);
end;
$function$;