-- APP 38 — un article fait sur mesure se paie avant d'être fabriqué.
--
-- Règle commerciale publiée sur https://ladogosphere.ch/conditions-vente : un
-- article sur mesure commandé EN LIGNE se paie entièrement à la commande, et la
-- fabrication ne commence qu'une fois le paiement reçu.
--
-- Au comptoir, rien ne change : Sabrina encaisse elle-même, la commande naît
-- « a_faire » avec sa date promise, exactement comme avant.
--
-- ── CE QUE CETTE MIGRATION POSE ───────────────────────────────────────────
--
--   1. le statut « attente_paiement », AVANT « a_faire » ;
--   2. `jours_ouvrables_apres` — la date promise ne se calcule plus seulement
--      dans le navigateur, puisqu'elle se décide maintenant au paiement ;
--   3. `creer_commande_sur_mesure` accepte un statut de naissance ;
--   4. `liberer_atelier_commande_payee` — LA bascule, une seule fonction ;
--   5. `recalculer_paiement_facture` l'appelle ;
--   6. `annuler_commande_en_ligne` annule aussi l'atelier en attente.
--
-- ── POURQUOI LA BASCULE EST ACCROCHÉE À `recalculer_paiement_facture` ─────
--
-- Une facture devient entièrement payée par SIX chemins : trois en SQL
-- (`emettre_facture` impute les acomptes, `finaliser_vente` solde à la caisse,
-- `retourner_vente` sur un retour) et trois par l'application (l'encaissement
-- des factures, la création d'une facture, le paiement par avoir d'une
-- réservation). Les six passent par `recalculer_paiement_facture` : c'est le
-- seul endroit où `statut` devient « acquittee ». Accrocher la bascule ailleurs
-- aurait voulu dire l'accrocher six fois, et en oublier une le jour où un
-- septième chemin apparaîtra.

-- ── 1. Le statut ──────────────────────────────────────────────────────────

alter table public.commandes_personnalisees
  drop constraint if exists commandes_personnalisees_statut_check;

alter table public.commandes_personnalisees
  add constraint commandes_personnalisees_statut_check
  check (statut = any (array[
    'attente_paiement',  -- APP 38 : commandée en ligne, pas encore payée.
    'a_faire',
    'en_cours',
    'prete',
    'remise',
    'annulee'
  ]::text[]));

-- ── 2. Les jours ouvrables ────────────────────────────────────────────────

/**
 * La date promise, en jours ouvrables depuis un jour donné.
 *
 * Le calcul existait en TypeScript (`datePromise`, personnalisationLogique.ts)
 * et suffisait tant que la date se décidait à la création, dans le navigateur.
 * Elle se décide maintenant à l'arrivée du paiement, qui peut venir d'un
 * virement rapproché en base sans qu'aucun code applicatif ne tourne.
 *
 * Les deux écritures doivent donc dire la même chose. Elles ont été comparées
 * terme à terme à l'application de cette migration, sur 36 520 couples (dix
 * ans de dates de départ × zéro à neuf jours) : empreintes identiques des deux
 * côtés, md5 2e9db4edc7fc857e513f2d1100864a77. Zéro écart.
 *
 * Samedi et dimanche seulement : les jours fériés valaisans ne sont pas
 * décomptés, ici pas plus que dans la version TypeScript. Les ajouter serait
 * un sujet en soi, et le faire d'un seul côté serait pire que de ne rien faire.
 */
create or replace function public.jours_ouvrables_apres(p_depart date, p_jours int)
returns date
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  v_jour   date := p_depart;
  v_reste  int  := greatest(coalesce(p_jours, 0), 0);
begin
  while v_reste > 0 loop
    v_jour := v_jour + 1;
    -- `isodow` : 6 = samedi, 7 = dimanche.
    if extract(isodow from v_jour) < 6 then
      v_reste := v_reste - 1;
    end if;
  end loop;
  return v_jour;
end;
$function$;

revoke execute on function public.jours_ouvrables_apres(date, int) from public, anon, authenticated;
grant execute on function public.jours_ouvrables_apres(date, int) to service_role;

-- ── 3. La création accepte un statut de naissance ─────────────────────────

