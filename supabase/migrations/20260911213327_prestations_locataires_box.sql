-- Prestations aux locataires de box.
--
-- Un locataire de box n'est PAS un client de la pension. Il loue un box à la
-- propriétaire, son chien y vit, et la Sàrl lui vend des services autour :
-- passages, repas, nettoyages, balades — et, quand il part en vacances, la
-- garde complète de son chien dans son propre box.
--
-- Rien de tout cela n'est une réservation : aucun box de la pension n'est
-- occupé, aucun tarif d'hébergement ne s'applique, et ces chiens n'entrent
-- dans aucun taux d'occupation de la pension. C'est la raison d'être de ces
-- tables : le modèle des réservations ne sait pas dire cela, et le tordre pour
-- qu'il le dise aurait fait mentir tous les chiffres qui le lisent.
--
-- Trois décisions volontairement NON figées dans le code, parce que Sabrina ne
-- les a pas encore prises, vivent dans `parametres` : forfait payé d'avance ou
-- à terme échu, absences déduites ou non, commande ponctuelle ouverte ou non
-- au locataire.
--
-- Aucun prix n'est inventé ici. Tout part à zéro, à saisir : un prix deviné
-- finit toujours par se retrouver sur une vraie facture.

begin;

-- ── 1. Le locataire de box ────────────────────────────────────────────────
--
-- C'est ce drapeau, et lui seul, qui ouvre le catalogue. Un client de la
-- pension ne voit rien de tout ceci — ni l'entrée de menu, ni les tarifs, ni
-- les prestations dans le corps d'une réponse.

alter table public.clients
  add column if not exists locataire_box boolean not null default false,
  add column if not exists box_loue text,
  add column if not exists loyer_refacture numeric,
  add column if not exists locataire_depuis date,
  add column if not exists locataire_jusqu_au date;

comment on column public.clients.locataire_box is
  'Loue un box à la propriétaire. Ouvre le catalogue des prestations ; n''implique aucune adhésion.';
comment on column public.clients.box_loue is
  'Le box loué, en clair. Ce n''est pas un box de la pension : il n''entre dans aucun taux d''occupation.';
comment on column public.clients.loyer_refacture is
  'Montant mensuel du loyer que la Sàrl paie à la propriétaire puis refacture. Saisi, jamais calculé depuis la dépense : les deux peuvent différer.';
comment on column public.clients.locataire_jusqu_au is
  'Fin de la location. Le loyer refacturé s''arrête à cette date, au prorata des jours réels du mois.';

create index if not exists idx_clients_locataire_box
  on public.clients (locataire_box) where locataire_box;

-- ── 2. Le catalogue des prestations ───────────────────────────────────────
--
-- Ce sont des SERVICES, pas des articles : ils ne touchent ni au stock ni au
-- compte 3200. Leur produit est 3020 Prestations annexes, qui existe déjà.

create table if not exists public.prestations (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  description text,
  unite text not null default 'passage'
    check (unite in ('passage','repas','nettoyage','balade','journee','autre')),
  prix numeric not null default 0,
  duree_minutes integer,
  -- Le taux est porté par la prestation, à 8,1 % par défaut. Un zéro sans
  -- motif ne peut pas sortir d'ici : mentionner une exonération qu'on ne sait
  -- pas justifier est une faute qu'on ne découvre qu'au contrôle.
  taux_tva numeric not null default 8.1,
  motif_tva text,
  actif boolean not null default true,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  constraint prestations_zero_exige_motif
    check (taux_tva > 0 or nullif(btrim(coalesce(motif_tva, '')), '') is not null)
);

comment on table public.prestations is
  'Catalogue des services vendus aux locataires de box. Produit 3020. Rien à voir avec la boutique.';
comment on column public.prestations.unite is
  'La nature du geste. « journee » est la garde complète : le chien reste dans SON box et la pension en répond 24 h.';

-- ── 3. Les formules, composées par Sabrina ────────────────────────────────
--
-- AUCUNE formule n'est écrite en dur dans le code. L'écran Formules permet de
-- les créer, renommer, dupliquer, réordonner et désactiver. Le total indicatif
-- des prestations incluses s'affiche à côté du prix du forfait : c'est une aide
-- à la décision, pas un calcul imposé.

