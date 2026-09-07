-- Compta phase 1 — la facture devient la pièce pivot (modèle).
--
-- Rien n'est contourné : le moteur d'écritures (passer_ecriture, synchronisation
-- par delta, tables append-only) est étendu, pas remplacé.
-- La TVA reste hors sujet (phase 2) : les colonnes existent, ht = ttc et tva = 0.

-- ── A1. factures : colonnes de la pièce ─────────────────────────────────────
alter table public.factures
  add column if not exists type               text,
  add column if not exists facture_origine_id uuid references public.factures(id),
  add column if not exists date_echeance      date,
  add column if not exists montant_ht         numeric,
  add column if not exists montant_tva        numeric not null default 0,
  add column if not exists montant_ttc        numeric,
  add column if not exists motif              text,
  add column if not exists pdf_path           text,
  add column if not exists pdf_sha256         text,
  add column if not exists emise_par          uuid references public.profiles(id),
  add column if not exists emise_le           timestamptz,
  add column if not exists exercice           int;

update public.factures set type = 'facture' where type is null;
update public.factures
   set montant_ttc = coalesce(montant_ttc, montant_total, 0),
       montant_ht  = coalesce(montant_ht,  montant_total, 0)
 where montant_ttc is null or montant_ht is null;
update public.factures
   set exercice = extract(year from date_facture)::int
 where exercice is null and date_facture is not null;

