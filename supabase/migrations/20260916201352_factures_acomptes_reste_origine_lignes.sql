-- Factures : l'acompte suit la réservation jusqu'à sa facture, le reste tient
-- compte des avoirs, et le brouillon d'un séjour garde ses lignes de caisse.
--
-- Aucune écriture comptable passée n'est modifiée. Vérifié avant application :
-- pour les 57 factures émises, la nouvelle définition d'acomptes_a_imputer
-- rend exactement le même montant que l'ancienne (il n'existe aucun paiement
-- hors facture en base) ; une resynchronisation ne peut donc rien déplacer.
--
-- A. RATTACHEMENT DES ACOMPTES À L'ÉMISSION
--    paiements_resa est en ajout seul : un paiement ne change pas de pièce. Le
--    rattachement s'écrit en deux lignes de transfert, mode « rattachement »,
--    liées au paiement d'origine (rattache_de) :
--      - sur la réservation seule : − montant (l'acompte quitte la réservation) ;
--      - sur la facture          : + montant, à la date de l'acompte.
--    Le tout dans emettre_facture, la même transaction que l'émission : une
--    facture n'existe jamais émise sans ses acomptes, ni l'inverse.
--    Comptabilité : le compte des acomptes clients est 2030. L'acompte y est
--    déjà passé côté réservation (D liquidité / C 2030) ; l'émission le solde
--    contre le débiteur (D 2030 / C 1100) pour le montant rattaché. Le mode
--    « rattachement » n'a pas de compte de liquidité : les deux moteurs par
--    delta l'ignorent, rien n'est encaissé deux fois.
--
-- B. UN SEUL CALCUL DU RESTE
--    recalculer_paiement_facture(facture) : payé = paiements rattachés,
--    reste = total − payé − avoirs émis sur la facture (jamais négatif), statut
--    qui suit. C'est la seule écriture de montant_paye / montant_restant d'une
--    facture : l'émission, la caisse, le retour l'appellent ici ; l'application
--    l'appelle après un encaissement, un avoir, une annulation de paiement ou
--    un changement de lignes.
--
-- C. ORIGINE DES LIGNES DE FACTURE
--    facture_lignes.origine : 'reservation' | 'caisse' | 'manuelle'. La
--    régénération du brouillon d'un séjour ne remplace plus que les lignes
--    'reservation'. Reprise : la table ne porte ni vente_id ni article_id ; on
--    lit donc ce qui existe — une ligne rattachée à une réservation ou à une
--    adhésion vient de la réservation, une ligne de vente (compte 3200, ou
--    « Retour — … ») vient de la caisse, le reste a été saisi à la main.
--
-- D. finaliser_vente et retourner_vente n'étaient pas fermées aux rôles publics
--    depuis leur création : elles ne s'appellent que côté serveur.

begin;

-- ── A. Le mode « rattachement » ────────────────────────────────────────────

alter table public.paiements_resa drop constraint if exists paiements_resa_mode_check;
alter table public.paiements_resa add constraint paiements_resa_mode_check
  check (mode = any (array['cash','twint','carte','stripe','virement','avoir','rattachement']));

alter table public.paiements_resa
  add column if not exists rattache_de uuid references public.paiements_resa(id);

alter table public.paiements_resa drop constraint if exists paiements_resa_rattachement_check;
alter table public.paiements_resa add constraint paiements_resa_rattachement_check
  check ((mode = 'rattachement') = (rattache_de is not null));

-- Un acompte se rattache une fois : une ligne côté réservation, une côté facture.
create unique index if not exists paiements_resa_rattachement_unique
  on public.paiements_resa (rattache_de, (facture_id is null))
  where rattache_de is not null;

comment on column public.paiements_resa.rattache_de is
  'Ligne de transfert (mode rattachement) : le paiement hors facture qu''elle rattache à la facture émise.';

-- ── C. L'origine des lignes ────────────────────────────────────────────────

alter table public.facture_lignes
  add column if not exists origine text not null default 'manuelle';
alter table public.facture_lignes drop constraint if exists facture_lignes_origine_check;
alter table public.facture_lignes add constraint facture_lignes_origine_check
  check (origine in ('reservation', 'caisse', 'manuelle'));

-- Reprise. Les lignes d'une facture émise sont verrouillées par trigger, et un
-- autre recalcule le montant à toute mise à jour : les deux sont levés le temps
-- de cette seule colonne, dans la même transaction — aucun montant ne bouge.
alter table public.facture_lignes disable trigger trg_facture_lignes_integrite;
alter table public.facture_lignes disable trigger trg_facture_lignes_montant;
update public.facture_lignes
   set origine = case
     when reservation_id is not null or cotisation_id is not null then 'reservation'
     when compte_produit = '3200' or libelle like 'Retour — %' then 'caisse'
     else 'manuelle'
   end;
alter table public.facture_lignes enable trigger trg_facture_lignes_montant;
alter table public.facture_lignes enable trigger trg_facture_lignes_integrite;

comment on column public.facture_lignes.origine is
  'reservation : régénérée avec le brouillon du séjour ; caisse : report d''un achat ; manuelle : saisie. La régénération ne remplace que les lignes reservation.';

-- ── B. Le reste d'une facture, calculé à un seul endroit ──────────────────

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

  return jsonb_build_object('paye', v_paye, 'avoirs', v_avoirs, 'reste', v_reste, 'statut', v_statut);
end;
$function$;

revoke execute on function public.recalculer_paiement_facture(uuid) from public, anon, authenticated;

-- ── A. Les acomptes à imputer : ceux rattachés, et les factures d'acompte ─

create or replace function public.acomptes_a_imputer(p_facture_id uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $function$
  with resas as (
    select distinct reservation_id
      from public.facture_lignes
     where facture_id = p_facture_id and reservation_id is not null
  ),
  factures_acompte as (
    select distinct fa.id
      from public.factures fa
      join public.facture_lignes fl on fl.facture_id = fa.id
     where fa.type = 'acompte'
       and fa.numero is not null
       and fa.statut not in ('annulee', 'annulee_par_avoir')
       and fl.reservation_id in (select reservation_id from resas)
  )
  select round(coalesce(sum(p.montant), 0), 2)
    from public.paiements_resa p
   -- Les acomptes rattachés à CETTE facture, et ceux des factures d'acompte.
   -- Un acompte hors facture non rattaché n'est plus imputé d'office : il le
   -- sera à l'émission, par son rattachement, et à une seule facture.
   where (p.facture_id = p_facture_id and p.mode = 'rattachement')
      or (p.facture_id in (select id from factures_acompte));
$function$;

-- ── A. L'émission rattache les acomptes, dans sa transaction ──────────────

create or replace function public.emettre_facture(p_facture_id uuid, p_user_id uuid DEFAULT NULL::uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_f          record;
  v_nb_lignes  int;
  v_total      numeric;
  v_exercice   int;
  v_prefixe    text;
  v_numero     text;
  v_delai      int;
  v_echeance   date;
  v_acomptes   numeric := 0;
  v_lignes     jsonb   := '[]'::jsonb;
  l            record;
  a            record;
  v_resa       record;
begin
  select * into v_f from public.factures where id = p_facture_id for update;
  if not found then
    raise exception 'Facture introuvable.';
  end if;
  if v_f.numero is not null then
    raise exception 'Facture % déjà émise.', v_f.numero;
  end if;
  if v_f.statut <> 'brouillon' then
    raise exception 'Seul un brouillon peut être émis (statut actuel : %).', v_f.statut;
  end if;
  if v_f.client_id is null then
    raise exception 'Facture sans client : émission impossible.';
  end if;

  select count(*), coalesce(sum(montant), 0) into v_nb_lignes, v_total
    from public.facture_lignes where facture_id = p_facture_id;
  if v_nb_lignes = 0 then
    raise exception 'Facture sans ligne : émission impossible.';
  end if;

  v_exercice := extract(year from coalesce(v_f.date_facture, current_date))::int;
  v_prefixe  := case when v_f.type = 'avoir' then 'AV' else 'FAC' end;
  v_numero   := public.prochain_numero_facture(v_exercice, v_prefixe);

  select coalesce(nullif(valeur, ''), '30')::int into v_delai
    from public.parametres where cle = 'delai_paiement_jours';
  v_delai := coalesce(v_delai, 30);
  v_echeance := coalesce(v_f.date_facture, current_date) + v_delai;

  update public.factures
     set numero        = v_numero,
         reference_qr  = public.reference_qrr(v_numero),
         date_echeance = v_echeance,
         montant_total = v_total,
         montant_ttc   = v_total,
         montant_ht    = v_total,
         montant_tva   = 0,
         statut        = 'envoyee',
         emise_par     = p_user_id,
         emise_le      = now(),
         exercice      = v_exercice
   where id = p_facture_id;

  insert into public.journal_evenements (entite, entite_id, evenement, apres, user_id)
  values ('facture', p_facture_id, 'emission',
          jsonb_build_object('numero', v_numero, 'total', v_total,
                             'echeance', v_echeance, 'type', v_f.type),
          p_user_id);

  -- Les acomptes suivent la réservation jusqu'à sa facture : chaque paiement
  -- encore hors facture d'une réservation couverte est rattaché ici, une fois.
  if v_f.type in ('facture', 'libre') then
    for v_resa in
      select distinct fl.reservation_id
        from public.facture_lignes fl
       where fl.facture_id = p_facture_id and fl.reservation_id is not null
    loop
      for a in
        select p.id, p.client_id, p.montant, p.date_paiement
          from public.paiements_resa p
         where p.reservation_id = v_resa.reservation_id
           and p.facture_id is null
           and p.mode <> 'rattachement'
           and p.montant <> 0
           and not exists (select 1 from public.paiements_resa r where r.rattache_de = p.id)
         order by p.date_paiement, p.created_at
      loop
        insert into public.paiements_resa
          (reservation_id, facture_id, client_id, date_paiement, mode, montant, motif, source, created_by, rattache_de)
        values
          (v_resa.reservation_id, null, a.client_id, current_date, 'rattachement', -a.montant,
           'Acompte du ' || to_char(a.date_paiement, 'DD.MM.YYYY') || ' rattaché à la facture ' || v_numero
             || ' (' || left(a.id::text, 8) || ')',
           'manuel', p_user_id, a.id),
          (null, p_facture_id, a.client_id, a.date_paiement, 'rattachement', a.montant,
           'Acompte reçu le ' || to_char(a.date_paiement, 'DD.MM.YYYY') || ' (' || left(a.id::text, 8) || ')',
           'manuel', p_user_id, a.id);
      end loop;

      insert into public.journal_evenements (entite, entite_id, evenement, apres, user_id)
      select 'reservation', v_resa.reservation_id, 'acompte_rattache',
             jsonb_build_object('facture', v_numero, 'facture_id', p_facture_id,
                                'montant', round(sum(r.montant), 2), 'paiements', count(*)),
             p_user_id
        from public.paiements_resa r
       where r.facture_id = p_facture_id and r.mode = 'rattachement'
         and r.rattache_de in (select id from public.paiements_resa where reservation_id = v_resa.reservation_id)
      having count(*) > 0;
    end loop;
  end if;

  -- Payé, reste et statut : le seul calcul, qui voit les acomptes rattachés.
  perform public.recalculer_paiement_facture(p_facture_id);

  if v_f.type in ('avoir', 'acompte') then
    return v_numero;
  end if;

  for l in
    select compte_produit, round(sum(montant), 2) as montant
      from public.facture_lignes
     where facture_id = p_facture_id
     group by compte_produit
     having round(sum(montant), 2) <> 0
  loop
    v_lignes := v_lignes || jsonb_build_object(
      'compte', l.compte_produit,
      'debit',  greatest(-l.montant, 0),
      'credit', greatest(l.montant, 0));
  end loop;

  v_acomptes := least(greatest(public.acomptes_a_imputer(p_facture_id), 0), v_total);

  if v_total <> 0 then
    v_lignes := v_lignes || jsonb_build_object(
      'compte', '1100', 'debit', greatest(v_total, 0), 'credit', greatest(-v_total, 0));
  end if;
  if v_acomptes <> 0 then
    v_lignes := v_lignes || jsonb_build_object('compte', '2030', 'debit', v_acomptes, 'credit', 0);
    v_lignes := v_lignes || jsonb_build_object('compte', '1100', 'debit', 0, 'credit', v_acomptes);
  end if;

  if jsonb_array_length(v_lignes) > 0 and v_total <> 0 then
    perform public.passer_ecriture(
      coalesce(v_f.date_facture, current_date),
      'Facture ' || v_numero,
      'facture',
      p_facture_id,
      v_lignes,
      p_user_id,
      null);
  end if;

  return v_numero;
end;
$function$;

-- ── Caisse et retour : lignes « caisse », reste par la fonction unique ────

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

    -- Origine « caisse » : la régénération du brouillon d'un séjour les garde.
    insert into public.facture_lignes
      (facture_id, ordre, libelle, quantite, prix_unitaire, compte_produit, taux_tva, motif_tva, secteur_tdfn,
       prix_base, remise_pourcentage, remise_origine, remise_libelle, origine)
    select p_facture_id, v_ordre + row_number() over (), l->>'libelle',
           (l->>'quantite')::numeric, (l->>'prix_unitaire')::numeric, '3200',
           coalesce((l->>'taux_tva')::numeric, 0), nullif(l->>'motif_tva',''),
           nullif(l->>'secteur_tdfn',''),
           nullif(l->>'prix_base','')::numeric, nullif(l->>'remise_pourcentage','')::numeric,
           nullif(l->>'remise_origine',''), nullif(l->>'remise_libelle',''), 'caisse'
      from jsonb_array_elements(p_lignes) as l;

    select coalesce(sum(montant), 0) into v_total_facture
      from public.facture_lignes where facture_id = p_facture_id;

    update public.factures
       set montant_total = v_total_facture, montant_ttc = v_total_facture,
           montant_ht = v_total_facture
     where id = p_facture_id;
    perform public.recalculer_paiement_facture(p_facture_id);
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
       prix_base, remise_pourcentage, remise_origine, remise_libelle, origine)
    select v_origine.facture_id, v_ordre + row_number() over (),
           'Retour — ' || (l->>'libelle'),
           (l->>'quantite')::numeric, (l->>'prix_unitaire')::numeric, '3200',
           coalesce((l->>'taux_tva')::numeric, 0), nullif(l->>'motif_tva',''),
           nullif(l->>'secteur_tdfn',''),
           nullif(l->>'prix_base','')::numeric, nullif(l->>'remise_pourcentage','')::numeric,
           nullif(l->>'remise_origine',''), nullif(l->>'remise_libelle',''), 'caisse'
      from jsonb_array_elements(p_lignes) as l;

    select coalesce(sum(montant), 0) into v_total_facture
      from public.facture_lignes where facture_id = v_origine.facture_id;

    update public.factures
       set montant_total = v_total_facture, montant_ttc = v_total_facture,
           montant_ht = v_total_facture
     where id = v_origine.facture_id;
    perform public.recalculer_paiement_facture(v_origine.facture_id);
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

-- ── D. Fonctions de serveur, fermées aux rôles publics ────────────────────

revoke execute on function public.finaliser_vente(text, text, uuid, text, jsonb, numeric, numeric, jsonb, uuid, uuid, numeric) from public, anon, authenticated;
revoke execute on function public.retourner_vente(uuid, text, jsonb, numeric, numeric, jsonb, text, uuid) from public, anon, authenticated;

commit;