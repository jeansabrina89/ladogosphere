-- Les paramètres de TVA, historisés par date de début.
-- Une seule ligne est ACTIVE : la plus récente dont date_debut est passée.
-- On ne modifie pas l'ancienne quand le régime change, on en ajoute une —
-- sinon un décompte d'il y a deux ans se relirait avec les taux d'aujourd'hui.
create table if not exists public.parametres_tva (
  id uuid primary key default gen_random_uuid(),
  date_debut date not null unique,
  assujettie boolean not null default false,
  date_assujettissement date,
  numero_tva text,
  methode text not null default 'tdfn',
  periodicite text not null default 'semestrielle',
  -- Les taux de dette fiscale nette sont SAISIS, jamais devinés : zéro veut
  -- dire « pas encore renseigné », et le décompte refusera de calculer.
  taux_tdfn_1 numeric not null default 0,
  libelle_secteur_1 text not null default '',
  taux_tdfn_2 numeric,
  libelle_secteur_2 text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint parametres_tva_methode_check check (methode in ('tdfn','effective')),
  constraint parametres_tva_periodicite_check check (periodicite in ('semestrielle','trimestrielle')),
  -- Le format de l'AFC, et rien d'autre. Null tant qu'il n'est pas connu.
  constraint parametres_tva_numero_check check (
    numero_tva is null or numero_tva ~ '^CHE-\d{3}\.\d{3}\.\d{3} TVA$'
  ),
  constraint parametres_tva_taux1_check check (taux_tdfn_1 >= 0 and taux_tdfn_1 <= 100),
  constraint parametres_tva_taux2_check check (
    taux_tdfn_2 is null or (taux_tdfn_2 >= 0 and taux_tdfn_2 <= 100)
  ),
  -- Assujettie sans date d'assujettissement n'a pas de sens : on ne saurait
  -- pas à partir de quelle pièce la TVA s'applique.
  constraint parametres_tva_date_check check (
    assujettie = false or date_assujettissement is not null
  )
);

comment on table public.parametres_tva is
  'Régime TVA de la Sàrl, historisé. Les taux de dette fiscale nette sont saisis d''après la décision de l''AFC, jamais calculés.';

-- Les taux LÉGAUX de référence, avec leur période de validité : les taux
-- changent (7,7 % → 8,1 % au 1.1.2024), et une pièce ancienne doit rester
-- lisible avec le taux de son époque.
create table if not exists public.taux_tva (
  code text not null,
  taux numeric not null,
  libelle text not null,
  date_debut date not null,
  date_fin date,
  primary key (code, date_debut),
  constraint taux_tva_taux_check check (taux >= 0 and taux <= 100),
  constraint taux_tva_periode_check check (date_fin is null or date_fin > date_debut)
);

comment on table public.taux_tva is
  'Taux légaux de TVA suisses avec leur validité. Table de référence : ce qui est facturé est figé sur la ligne de la pièce.';

insert into public.taux_tva (code, taux, libelle, date_debut, date_fin) values
  ('normal', 7.7, 'Taux normal',  '2018-01-01', '2023-12-31'),
  ('reduit', 2.5, 'Taux réduit',  '2018-01-01', '2023-12-31'),
  ('normal', 8.1, 'Taux normal',  '2024-01-01', null),
  ('reduit', 2.6, 'Taux réduit',  '2024-01-01', null),
  ('exclu',  0.0, 'Hors champ ou exclu', '2018-01-01', null)
on conflict (code, date_debut) do nothing;

-- Reprise de ce qui existait dans la table clé/valeur, sans rien perdre.
insert into public.parametres_tva (
  date_debut, assujettie, date_assujettissement, numero_tva, methode, periodicite
)
select
  '2024-01-01'::date,
  coalesce((select valeur from public.parametres where cle = 'tva_assujettie'), 'false') = 'true',
  nullif(trim(coalesce((select valeur from public.parametres where cle = 'tva_date_debut'), '')), '')::date,
  nullif(trim(coalesce((select valeur from public.parametres where cle = 'tva_numero'), '')), ''),
  'tdfn',
  'semestrielle'
where not exists (select 1 from public.parametres_tva);

alter table public.parametres_tva enable row level security;
alter table public.taux_tva enable row level security;

-- Le régime TVA ne se lit et ne se change que par l'administratrice ; le
-- service role passe outre pour les documents.
drop policy if exists parametres_tva_admin on public.parametres_tva;
create policy parametres_tva_admin on public.parametres_tva
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Les taux légaux n'ont rien de confidentiel : tout le personnel les lit.
drop policy if exists taux_tva_lecture on public.taux_tva;
create policy taux_tva_lecture on public.taux_tva
  for select to authenticated using (true);

drop policy if exists taux_tva_admin on public.taux_tva;
create policy taux_tva_admin on public.taux_tva
  for all to authenticated using (public.is_admin()) with check (public.is_admin());