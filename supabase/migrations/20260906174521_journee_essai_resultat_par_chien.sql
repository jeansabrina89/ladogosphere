-- Journée d'essai : le résultat devient un statut PAR CHIEN, saisi au départ.
--
-- `chiens.statut_essai` existait déjà mais n'était utilisé nulle part. Il devient
-- la source de vérité, avec une valeur de plus : 'seconde_journee'.
--
-- Les colonnes historiques `journee_essai_effectuee` / `journee_essai_invalide`
-- restent alimentées — par trigger — pour ne rien casser ailleurs, mais elles ne
-- doivent plus être écrites par le code applicatif.
begin;

-- ---------------------------------------------------------------------------
-- 1. Statut étendu + traçabilité du résultat
-- ---------------------------------------------------------------------------
alter table public.chiens drop constraint if exists chiens_statut_essai_check;
alter table public.chiens
  add constraint chiens_statut_essai_check
  check (statut_essai in ('non_programme', 'programme', 'seconde_journee', 'valide', 'refuse'));

alter table public.chiens
  add column if not exists journee_essai_resultat_le  timestamptz,
  add column if not exists journee_essai_resultat_par uuid references public.profiles(id) on delete set null;

comment on column public.chiens.statut_essai is
  'Source de vérité de la journée d''essai : non_programme | programme | seconde_journee | valide | refuse.';
comment on column public.chiens.journee_essai_resultat_le is
  'Horodatage de la saisie du résultat (départ de la journée d''essai, ou correction admin).';
comment on column public.chiens.journee_essai_resultat_par is
  'Profil ayant saisi le résultat.';

-- ---------------------------------------------------------------------------
-- 2. Reprise des données existantes
--    effectuée + invalide → refuse ; effectuée seule → valide (les chiens déjà
--    passés sont réputés validés, c'est voulu) ; sinon non_programme.
-- ---------------------------------------------------------------------------
update public.chiens
set statut_essai = case
      when journee_essai_effectuee and journee_essai_invalide then 'refuse'
      when journee_essai_effectuee                            then 'valide'
      else 'non_programme'
    end;

-- ---------------------------------------------------------------------------
-- 3. Colonnes historiques dérivées du statut (miroir de flagsHistoriques()
--    dans src/lib/journeeEssai.ts).
-- ---------------------------------------------------------------------------
create or replace function public.chiens_synchroniser_flags_essai()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.statut_essai is null then
    new.statut_essai := 'non_programme';
  end if;
  new.journee_essai_effectuee := new.statut_essai in ('valide', 'refuse', 'seconde_journee');
  new.journee_essai_invalide  := new.statut_essai = 'refuse';
  return new;
end;
$fn$;

drop trigger if exists trg_chiens_flags_essai on public.chiens;
create trigger trg_chiens_flags_essai
before insert or update on public.chiens
for each row
execute function public.chiens_synchroniser_flags_essai();

-- Réaligner les lignes existantes en faisant passer le trigger.
update public.chiens set statut_essai = statut_essai;

-- ---------------------------------------------------------------------------
-- 4. Passage outre côté personnel, journalisé dans la réservation
-- ---------------------------------------------------------------------------
alter table public.reservations
  add column if not exists essai_force        boolean not null default false,
  add column if not exists essai_force_raison text;

comment on column public.reservations.essai_force is
  'Le personnel a passé outre la règle de la journée d''essai pour cette réservation.';
comment on column public.reservations.essai_force_raison is
  'Raison saisie lors du passage outre.';

commit;