/**
 * `p_statut` est AJOUTÉ EN DERNIER, avec sa valeur par défaut : le comptoir
 * appelle exactement comme avant et obtient exactement le même résultat.
 *
 * L'ancienne signature est SUPPRIMÉE plutôt que laissée en place. Deux
 * fonctions de même nom auraient coexisté — PostgREST aurait eu à choisir, et
 * le choix ne se serait pas vu.
 */
drop function if exists public.creer_commande_sur_mesure(
  text, uuid, uuid, jsonb, numeric, integer, date, text, uuid, jsonb);

create or replace function public.creer_commande_sur_mesure(
  p_cle_idempotence text,
  p_client_id uuid,
  p_article_id uuid,
  p_choix jsonb,
  p_prix numeric,
  p_delai integer,
  p_date_promise date,
  p_notes text,
  p_user_id uuid,
  p_vente jsonb default null::jsonb,
  p_statut text default 'a_faire')
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
  -- Une commande naît à faire, ou en attente de son paiement. Jamais « prête ».
  if p_statut not in ('a_faire', 'attente_paiement') then
    raise exception 'Une commande sur mesure naît « a_faire » ou « attente_paiement ».';
  end if;

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
    v_id, v_numero, p_client_id, p_article_id, p_prix, p_delai,
    -- Pas de date promise tant que le paiement n'est pas là : la promettre
    -- serait s'engager sur un délai dont le compte à rebours n'a pas commencé.
    case when p_statut = 'attente_paiement' then null else p_date_promise end,
    p_statut, nullif(btrim(coalesce(p_notes, '')), ''), v_exercice,
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
                             'vente_id', v_vente_id, 'statut', p_statut,
                             'choix', jsonb_array_length(p_choix)),
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

