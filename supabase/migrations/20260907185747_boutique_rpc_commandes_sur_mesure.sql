-- La fourniture consommée par un choix est FIGÉE elle aussi : changer le
-- catalogue d'options plus tard ne doit pas changer ce qu'une commande passée
-- décompte au moment de sa fabrication.
alter table public.commandes_choix
  add column if not exists composant_article_id uuid references public.articles(id) on delete set null,
  add column if not exists composant_quantite numeric;

-- Un article personnalisable n'a pas de stock de produit fini : sa vente ne
-- produit donc aucun mouvement. Ce sont ses fournitures qui se décomptent, au
-- passage en fabrication.
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
  select a.id, 'vente', -(l->>'quantite')::numeric, v_id, p_user_id
    from jsonb_array_elements(p_lignes) as l
    join public.articles a on a.id = nullif(l->>'article_id','')::uuid
   where a.type_article <> 'personnalisable';

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


-- Commande sur mesure : les choix figés, le numéro, et l'encaissement quand il
-- a lieu — le tout dans une seule transaction.
create or replace function public.creer_commande_sur_mesure(
  p_cle_idempotence text,
  p_client_id       uuid,
  p_article_id      uuid,
  p_choix           jsonb,
  p_prix            numeric,
  p_delai           integer,
  p_date_promise    date,
  p_notes           text,
  p_user_id         uuid,
  p_vente           jsonb default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
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
    supplement_prix, ordre, composant_article_id, composant_quantite)
  select v_id,
         c->>'groupe_nom',
         c->>'valeur_libelle',
         nullif(c->>'valeur_texte', ''),
         nullif(c->>'code_couleur', ''),
         coalesce((c->>'supplement_prix')::numeric, 0),
         coalesce((c->>'ordre')::int, 0),
         nullif(c->>'composant_article_id', '')::uuid,
         nullif(c->>'composant_quantite', '')::numeric
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


-- Changement de statut. Le passage en fabrication décompte les fournitures,
-- une seule fois, quels que soient les allers-retours.
create or replace function public.changer_statut_commande(
  p_commande_id uuid,
  p_statut      text,
  p_user_id     uuid,
  p_motif       text default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_c        record;
  v_consomme int := 0;
begin
  if p_statut not in ('a_faire','en_cours','prete','remise','annulee') then
    raise exception 'Statut inconnu.';
  end if;

  select * into v_c from public.commandes_personnalisees where id = p_commande_id for update;
  if not found then raise exception 'Commande introuvable.'; end if;
  if v_c.statut = p_statut then
    return jsonb_build_object('id', p_commande_id, 'statut', p_statut, 'consommes', 0, 'deja', true);
  end if;
  if v_c.statut = 'remise' then
    raise exception 'Cette commande est remise : elle ne change plus de statut.';
  end if;

  -- Fournitures : au passage en fabrication, et jamais deux fois.
  if p_statut = 'en_cours' and not v_c.composants_consommes then
    insert into public.mouvements_stock (article_id, type, quantite, motif, user_id)
    select c.composant_article_id, 'vente', -c.composant_quantite,
           'Commande sur mesure ' || v_c.numero || ' — ' || c.groupe_nom || ' : ' || c.valeur_libelle,
           p_user_id
      from public.commandes_choix c
     where c.commande_id = p_commande_id
       and c.composant_article_id is not null
       and coalesce(c.composant_quantite, 0) > 0;
    get diagnostics v_consomme = row_count;

    update public.commandes_personnalisees
       set composants_consommes = true where id = p_commande_id;
  end if;

  update public.commandes_personnalisees set statut = p_statut where id = p_commande_id;

  insert into public.journal_evenements (entite, entite_id, evenement, avant, apres, motif, user_id)
  values ('commande', p_commande_id, 'statut',
          jsonb_build_object('statut', v_c.statut),
          jsonb_build_object('statut', p_statut, 'fournitures', v_consomme),
          nullif(btrim(coalesce(p_motif, '')), ''), p_user_id);

  return jsonb_build_object('id', p_commande_id, 'statut', p_statut,
                            'consommes', v_consomme, 'deja', false);
end;
$function$;


-- Duplication du catalogue d'options d'un article vers un autre : copié, pas
-- partagé. Chaque article reste indépendant ensuite.
create or replace function public.dupliquer_options_article(
  p_source uuid,
  p_cible  uuid,
  p_user_id uuid default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_g       record;
  v_nouveau uuid;
  v_ordre   int;
  v_groupes int := 0;
  v_valeurs int := 0;
  v_n       int;
begin
  if p_source = p_cible then
    raise exception 'La source et la cible sont le même article.';
  end if;

  select coalesce(max(ordre), 0) into v_ordre
    from public.options_groupes where article_id = p_cible;

  for v_g in
    select * from public.options_groupes where article_id = p_source order by ordre, created_at
  loop
    v_ordre := v_ordre + 1;
    insert into public.options_groupes
      (article_id, nom, type, obligatoire, ordre, aide, max_caracteres)
    values
      (p_cible, v_g.nom, v_g.type, v_g.obligatoire, v_ordre, v_g.aide, v_g.max_caracteres)
    returning id into v_nouveau;
    v_groupes := v_groupes + 1;

    insert into public.options_valeurs
      (groupe_id, libelle, image_path, code_couleur, supplement_prix, supplement_delai_jours,
       composant_article_id, composant_quantite, actif, ordre, defaut)
    select v_nouveau, libelle, image_path, code_couleur, supplement_prix, supplement_delai_jours,
           composant_article_id, composant_quantite, actif, ordre, defaut
      from public.options_valeurs where groupe_id = v_g.id;
    get diagnostics v_n = row_count;
    v_valeurs := v_valeurs + v_n;
  end loop;

  return jsonb_build_object('groupes', v_groupes, 'valeurs', v_valeurs);
end;
$function$;