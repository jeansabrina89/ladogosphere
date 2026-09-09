-- Une mesure se fige comme le reste : le nombre ET son unité. « 38 cm » reste
-- lisible tel quel sur la commande, et le nombre reste exploitable en atelier
-- même si le groupe change de bornes ou d'unité demain.
create or replace function public.creer_commande_sur_mesure(
  p_cle_idempotence text, p_client_id uuid, p_article_id uuid, p_choix jsonb,
  p_prix numeric, p_delai integer, p_date_promise date, p_notes text,
  p_user_id uuid, p_vente jsonb default null::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id       uuid := gen_random_uuid();
  v_exercice int  := extract(year from now())::int;
  v_numero   text;
  v_deja     record;
  v_vente    jsonb;
  v_vente_id uuid;
begin
  if p_cle_idempotence is not null then
    select id, numero, vente_id into v_deja
      from public.commandes_personnalisees where cle_idempotence = p_cle_idempotence;
    if found then
      return jsonb_build_object('id', v_deja.id, 'numero', v_deja.numero,
                                'vente_id', v_deja.vente_id, 'deja', true);
    end if;
  end if;

  if p_choix is null or jsonb_array_length(p_choix) = 0 then
    raise exception 'Aucun choix n''a été fait.';
  end if;

  v_numero := public.prochain_numero_facture(v_exercice, 'CMD');

  insert into public.commandes_personnalisees (
    id, numero, client_id, article_id, prix_total, delai_jours, date_promise,
    statut, notes, exercice, cle_idempotence, created_by)
  values (
    v_id, v_numero, p_client_id, p_article_id, p_prix, p_delai, p_date_promise,
    'a_faire', nullif(btrim(coalesce(p_notes, '')), ''), v_exercice,
    p_cle_idempotence, p_user_id);

  insert into public.commandes_choix (
    commande_id, groupe_nom, valeur_libelle, valeur_texte, code_couleur,
    supplement_prix, ordre, composant_article_id, composant_quantite,
    valeur_nombre, unite)
  select v_id,
         c->>'groupe_nom',
         c->>'valeur_libelle',
         nullif(c->>'valeur_texte', ''),
         nullif(c->>'code_couleur', ''),
         coalesce((c->>'supplement_prix')::numeric, 0),
         coalesce((c->>'ordre')::int, 0),
         nullif(c->>'composant_article_id', '')::uuid,
         nullif(c->>'composant_quantite', '')::numeric,
         nullif(c->>'valeur_nombre', '')::numeric,
         nullif(c->>'unite', '')
    from jsonb_array_elements(p_choix) as c;

  -- Encaissement : le mécanisme d'APP 11, sans rien de nouveau côté comptable.
  if p_vente is not null then
    v_vente := public.finaliser_vente(
      p_vente->>'cle_idempotence',
      'comptoir',
      p_client_id,
      p_vente->>'mode',
      p_vente->'lignes',
      (p_vente->>'total')::numeric,
      coalesce((p_vente->>'arrondi')::numeric, 0),
      p_vente->'ecriture_lignes',
      nullif(p_vente->>'facture_id', '')::uuid,
      p_user_id,
      nullif(p_vente->>'montant_recu', '')::numeric);

    v_vente_id := (v_vente->>'id')::uuid;
    update public.commandes_personnalisees set vente_id = v_vente_id where id = v_id;
  end if;

  insert into public.journal_evenements (entite, entite_id, evenement, apres, user_id)
  values ('commande', v_id, 'creation',
          jsonb_build_object('numero', v_numero, 'prix', p_prix, 'delai', p_delai,
                             'vente_id', v_vente_id, 'choix', jsonb_array_length(p_choix)),
          p_user_id);

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'vente_id', v_vente_id, 'deja', false);

exception
  when unique_violation then
    if p_cle_idempotence is not null then
      select id, numero, vente_id into v_deja
        from public.commandes_personnalisees where cle_idempotence = p_cle_idempotence;
      if found then
        return jsonb_build_object('id', v_deja.id, 'numero', v_deja.numero,
                                  'vente_id', v_deja.vente_id, 'deja', true);
      end if;
    end if;
    raise;
end;
$function$;