create table if not exists public.formules (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  description text,
  prix_mensuel numeric not null default 0,
  actif boolean not null default true,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.formules is
  'Forfaits mensuels. Une formule utilisée par un abonnement en cours ne se supprime pas : elle se désactive.';

create table if not exists public.formules_lignes (
  id uuid primary key default gen_random_uuid(),
  formule_id uuid not null references public.formules(id) on delete cascade,
  prestation_id uuid not null references public.prestations(id) on delete restrict,
  quantite_par_semaine numeric not null default 1 check (quantite_par_semaine > 0),
  -- null vaut « tous les jours ». Une liste dit « le lundi et le jeudi ».
  jours text[],
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  constraint formules_lignes_jours_connus check (
    jours is null or jours <@ array['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']::text[]
  )
);

create index if not exists idx_formules_lignes_formule on public.formules_lignes (formule_id);
create index if not exists idx_formules_lignes_prestation on public.formules_lignes (prestation_id);

-- ── 4. L'abonnement d'un locataire ────────────────────────────────────────
--
-- Le prix est FIGÉ à la souscription : modifier une formule ne change aucun
-- abonnement en cours. Les reprendre est une action explicite et séparée.
--
-- `jours_personnalises` est ce qui permet de jongler semaine par semaine sans
-- changer d'abonnement : il se superpose à la formule, il ne la remplace pas.

create table if not exists public.abonnements_prestations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  formule_id uuid not null references public.formules(id) on delete restrict,
  date_debut date not null,
  date_fin date,
  jours_personnalises jsonb,
  statut text not null default 'actif' check (statut in ('actif','suspendu','termine')),
  prix_mensuel_fige numeric not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

comment on column public.abonnements_prestations.prix_mensuel_fige is
  'Prix du forfait au jour de la souscription. Une formule qui change ne le touche pas.';
comment on column public.abonnements_prestations.jours_personnalises is
  'Ajustements semaine par semaine, par semaine ISO : { "2026-W38": { "<prestation_id>": ["lundi","jeudi"] } }. Se superpose à la formule.';

create index if not exists idx_abo_prestations_client on public.abonnements_prestations (client_id);
create index if not exists idx_abo_prestations_formule on public.abonnements_prestations (formule_id);
create index if not exists idx_abo_prestations_actif
  on public.abonnements_prestations (statut) where statut = 'actif';

-- ── 5. Les tâches : le cœur opérationnel ──────────────────────────────────
--
-- Une tâche issue d'un forfait n'est pas facturée séparément (facturable
-- false) ; une tâche à l'acte l'est. Une tâche annulée avec motif sort du
-- décompte, et son motif peut figurer en note sur la facture.

create table if not exists public.taches_prestations (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  heure_prevue time,
  client_id uuid not null references public.clients(id) on delete cascade,
  chien_id uuid references public.chiens(id) on delete set null,
  box text,
  prestation_id uuid not null references public.prestations(id) on delete restrict,
  origine text not null default 'ponctuelle'
    check (origine in ('forfait','a_la_carte','ponctuelle')),
  abonnement_id uuid references public.abonnements_prestations(id) on delete cascade,
  -- Le rang distingue deux passages du même jour pour la même prestation.
  rang integer not null default 1,
  statut text not null default 'a_faire' check (statut in ('a_faire','faite','annulee')),
  fait_par uuid references public.profiles(id),
  fait_le timestamptz,
  commentaire text,
  motif_annulation text,
  facturable boolean not null default true,
  prix_fige numeric not null default 0,
  taux_tva numeric not null default 8.1,
  motif_tva text,
  -- La garde complète pendant l'absence du locataire : le chien reste dans SON
  -- box, aucun box de pension n'est occupé, et pourtant la pension en répond
  -- 24 h. C'est le SEUL cas de ce genre, et il se voit d'un coup d'œil.
  garde boolean not null default false,
  -- Les jours d'une même garde partagent ce groupe : l'annuler les libère tous.
  groupe_id uuid,
  facture_id uuid references public.factures(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  constraint taches_annulee_exige_motif check (
    statut <> 'annulee' or nullif(btrim(coalesce(motif_annulation, '')), '') is not null
  ),
  constraint taches_faite_exige_horodatage check (
    statut <> 'faite' or fait_le is not null
  )
);

comment on table public.taches_prestations is
  'Ce qu''il y a à faire chez les locataires, jour par jour. Aucune n''occupe un box de la pension.';
comment on column public.taches_prestations.garde is
  'Journée de garde complète pendant l''absence du locataire. Le chien est dans SON box : compté nulle part dans l''occupation de la pension, mais bien présent au planning et aux tâches.';

-- La régénération est idempotente : relancer ne duplique rien. C'est cette
-- contrainte qui le garantit, et non la prudence du code appelant.
create unique index if not exists uniq_tache_forfait
  on public.taches_prestations (abonnement_id, date, prestation_id, rang)
  where abonnement_id is not null;

create index if not exists idx_taches_date on public.taches_prestations (date);
create index if not exists idx_taches_client_date on public.taches_prestations (client_id, date);
create index if not exists idx_taches_statut_date on public.taches_prestations (statut, date);
create index if not exists idx_taches_groupe on public.taches_prestations (groupe_id) where groupe_id is not null;
create index if not exists idx_taches_a_facturer
  on public.taches_prestations (client_id, date)
  where facturable and statut = 'faite' and facture_id is null;

-- ── 6. La permission ──────────────────────────────────────────────────────
--
-- Qui l'a voit et coche les tâches. En créer ou en facturer exige EN PLUS la
-- permission des encaissements : cocher « fait » est un geste de terrain,
-- décider ce qui part sur une facture ne l'est pas.

alter table public.profiles
  add column if not exists perm_prestations boolean not null default false;

-- ── 7. Le loyer refacturé, sur son propre compte ──────────────────────────
--
-- 3021 est DISTINCT de 3020 : un loyer qui transite n'est pas un service
-- rendu, et les fondre empêcherait de lire l'un sans l'autre.

insert into public.comptes (numero, libelle, type, actif)
values ('3021', 'Loyers de box refacturés', 'produit', true)
on conflict (numero) do nothing;

-- La catégorie de TVA « Loyer de box refacturé » rejoint la liste FERMÉE des
-- prestations : un taux ne se tape jamais, il se choisit parmi des codes connus,
-- et c'est cette contrainte qui le garantit.
alter table public.taux_prestation drop constraint if exists taux_prestation_code_check;
alter table public.taux_prestation add constraint taux_prestation_code_check
  check (code in (
    'sejour','essai','adhesion','abonnement','prestation_annexe',
    'frais_annulation','loyer_box_refacture'
  ));

-- Le taux de cette ligne est à confirmer auprès de l'AFC (art. 21 LTVA).
-- 8,1 % par défaut, modifiable comme les autres catégories, le 0 % et son
-- motif disponibles : on ne tranche pas ici une question fiscale ouverte.
insert into public.taux_prestation (code, date_debut, taux, motif_exonere)
values ('loyer_box_refacture', '2024-01-01', 8.1, null)
on conflict (code, date_debut) do nothing;

-- ── 8. Les trois réglages que Sabrina n'a pas encore tranchés ─────────────

insert into public.parametres (cle, valeur, description) values
  ('prestations_forfait_echeance', 'terme_echu',
   'Forfait payé « avance » ou « terme_echu ». Défaut : à terme échu.'),
  ('prestations_absence_deduite', 'non',
   'Les jours d''absence du locataire sont-ils déduits du forfait ? « oui » ou « non ». Défaut : non.'),
  ('prestations_commande_locataire', 'oui',
   'Le locataire peut-il commander une prestation ponctuelle lui-même ? « oui » ou « non ». Défaut : oui.')
on conflict (cle) do nothing;

-- ── 9. RLS ────────────────────────────────────────────────────────────────
--
-- Le catalogue ne part PAS dans la réponse d'un client de la pension : la
-- vérification est ici, en base, et à nouveau dans les chargeurs d'écran. Un
-- filtre d'affichage seul laisserait les tarifs dans le corps HTTP.

alter table public.prestations enable row level security;
alter table public.formules enable row level security;
alter table public.formules_lignes enable row level security;
alter table public.abonnements_prestations enable row level security;
alter table public.taches_prestations enable row level security;

drop policy if exists admin_all_prestations on public.prestations;
create policy admin_all_prestations on public.prestations
  for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists personnel_select_prestations on public.prestations;
create policy personnel_select_prestations on public.prestations
  for select to authenticated using (is_personnel());
drop policy if exists locataire_select_prestations on public.prestations;
create policy locataire_select_prestations on public.prestations
  for select to authenticated using (
    actif and exists (
      select 1 from public.clients c
      where c.auth_user_id = (select auth.uid()) and c.locataire_box
    )
  );

drop policy if exists admin_all_formules on public.formules;
create policy admin_all_formules on public.formules
  for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists personnel_select_formules on public.formules;
create policy personnel_select_formules on public.formules
  for select to authenticated using (is_personnel());
drop policy if exists locataire_select_formules on public.formules;
create policy locataire_select_formules on public.formules
  for select to authenticated using (
    actif and exists (
      select 1 from public.clients c
      where c.auth_user_id = (select auth.uid()) and c.locataire_box
    )
  );

drop policy if exists admin_all_formules_lignes on public.formules_lignes;
create policy admin_all_formules_lignes on public.formules_lignes
  for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists personnel_select_formules_lignes on public.formules_lignes;
create policy personnel_select_formules_lignes on public.formules_lignes
  for select to authenticated using (is_personnel());
drop policy if exists locataire_select_formules_lignes on public.formules_lignes;
create policy locataire_select_formules_lignes on public.formules_lignes
  for select to authenticated using (
    exists (
      select 1 from public.clients c
      where c.auth_user_id = (select auth.uid()) and c.locataire_box
    )
  );

drop policy if exists admin_all_abo_prestations on public.abonnements_prestations;
create policy admin_all_abo_prestations on public.abonnements_prestations
  for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists personnel_select_abo_prestations on public.abonnements_prestations;
create policy personnel_select_abo_prestations on public.abonnements_prestations
  for select to authenticated using (is_personnel());
drop policy if exists locataire_select_abo_prestations on public.abonnements_prestations;
create policy locataire_select_abo_prestations on public.abonnements_prestations
  for select to authenticated using (
    client_id in (select c.id from public.clients c where c.auth_user_id = (select auth.uid()))
  );

drop policy if exists admin_all_taches_prestations on public.taches_prestations;
create policy admin_all_taches_prestations on public.taches_prestations
  for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists personnel_select_taches_prestations on public.taches_prestations;
create policy personnel_select_taches_prestations on public.taches_prestations
  for select to authenticated using (is_personnel());
drop policy if exists locataire_select_taches_prestations on public.taches_prestations;
create policy locataire_select_taches_prestations on public.taches_prestations
  for select to authenticated using (
    client_id in (select c.id from public.clients c where c.auth_user_id = (select auth.uid()))
  );

commit;