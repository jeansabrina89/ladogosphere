-- Boutique : le coût d'achat entre avec la marchandise et se fige à la vente.
--
-- Rien ne change dans les écritures comptables : la vente reste comptabilisée
-- comme avant (passer_ecriture, mêmes lignes). Le coût figé sert aux
-- statistiques de marge, pas au journal.
--
-- 1. mouvements_stock.cout_unitaire — coût d'achat HT d'une unité, tel que
--    payé. Il n'a de sens que sur une ENTRÉE ; une entrée sans coût reste
--    acceptée (l'écran la signale « coût non renseigné »).
--
-- 2. articles.cout_moyen — coût moyen pondéré des unités en stock, recalculé à
--    chaque entrée chiffrée par le trigger qui tient déjà le stock :
--      (stock avant × coût moyen avant + quantité × coût unitaire)
--        / (stock avant + quantité)
--    Un stock avant négatif compte pour zéro ; un coût moyen encore inconnu
--    prend le coût de l'entrée. Une sortie ne le change pas. La même formule
--    vit en TypeScript (src/lib/coutMoyen.ts), testée sur les mêmes cas.
--    L'entrée chiffrée met aussi à jour prix_achat, « dernier prix d'achat
--    connu », qui reste modifiable à la main sur la fiche.
--
-- 3. ventes_lignes.cout_unitaire_fige — le coût moyen de l'article au moment de
--    la vente, figé dans finaliser_vente, le passage obligé de toutes les
--    ventes (caisse, commande en ligne remise ou expédiée, commande sur
--    mesure). Un article personnalisable ne tient pas de stock : son coût est
--    celui des matières, calculé par l'application depuis les fournitures de
--    la commande et transmis dans la ligne (clé cout_unitaire_fige), ou null
--    s'il n'est pas calculable — jamais inventé. Un retour reprend le coût de
--    la ligne d'origine.
--
-- 4. Reprise : cout_moyen = prix_achat pour les articles existants ; les lignes
--    de vente existantes — toutes des ventes de contrôle ZZ — reçoivent le
--    prix_achat actuel de leur article. Les lignes de vente sont inaltérables :
--    le verrou est levé le temps de cette seule mise à jour, dans la même
--    transaction, puis remis.

begin;

-- ── 1. Les colonnes ────────────────────────────────────────────────────────

alter table public.mouvements_stock
  add column if not exists cout_unitaire numeric(12,4);
alter table public.mouvements_stock drop constraint if exists mouvements_stock_cout_unitaire_entree;
alter table public.mouvements_stock add constraint mouvements_stock_cout_unitaire_entree
  check (cout_unitaire is null or (type = 'entree' and cout_unitaire >= 0));

alter table public.articles
  add column if not exists cout_moyen numeric(12,4);
alter table public.articles drop constraint if exists articles_cout_moyen_positif;
alter table public.articles add constraint articles_cout_moyen_positif
  check (cout_moyen is null or cout_moyen >= 0);

alter table public.ventes_lignes
  add column if not exists cout_unitaire_fige numeric(12,4);

comment on column public.mouvements_stock.cout_unitaire is
  'Coût d''achat HT d''une unité, tel que payé. Seulement sur une entrée ; null = coût non renseigné.';
comment on column public.articles.cout_moyen is
  'Coût moyen pondéré des unités en stock, recalculé à chaque entrée chiffrée (trigger appliquer_mouvement_stock).';
comment on column public.ventes_lignes.cout_unitaire_fige is
  'Coût d''une unité au moment de la vente (coût moyen, ou matières pour le sur-mesure). Null = coût non renseigné. Sert aux statistiques, jamais au journal.';

-- ── 2. Le coût moyen, tenu avec le stock ──────────────────────────────────

create or replace function public.cout_moyen_apres_entree(
  p_stock_avant numeric, p_cout_moyen_avant numeric, p_quantite numeric, p_cout_unitaire numeric
)
returns numeric
language sql
immutable
set search_path to ''
as $function$
  select case
    when p_cout_unitaire is null or coalesce(p_quantite, 0) <= 0 then p_cout_moyen_avant
    when p_cout_moyen_avant is null or greatest(coalesce(p_stock_avant, 0), 0) = 0 then round(p_cout_unitaire, 4)
    else round(
      (greatest(p_stock_avant, 0) * p_cout_moyen_avant + p_quantite * p_cout_unitaire)
        / (greatest(p_stock_avant, 0) + p_quantite), 4)
  end;
$function$;

create or replace function public.appliquer_mouvement_stock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_stock      numeric;
  v_cout_moyen numeric;
  v_apres      numeric;
begin
  if new.motif is not null and btrim(new.motif) = '' then
    new.motif := null;
  end if;
  if new.type in ('ajustement','perte','usage_interne') and new.motif is null then
    raise exception 'Indiquez le motif du mouvement.';
  end if;

  select stock_actuel, cout_moyen into v_stock, v_cout_moyen
    from public.articles where id = new.article_id for update;
  if not found then
    raise exception 'Article introuvable.';
  end if;

  v_apres := v_stock + new.quantite;

  -- Aucun stock négatif silencieux. Seul l'ajustement d'inventaire fait foi :
  -- ce qui est compté dans le local prime sur ce que dit la base.
  if v_apres < 0 and new.type <> 'ajustement' then
    raise exception 'Stock insuffisant : il reste % en stock, la sortie demandée est de %.',
      trim_zero(v_stock), trim_zero(abs(new.quantite));
  end if;

  new.quantite_apres := v_apres;

  perform set_config('app.stock_via_mouvement', 'on', true);
  if new.type = 'entree' and new.cout_unitaire is not null and new.quantite > 0 then
    -- Entrée chiffrée : le coût moyen se repondère, le dernier prix d'achat suit.
    update public.articles
       set stock_actuel = v_apres,
           cout_moyen   = public.cout_moyen_apres_entree(v_stock, v_cout_moyen, new.quantite, new.cout_unitaire),
           prix_achat   = round(new.cout_unitaire, 2)
     where id = new.article_id;
  else
    update public.articles set stock_actuel = v_apres where id = new.article_id;
  end if;
  perform set_config('app.stock_via_mouvement', 'off', true);

  return new;
end;
$function$;

-- ── 3. Le coût figé à la vente, repris au retour ──────────────────────────

create or replace function public.finaliser_vente(p_cle_idempotence text, p_canal text, p_client_id uuid, p_mode text, p_lignes jsonb, p_total numeric, p_arrondi numeric, p_ecriture_lignes jsonb, p_facture_id uuid, p_user_id uuid, p_montant_recu numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Le coût se fige ICI, pour toutes les ventes : le coût moyen de l'article
  -- à cet instant ; pour un article personnalisable, le coût des matières que
  -- l'application a calculé (ou null) — jamais le coût moyen d'un article qui
  -- ne tient pas de stock.
  insert into public.ventes_lignes
    (vente_id, article_id, libelle, quantite, prix_unitaire, taux_tva, motif_tva, montant, secteur_tdfn,
     prix_base, remise_pourcentage, remise_origine, remise_libelle, cout_unitaire_fige)
  select v_id, nullif(l->>'article_id','')::uuid, l->>'libelle',
         (l->>'quantite')::numeric, (l->>'prix_unitaire')::numeric,
         coalesce((l->>'taux_tva')::numeric, 0), nullif(l->>'motif_tva',''),
         (l->>'montant')::numeric, nullif(l->>'secteur_tdfn',''),
         nullif(l->>'prix_base','')::numeric, nullif(l->>'remise_pourcentage','')::numeric,
         nullif(l->>'remise_origine',''), nullif(l->>'remise_libelle',''),
         case
           when a.id is null then null
           when a.type_article = 'personnalisable' then nullif(l->>'cout_unitaire_fige','')::numeric
           else a.cout_moyen
         end
    from jsonb_array_elements(p_lignes) as l
    left join public.articles a on a.id = nullif(l->>'article_id','')::uuid;

  insert into public.mouvements_stock (article_id, type, quantite, vente_id, user_id)
  select a.id, 'vente', -(l->>'quantite')::numeric, v_id, p_user_id
    from jsonb_array_elements(p_lignes) as l
    join public.articles a on a.id = nullif(l->>'article_id','')::uuid
   where a.type_article <> 'personnalisable';

  if p_facture_id is not null then
    select coalesce(max(ordre), 0) into v_ordre
      from public.facture_lignes where facture_id = p_facture_id;

    insert into public.facture_lignes
      (facture_id, ordre, libelle, quantite, prix_unitaire, compte_produit, taux_tva, motif_tva, secteur_tdfn,
       prix_base, remise_pourcentage, remise_origine, remise_libelle)
    select p_facture_id, v_ordre + row_number() over (), l->>'libelle',
           (l->>'quantite')::numeric, (l->>'prix_unitaire')::numeric, '3200',
           coalesce((l->>'taux_tva')::numeric, 0), nullif(l->>'motif_tva',''),
           nullif(l->>'secteur_tdfn',''),
           nullif(l->>'prix_base','')::numeric, nullif(l->>'remise_pourcentage','')::numeric,
           nullif(l->>'remise_origine',''), nullif(l->>'remise_libelle','')
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

create or replace function public.retourner_vente(p_vente_id uuid, p_cle_idempotence text, p_lignes jsonb, p_total numeric, p_arrondi numeric, p_ecriture_lignes jsonb, p_motif text, p_user_id uuid)
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

  -- Un retour reprend le coût figé de la ligne vendue — même article, même
  -- libellé, la règle qui apparie déjà les retours à leurs lignes. Jamais le
  -- coût d'aujourd'hui : la marge rendue est celle qui avait été faite.
  insert into public.ventes_lignes
    (vente_id, article_id, libelle, quantite, prix_unitaire, taux_tva, motif_tva, montant, secteur_tdfn,
     prix_base, remise_pourcentage, remise_origine, remise_libelle, cout_unitaire_fige)
  select v_id, nullif(l->>'article_id','')::uuid, l->>'libelle',
         (l->>'quantite')::numeric, (l->>'prix_unitaire')::numeric,
         coalesce((l->>'taux_tva')::numeric, 0), nullif(l->>'motif_tva',''),
         (l->>'montant')::numeric, nullif(l->>'secteur_tdfn',''),
         nullif(l->>'prix_base','')::numeric, nullif(l->>'remise_pourcentage','')::numeric,
         nullif(l->>'remise_origine',''), nullif(l->>'remise_libelle',''),
         (select vl.cout_unitaire_fige from public.ventes_lignes vl
           where vl.vente_id = p_vente_id
             and vl.article_id is not distinct from nullif(l->>'article_id','')::uuid
             and vl.libelle = l->>'libelle'
           order by vl.created_at
           limit 1)
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

-- ── 4. Reprise ─────────────────────────────────────────────────────────────

update public.articles set cout_moyen = prix_achat where cout_moyen is null and prix_achat is not null;

alter table public.ventes_lignes disable trigger ventes_lignes_pas_de_maj;
update public.ventes_lignes vl
   set cout_unitaire_fige = a.prix_achat
  from public.articles a
 where a.id = vl.article_id and vl.cout_unitaire_fige is null;
alter table public.ventes_lignes enable trigger ventes_lignes_pas_de_maj;

commit;