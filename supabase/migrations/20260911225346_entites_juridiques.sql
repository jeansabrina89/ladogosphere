-- L'identité juridique, datée.
--
-- Raison sociale, forme, IDE, numéro de TVA et IBAN ne sont pas des réglages :
-- ce sont des FAITS À UNE DATE. Une facture de novembre porte l'identité de
-- novembre, et un avoir émis en février porte celle de février — même s'il
-- corrige cette facture de novembre. C'est le cas normal d'un avoir après un
-- changement d'entité, et la pièce doit pouvoir le dire.
--
-- Le mécanisme est celui de `parametres_tva`, repris tel quel : une ligne par
-- période, et la ligne EN VIGUEUR à une date est la plus récente dont la date
-- de début est déjà passée. On n'invente pas un second mécanisme pour la même
-- idée ; un lecteur qui connaît l'un connaît l'autre.
--
-- S'y ajoute ce que `parametres_tva` n'a pas : une date de fin et une
-- contrainte d'EXCLUSION qui interdit à deux entités de se chevaucher. Une
-- pièce qui ne saurait pas sous quelle raison sociale elle est émise n'est pas
-- une pièce.
--
-- Ce que cette migration NE fait PAS : le passage d'une entité à l'autre —
-- clôture de l'ancienne, bilan d'ouverture de la nouvelle, transfert des
-- débiteurs, des stocks, des adhésions et des abonnements encaissés d'avance.
-- C'est le sujet d'APP 19. Ici, seuls les DOCUMENTS changent d'identité à la
-- bonne date.

begin;

create table if not exists public.entites_juridiques (
  id uuid primary key default gen_random_uuid(),
  -- Le premier jour où cette identité s'applique. Unique : deux identités ne
  -- peuvent pas commencer le même jour.
  date_debut date not null unique,
  -- Le dernier jour est la VEILLE de date_fin : la plage est [debut, fin).
  date_fin date,
  forme text not null check (forme in ('raison_individuelle','sarl')),
  raison_sociale text not null,
  adresse_rue text,
  adresse_numero text,
  adresse_npa text,
  adresse_ville text,
  adresse_pays text not null default 'CH',
  -- Le numéro d'identification des entreprises, dans sa seule forme légale.
  ide text,
  numero_tva text,
  iban text,
  -- Le QR-IBAN, distinct de l'IBAN : seul lui accepte une référence QR.
  qr_iban text,
  email text,
  telephone text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint entites_dates_coherentes
    check (date_fin is null or date_fin > date_debut),
  -- Un IDE se choisit dans sa forme légale ou pas du tout. Un numéro approché
  -- sur une facture est pire qu'un numéro absent : il a l'air juste.
  constraint entites_ide_format
    check (ide is null or ide ~ '^CHE-[0-9]{3}\.[0-9]{3}\.[0-9]{3}$'),
  -- UNE SEULE entité active à une date donnée. C'est cette contrainte, et non
  -- la prudence du code, qui garantit qu'une pièce sait qui l'émet.
  constraint entites_periodes_sans_chevauchement
    exclude using gist (daterange(date_debut, date_fin, '[)') with &&)
);

comment on table public.entites_juridiques is
  'L''identité juridique en vigueur à chaque date. Source unique de la raison sociale, de l''IDE, du numéro de TVA et de l''IBAN pour toute pièce émise.';
comment on column public.entites_juridiques.date_fin is
  'Exclue de la plage : l''identité s''applique jusqu''à la veille. Null tant qu''aucun changement n''est préparé.';
comment on column public.entites_juridiques.forme is
  'raison_individuelle ou sarl. En raison individuelle, la raison sociale doit contenir le nom de famille de la propriétaire (droit des raisons de commerce).';

create index if not exists idx_entites_date_debut
  on public.entites_juridiques (date_debut desc);

-- ── La reprise ────────────────────────────────────────────────────────────
--
-- Une seule ligne, faite des paramètres tels qu'ils sont saisis AUJOURD'HUI.
-- Rien n'est deviné : une valeur vide reste nulle, et l'écran le dira. Un IDE
-- inventé finirait sur une vraie facture, et personne ne saurait d'où il vient.
--
-- La date de début est le premier jour du plus ancien exercice : avant elle,
-- il n'y a pas de pièce à identifier.

insert into public.entites_juridiques (
  date_debut, forme, raison_sociale,
  adresse_rue, adresse_numero, adresse_npa, adresse_ville, adresse_pays,
  ide, numero_tva, iban, qr_iban, email, telephone
)
select
  coalesce(
    (select make_date(min(annee), 1, 1) from public.exercices),
    date_trunc('year', current_date)::date
  ),
  'sarl',
  coalesce(nullif(btrim(p.titulaire), ''), 'La Dogosphère'),
  nullif(btrim(p.adresse_rue), ''),
  nullif(btrim(p.adresse_numero), ''),
  nullif(btrim(p.adresse_npa), ''),
  nullif(btrim(p.adresse_ville), ''),
  coalesce(nullif(btrim(p.adresse_pays), ''), 'CH'),
  -- L'IDE n'est repris que s'il a déjà la forme légale ; sinon null, et l'écran
  -- des Réglages le réclamera.
  (select case when nullif(btrim(p.ide), '') ~ '^CHE-[0-9]{3}\.[0-9]{3}\.[0-9]{3}$'
               then btrim(p.ide) end),
  nullif(btrim(p.tva_numero), ''),
  nullif(btrim(p.iban), ''),
  -- Aucun QR-IBAN n'est saisi nulle part aujourd'hui : il reste null.
  null,
  nullif(btrim(p.email_entreprise), ''),
  nullif(btrim(p.telephone_entreprise), '')
from (
  select
    max(valeur) filter (where cle = 'titulaire')            as titulaire,
    max(valeur) filter (where cle = 'adresse_rue')          as adresse_rue,
    max(valeur) filter (where cle = 'adresse_numero')       as adresse_numero,
    max(valeur) filter (where cle = 'adresse_npa')          as adresse_npa,
    max(valeur) filter (where cle = 'adresse_ville')        as adresse_ville,
    max(valeur) filter (where cle = 'adresse_pays')         as adresse_pays,
    max(valeur) filter (where cle = 'ide')                  as ide,
    max(valeur) filter (where cle = 'tva_numero')           as tva_numero,
    max(valeur) filter (where cle = 'iban')                 as iban,
    max(valeur) filter (where cle = 'email_entreprise')     as email_entreprise,
    max(valeur) filter (where cle = 'telephone_entreprise') as telephone_entreprise
  from public.parametres
) p
where not exists (select 1 from public.entites_juridiques);

-- ── Le compte privé ───────────────────────────────────────────────────────
--
-- En raison individuelle, la propriétaire ne se verse pas de salaire : ses
-- retraits et ses apports passent par un compte privé. Il est créé ici pour
-- exister le jour où il servira, et n'est utilisé NULLE PART automatiquement.

insert into public.comptes (numero, libelle, type, actif)
values ('2850', 'Compte privé', 'passif', true)
on conflict (numero) do nothing;

-- ── RLS ───────────────────────────────────────────────────────────────────
--
-- L'identité de l'entreprise figure sur chaque facture : tout le personnel la
-- lit. Seule l'administratrice la change.

alter table public.entites_juridiques enable row level security;

drop policy if exists admin_all_entites_juridiques on public.entites_juridiques;
create policy admin_all_entites_juridiques on public.entites_juridiques
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists personnel_select_entites_juridiques on public.entites_juridiques;
create policy personnel_select_entites_juridiques on public.entites_juridiques
  for select to authenticated using (is_personnel());

commit;