alter table public.factures alter column type set default 'facture';
alter table public.factures alter column type set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'factures_type_doc_check') then
    alter table public.factures add constraint factures_type_doc_check
      check (type in ('facture', 'acompte', 'avoir', 'libre'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'factures_avoir_origine_check') then
    alter table public.factures add constraint factures_avoir_origine_check
      check (type <> 'avoir' or facture_origine_id is not null);
  end if;
end $$;

-- Statuts : on garde le vocabulaire existant en base ('acquittee',
-- 'partiellement_reglee') et on ajoute l'issue « soldée par un avoir ».
alter table public.factures drop constraint if exists factures_statut_check;
alter table public.factures add constraint factures_statut_check
  check (statut in ('brouillon', 'envoyee', 'partiellement_reglee', 'arrangement_paiement',
                    'acquittee', 'annulee', 'annulee_par_avoir'));

create index if not exists idx_factures_origine   on public.factures(facture_origine_id);
create index if not exists idx_factures_exercice  on public.factures(exercice);
create index if not exists idx_factures_echeance  on public.factures(date_echeance);

-- Le client voit ses propres factures (lecture seule).
drop policy if exists client_select_factures on public.factures;
create policy client_select_factures on public.factures
  as permissive for select to authenticated
  using (client_id in (select c.id from public.clients c where c.auth_user_id = (select auth.uid())));

-- ── A1bis. Inaltérabilité étendue aux nouvelles colonnes ────────────────────
-- Après émission, seuls le statut, le suivi de paiement, le PDF et les dates de
-- relance/paiement bougent. Tout le reste est figé.
create or replace function public.factures_inalterabilite()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if (TG_OP = 'DELETE') then
    if OLD.numero is not null then
      raise exception 'Facture % deja emise : suppression interdite (passer par un avoir).', OLD.numero;
    end if;
    return OLD;
  end if;

  if OLD.numero is not null then
    if NEW.numero             is distinct from OLD.numero
    or NEW.type               is distinct from OLD.type
    or NEW.type_facture       is distinct from OLD.type_facture
    or NEW.client_id          is distinct from OLD.client_id
    or NEW.reservation_id     is distinct from OLD.reservation_id
    or NEW.facture_origine_id is distinct from OLD.facture_origine_id
    or NEW.date_facture       is distinct from OLD.date_facture
    or NEW.date_echeance      is distinct from OLD.date_echeance
    or NEW.montant_total      is distinct from OLD.montant_total
    or NEW.montant_ht         is distinct from OLD.montant_ht
    or NEW.montant_tva        is distinct from OLD.montant_tva
    or NEW.montant_ttc        is distinct from OLD.montant_ttc
    or NEW.motif              is distinct from OLD.motif
    or NEW.reference_qr       is distinct from OLD.reference_qr
    or NEW.emise_par          is distinct from OLD.emise_par
    or NEW.emise_le           is distinct from OLD.emise_le
    or NEW.exercice           is distinct from OLD.exercice
    then
      raise exception 'Facture % deja emise : seuls le statut, le suivi de paiement et le PDF peuvent changer.', OLD.numero;
    end if;
  end if;
  return NEW;
end;
$function$;

-- ── A2. facture_lignes ──────────────────────────────────────────────────────
create table if not exists public.facture_lignes (
  id             uuid primary key default gen_random_uuid(),
  facture_id     uuid not null references public.factures(id) on delete cascade,
  ordre          int  not null default 0,
  libelle        text not null,
  quantite       numeric not null default 1,
  prix_unitaire  numeric not null default 0,
  montant        numeric not null default 0,
  taux_tva       numeric not null default 0,
  secteur_tdfn   numeric,
  compte_produit text not null default '3000' references public.comptes(numero),
  reservation_id uuid references public.reservations(id) on delete set null,
  abonnement_id  uuid references public.abonnements(id) on delete set null,
  cotisation_id  uuid references public.cotisations_membres(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists idx_facture_lignes_facture     on public.facture_lignes(facture_id);
create index if not exists idx_facture_lignes_reservation on public.facture_lignes(reservation_id);
create index if not exists idx_facture_lignes_abonnement  on public.facture_lignes(abonnement_id);
create index if not exists idx_facture_lignes_cotisation  on public.facture_lignes(cotisation_id);

-- montant = quantite × prix_unitaire, toujours (jamais saisi à la main).
create or replace function public.facture_lignes_montant()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  NEW.montant := round(coalesce(NEW.quantite, 0) * coalesce(NEW.prix_unitaire, 0), 2);
  return NEW;
end;
$function$;

drop trigger if exists trg_facture_lignes_montant on public.facture_lignes;
create trigger trg_facture_lignes_montant
  before insert or update on public.facture_lignes
  for each row execute function public.facture_lignes_montant();

-- Les lignes d'une facture émise sont figées (même règle que facture_reservations).
create or replace function public.facture_lignes_integrite()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_numero text;
begin
  select numero into v_numero from public.factures
   where id = case when TG_OP = 'DELETE' then OLD.facture_id else NEW.facture_id end;

  if v_numero is null then
    if TG_OP = 'DELETE' then return OLD; end if;
    return NEW;
  end if;

  if TG_OP = 'DELETE' then
    raise exception 'Ligne d''une facture emise (%) : suppression interdite.', v_numero;
  end if;
  raise exception 'Ligne d''une facture emise (%) : modification interdite.', v_numero;
end;
$function$;

drop trigger if exists trg_facture_lignes_integrite on public.facture_lignes;
create trigger trg_facture_lignes_integrite
  before update or delete on public.facture_lignes
  for each row execute function public.facture_lignes_integrite();

alter table public.facture_lignes enable row level security;
drop policy if exists admin_all_facture_lignes on public.facture_lignes;
create policy admin_all_facture_lignes on public.facture_lignes
  as permissive for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists client_select_facture_lignes on public.facture_lignes;
create policy client_select_facture_lignes on public.facture_lignes
  as permissive for select to authenticated
  using (facture_id in (
    select f.id from public.factures f
    join public.clients c on c.id = f.client_id
    where c.auth_user_id = (select auth.uid())));

-- ── A2bis. Plan comptable des produits ──────────────────────────────────────
insert into public.comptes (numero, libelle, type, actif) values
  ('3010', 'Frais et suppléments', 'produit', true),
  ('3020', 'Prestations annexes',  'produit', true)
on conflict (numero) do nothing;

update public.comptes set libelle = 'Séjours',    actif = true where numero = '3000';
update public.comptes set libelle = 'Garderie',   actif = true where numero = '3001';
update public.comptes set libelle = 'Adhésions',  actif = true where numero = '3005';
update public.comptes set libelle = 'Boutique',   actif = true where numero = '3200';
update public.comptes set libelle = 'Avoirs clients'         where numero = '2035';
update public.comptes set libelle = 'Débiteurs clients'      where numero = '1100';
update public.comptes set libelle = 'Acomptes clients'       where numero = '2030';

-- ── A3. Paramètres ──────────────────────────────────────────────────────────
insert into public.parametres (cle, valeur, description) values
  ('delai_paiement_jours', '30',   'Délai de paiement en jours (échéance = date de facture + n jours)'),
  ('frais_rappel_1',       '0',    'Frais du premier rappel (phase 3)'),
  ('frais_rappel_2',       '0',    'Frais du deuxième rappel (phase 3)'),
  ('arrondi_especes',      'true', 'Arrondir les encaissements en espèces aux 5 centimes')
on conflict (cle) do nothing;

-- ── A4. journal_evenements (append-only) ────────────────────────────────────
create table if not exists public.journal_evenements (
  id         uuid primary key default gen_random_uuid(),
  entite     text not null,
  entite_id  uuid not null,
  evenement  text not null,
  avant      jsonb,
  apres      jsonb,
  motif      text,
  user_id    uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_journal_evenements_entite on public.journal_evenements(entite, entite_id, created_at desc);

create or replace function public.journal_evenements_append_only()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  raise exception 'journal_evenements est en ajout seul : ni modification ni suppression.';
end;
$function$;

drop trigger if exists trg_journal_evenements_append_only on public.journal_evenements;
create trigger trg_journal_evenements_append_only
  before update or delete on public.journal_evenements
  for each row execute function public.journal_evenements_append_only();

alter table public.journal_evenements enable row level security;
drop policy if exists admin_all_journal_evenements on public.journal_evenements;
create policy admin_all_journal_evenements on public.journal_evenements
  as permissive for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── A5. Numérotation par exercice ───────────────────────────────────────────
-- Une séquence par (exercice, préfixe) : FAC pour les factures, AV pour les
-- avoirs. Le compteur n'avance que dans emettre_facture : plus de trou.
create table if not exists public.facture_numerotation (
  exercice int  not null,
  prefixe  text not null default 'FAC',
  prochain int  not null default 1,
  primary key (exercice, prefixe)
);

alter table public.facture_numerotation enable row level security;
drop policy if exists admin_all_facture_numerotation on public.facture_numerotation;
create policy admin_all_facture_numerotation on public.facture_numerotation
  as permissive for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Reprise : le compteur repart après le plus grand numéro déjà attribué.
insert into public.facture_numerotation (exercice, prefixe, prochain)
select extract(year from f.date_facture)::int,
       'FAC',
       max((regexp_replace(f.numero, '^FAC-\d{4}-', ''))::int) + 1
  from public.factures f
 where f.numero ~ '^FAC-\d{4}-\d+$'
 group by extract(year from f.date_facture)::int
on conflict (exercice, prefixe) do nothing;

-- ── A6. paiements_resa : rattachement à une facture ─────────────────────────
alter table public.paiements_resa
  add column if not exists facture_id uuid references public.factures(id),
  add column if not exists source     text not null default 'manuel';

-- Un paiement porte au moins une pièce : une réservation ou une facture.
alter table public.paiements_resa alter column reservation_id drop not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'paiements_resa_piece_check') then
    alter table public.paiements_resa add constraint paiements_resa_piece_check
      check (reservation_id is not null or facture_id is not null);
  end if;
end $$;

create index if not exists idx_paiements_resa_facture on public.paiements_resa(facture_id);

-- ── A7. Nouveau type de mouvement d'avoir ───────────────────────────────────
alter table public.avoirs_mouvements drop constraint if exists avoirs_mouvements_type_check;
alter table public.avoirs_mouvements add constraint avoirs_mouvements_type_check
  check (type in ('ajout_manuel', 'retrait_manuel', 'annulation_paiement', 'utilisation',
                  'trop_percu', 'reprise', 'mise_en_avoir', 'avoir_facture'));
