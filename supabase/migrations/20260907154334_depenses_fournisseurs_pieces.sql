-- ═══════════════════════════════════════════════════════════════════════════
-- Dépenses, fournisseurs et pièces justificatives.
--
-- Le moteur d'écritures n'est pas contourné : la validation d'une dépense
-- passe par passer_ecriture, et la numérotation réutilise la séquence par
-- exercice des factures (préfixe DEP).
-- TVA : les colonnes existent, elles restent nulles (phase ultérieure).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Comptes de charge manquants ────────────────────────────────────────────
insert into public.comptes (numero, libelle, type, actif) values
  ('4400', 'Alimentation des pensionnaires', 'charge', true),
  ('4410', 'Vétérinaire et soins',           'charge', true),
  ('6100', 'Petit matériel et nettoyage',    'charge', true),
  ('6200', 'Frais de véhicule',              'charge', true),
  ('6510', 'Téléphone et internet',          'charge', true)
on conflict (numero) do nothing;

-- ── Permission dédiée ──────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists perm_depenses boolean not null default false;

comment on column public.profiles.perm_depenses is
  'Saisir, valider et payer des dépenses. Accordée explicitement, jamais par défaut.';

create or replace function public.peut_depenses()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and actif is not false
      and (role = 'admin' or (role = 'employe' and perm_depenses))
  );
$$;

-- ── Fournisseurs ───────────────────────────────────────────────────────────
create table if not exists public.fournisseurs (
  id                    uuid primary key default gen_random_uuid(),
  nom                   text not null,
  adresse               text,
  npa                   text,
  localite              text,
  email                 text,
  telephone             text,
  iban                  text,
  compte_charge_defaut  text references public.comptes(numero),
  actif                 boolean not null default true,
  notes                 text,
  created_at            timestamptz not null default now()
);

create index if not exists idx_fournisseurs_nom on public.fournisseurs (lower(nom));

alter table public.fournisseurs enable row level security;

drop policy if exists depenses_all_fournisseurs on public.fournisseurs;
create policy depenses_all_fournisseurs on public.fournisseurs
  for all using (public.peut_depenses()) with check (public.peut_depenses());

-- ── Dépenses ───────────────────────────────────────────────────────────────
create table if not exists public.depenses (
  id             uuid primary key default gen_random_uuid(),
  numero         text unique,
  date_depense   date not null,
  fournisseur_id uuid references public.fournisseurs(id),
  libelle        text not null,
  montant        numeric(12,2) not null check (montant > 0),
  compte_charge  text not null references public.comptes(numero),
  mode_paiement  text not null check (mode_paiement in ('banque','caisse','carte','twint','a_payer')),
  date_paiement  date,
  statut         text not null default 'brouillon'
                 check (statut in ('brouillon','validee','payee','annulee')),
  exercice       int,
  -- Réservés à la phase TVA : renseignés nulle part pour l'instant.
  montant_ht     numeric(12,2),
  montant_tva    numeric(12,2),
  taux_tva       numeric(5,2),
  ecriture_id    uuid references public.ecritures(id),
  ecriture_paiement_id uuid references public.ecritures(id),
  motif_annulation text,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);

create index if not exists idx_depenses_date     on public.depenses (date_depense desc);
create index if not exists idx_depenses_statut   on public.depenses (statut);
create index if not exists idx_depenses_fourn    on public.depenses (fournisseur_id);
create index if not exists idx_depenses_exercice on public.depenses (exercice);

alter table public.depenses enable row level security;

drop policy if exists depenses_all on public.depenses;
create policy depenses_all on public.depenses
  for all using (public.peut_depenses()) with check (public.peut_depenses());

-- Inaltérabilité, sur le modèle des factures : une dépense validée ne se
-- modifie plus. Seuls le règlement (statut, date et mode de paiement) et
-- l'annulation par contre-écriture peuvent encore bouger.
create or replace function public.depenses_inalterabilite()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if (TG_OP = 'DELETE') then
    if OLD.numero is not null then
      raise exception 'Dépense % déjà validée : suppression interdite (passer par une annulation).', OLD.numero;
    end if;
    return OLD;
  end if;

  if OLD.numero is not null then
    if NEW.numero        is distinct from OLD.numero
    or NEW.date_depense  is distinct from OLD.date_depense
    or NEW.fournisseur_id is distinct from OLD.fournisseur_id
    or NEW.libelle       is distinct from OLD.libelle
    or NEW.montant       is distinct from OLD.montant
    or NEW.compte_charge is distinct from OLD.compte_charge
    or NEW.exercice      is distinct from OLD.exercice
    or NEW.ecriture_id   is distinct from OLD.ecriture_id
    or NEW.created_by    is distinct from OLD.created_by
    then
      raise exception 'Dépense % déjà validée : seuls le règlement et l''annulation peuvent changer.', OLD.numero;
    end if;
  end if;
  return NEW;
end;
$function$;

drop trigger if exists trg_depenses_inalterabilite on public.depenses;
create trigger trg_depenses_inalterabilite
  before update or delete on public.depenses
  for each row execute function public.depenses_inalterabilite();

-- ── Pièces justificatives ──────────────────────────────────────────────────
create table if not exists public.pieces (
  id           uuid primary key default gen_random_uuid(),
  entite       text not null check (entite in ('depense','facture','paiement')),
  entite_id    uuid not null,
  nom_fichier  text not null,
  mime         text not null,
  taille       int  not null,
  storage_path text not null,
  sha256       text,
  uploaded_by  uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

create index if not exists idx_pieces_entite on public.pieces (entite, entite_id);

alter table public.pieces enable row level security;

-- Les pièces d'une dépense suivent la permission dépenses ; celles d'une
-- facture ou d'un paiement suivent l'encaissement. L'admin voit tout.
create or replace function public.peut_encaissements()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and actif is not false
      and (role = 'admin' or (role = 'employe' and perm_encaissements))
  );
$$;

drop policy if exists pieces_personnel on public.pieces;
create policy pieces_personnel on public.pieces
  for all
  using (
    case when entite = 'depense' then public.peut_depenses()
         else public.peut_encaissements() end
  )
  with check (
    case when entite = 'depense' then public.peut_depenses()
         else public.peut_encaissements() end
  );

-- ── Bucket privé des justificatifs ─────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('justificatifs', 'justificatifs', false, 10485760,
        array['image/jpeg','image/png','image/heic','image/heif','application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;