revoke execute on function public.creer_commande_sur_mesure(
  text, uuid, uuid, jsonb, numeric, integer, date, text, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.creer_commande_sur_mesure(
  text, uuid, uuid, jsonb, numeric, integer, date, text, uuid, jsonb, text)
  to service_role;

-- ── 4. LA bascule ─────────────────────────────────────────────────────────

/**
 * Le paiement est arrivé : la fabrication peut commencer.
 *
 * IDEMPOTENTE, et par construction : seules les lignes « attente_paiement »
 * sont vues. Un second appel n'en trouve plus aucune et rend 0. C'est ce qui
 * permet de l'appeler à CHAQUE recalcul de paiement sans se demander si elle a
 * déjà tourné — un rapprochement bancaire qui repasse deux fois ne décale pas
 * la date promise d'une semaine.
 *
 * La date promise se compte à partir d'AUJOURD'HUI, pas du jour de la commande :
 * c'est le paiement qui lance le chronomètre, et le dire autrement serait
 * promettre une date déjà passée à qui paie trois semaines plus tard.
 *
 * Le journal reçoit la même forme que `changer_statut_commande` — entité
 * « commande », événement « statut », avant/après — pour que l'écran du journal
 * des gestes n'ait rien de particulier à savoir.
 */
create or replace function public.liberer_atelier_commande_payee(p_facture_id uuid)
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r        record;
  v_date   date;
  v_n      int := 0;
begin
  for r in
    select cp.id, cp.numero, cp.delai_jours
      from public.commandes c
      join public.commandes_lignes cl on cl.commande_id = c.id
      join public.commandes_personnalisees cp on cp.id = cl.commande_personnalisee_id
     where c.facture_id = p_facture_id
       and cp.statut = 'attente_paiement'
  loop
    v_date := public.jours_ouvrables_apres(current_date, coalesce(r.delai_jours, 0));

    update public.commandes_personnalisees
       set statut = 'a_faire', date_promise = v_date
     where id = r.id
       -- La garde est REPÉTÉE ici : entre la lecture et l'écriture, un autre
       -- appel a pu passer. Sans elle, deux rapprochements simultanés
       -- écriraient deux dates promises différentes.
       and statut = 'attente_paiement';

    if not found then
      continue;
    end if;

    insert into public.journal_evenements
      (entite, entite_id, evenement, avant, apres, motif, user_id)
    values
      ('commande', r.id, 'statut',
       jsonb_build_object('statut', 'attente_paiement'),
       jsonb_build_object('statut', 'a_faire', 'fournitures', 0,
                          'date_promise', v_date, 'numero', r.numero),
       'Paiement de la facture reçu : la fabrication peut commencer.',
       null);

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$function$;

revoke execute on function public.liberer_atelier_commande_payee(uuid) from public, anon, authenticated;
grant execute on function public.liberer_atelier_commande_payee(uuid) to service_role;

-- ── 5. Le seul endroit où une facture devient « acquittee » ───────────────

/**
 * Inchangée, SAUF les quatre dernières lignes avant le `return`.
 *
 * La bascule est appelée chaque fois que la facture EST acquittée, et non
 * seulement quand elle vient de le devenir. C'est délibéré : une commande
 * d'atelier peut naître après que la facture a été soldée (une facture réglée
 * d'avance par un acompte, par exemple), et la garde « elle vient de changer »
 * l'aurait laissée en attente pour toujours. L'idempotence rend l'appel
 * répété sans effet.
 */
create or replace function public.recalculer_paiement_facture(p_facture_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_f      record;
  v_paye   numeric;
  v_avoirs numeric;
  v_reste  numeric;
  v_statut text;
begin
  select id, numero, type, statut, montant_total into v_f
    from factures where id = p_facture_id for update;
  if not found then
    return null;
  end if;

  select round(coalesce(sum(montant), 0), 2) into v_paye
    from paiements_resa where facture_id = p_facture_id;

  select round(coalesce(sum(montant_total), 0), 2) into v_avoirs
    from factures
   where facture_origine_id = p_facture_id and type = 'avoir' and numero is not null;

  v_reste := greatest(round(coalesce(v_f.montant_total, 0) - v_paye - v_avoirs, 2), 0);

  v_statut := case
    when v_f.numero is null then v_f.statut
    when v_f.type = 'avoir' then v_f.statut
    when v_f.statut in ('annulee', 'annulee_par_avoir') then v_f.statut
    when v_reste <= 0 then 'acquittee'
    when v_paye > 0 then 'partiellement_reglee'
    else 'envoyee'
  end;

  update factures
     set montant_paye = v_paye, montant_restant = v_reste, statut = v_statut
   where id = p_facture_id;

  -- APP 38 : payée, donc fabricable.
  if v_statut = 'acquittee' then
    perform public.liberer_atelier_commande_payee(p_facture_id);
  end if;

  return jsonb_build_object('paye', v_paye, 'avoirs', v_avoirs, 'reste', v_reste, 'statut', v_statut);
end;
$function$;

revoke execute on function public.recalculer_paiement_facture(uuid) from public, anon, authenticated;
grant execute on function public.recalculer_paiement_facture(uuid) to service_role;

-- ── 6. L'annulation emporte l'atelier qui n'a pas commencé ────────────────

/**
 * Inchangée, SAUF la boucle ajoutée avant le journal.
 *
 * Portée VOLONTAIREMENT étroite : « attente_paiement » seulement. Une commande
 * d'atelier déjà « a_faire » survit encore à l'annulation de sa commande en
 * ligne — c'est un défaut qui existait avant ce lot, et l'élargir ici aurait
 * changé le comportement d'un cas que personne n'a demandé à revoir. Il est
 * signalé dans le résumé du lot.
 */
create or replace function public.annuler_commande_en_ligne(
  p_commande_id uuid, p_motif text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cmd record;
  r     record;
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

  -- APP 38 : rien n'a été payé, rien n'a été fabriqué, rien ne reste ouvert.
  for r in
    select cp.id, cp.numero
      from public.commandes_lignes cl
      join public.commandes_personnalisees cp on cp.id = cl.commande_personnalisee_id
     where cl.commande_id = p_commande_id
       and cp.statut = 'attente_paiement'
  loop
    update public.commandes_personnalisees
       set statut = 'annulee'
     where id = r.id and statut = 'attente_paiement';

    insert into public.journal_evenements
      (entite, entite_id, evenement, avant, apres, motif, user_id)
    values
      ('commande', r.id, 'statut',
       jsonb_build_object('statut', 'attente_paiement'),
       jsonb_build_object('statut', 'annulee', 'fournitures', 0, 'numero', r.numero),
       btrim(p_motif), p_user_id);
  end loop;

  insert into public.journal_evenements (entite, entite_id, evenement, apres, user_id)
  values ('commande_en_ligne', p_commande_id, 'annulation',
          jsonb_build_object('numero', v_cmd.numero, 'motif', btrim(p_motif)), p_user_id);
end;
$function$;

revoke execute on function public.annuler_commande_en_ligne(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.annuler_commande_en_ligne(uuid, text, uuid) to service_role;
