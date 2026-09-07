-- Schéma de référence de la base La Dogosphère (schéma public, sans données).
-- Généré par : npm run backup:schema (scripts/sauvegarde-schema.mjs).
-- Ce fichier reproduit la structure complète ; les migrations de supabase/migrations/
-- postérieures à sa génération le complètent.

create extension if not exists "pgcrypto" with schema extensions;

-- ── Tables ──────────────────────────────────────────────────────────────

create table if not exists public.abonnements (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  numero integer not null,
  tarif_unitaire numeric not null,
  jours_total integer default 11 not null,
  jours_offerts integer default 1 not null,
  prix_paye numeric not null,
  mode_paiement text,
  statut text default 'en_attente_paiement'::text not null,
  date_commande date default CURRENT_DATE not null,
  date_paiement date,
  date_expiration date,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  compta_synchronisee boolean default true not null,
  compta_erreur text,
  compta_sync_at timestamp with time zone,
  categorie text
);

create table if not exists public.abonnements_mouvements (
  id uuid default gen_random_uuid() not null,
  abonnement_id uuid not null,
  client_id uuid not null,
  delta integer not null,
  type text not null,
  reservation_id uuid,
  motif text,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.avoirs_mouvements (
  id uuid default gen_random_uuid() not null,
  client_id uuid not null,
  montant numeric(10,2) not null,
  type text not null,
  motif text,
  reservation_id uuid,
  facture_id uuid,
  created_by uuid,
  created_at timestamp with time zone default now()
);

create table if not exists public.box_indisponibilites (
  id uuid default gen_random_uuid() not null,
  box_id uuid not null,
  date_debut date not null,
  date_fin date not null,
  motif text,
  created_at timestamp with time zone default now()
);

create table if not exists public.boxes (
  id uuid default gen_random_uuid() not null,
  numero integer not null,
  actif boolean default true,
  created_at timestamp with time zone default now(),
  capacite_standard integer default 2,
  capacite_petits_chiens integer default 4,
  notes text,
  nom text,
  interne boolean default false not null,
  proprietaire_client_id uuid
);

create table if not exists public.calendrier_essais (
  id uuid default gen_random_uuid() not null,
  date_essai date not null,
  disponible boolean default true,
  fermeture_manuelle boolean default false,
  commentaire text,
  created_at timestamp with time zone default now()
);

create table if not exists public.chaleurs (
  id uuid default gen_random_uuid() not null,
  chien_id uuid,
  date_debut date not null,
  date_fin date not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.checkin_checkout (
  id uuid default gen_random_uuid() not null,
  reservation_id uuid,
  chien_id uuid,
  date_arrivee_prevue timestamp without time zone,
  date_arrivee_reelle timestamp without time zone,
  date_depart_prevu timestamp without time zone,
  date_depart_reel timestamp without time zone,
  statut text default 'attendu'::text,
  created_at timestamp with time zone default now()
);

create table if not exists public.chiens (
  id uuid default gen_random_uuid() not null,
  client_id uuid,
  nom text not null,
  race text,
  couleur text,
  date_naissance date,
  sexe text,
  sterilise boolean default false,
  poids numeric,
  categorie_poids text,
  numero_puce text,
  photo_principale text,
  habitudes_alimentaires text,
  allergies text,
  traitements text,
  remarques text,
  comportement text,
  hebergement_autorise text,
  actif boolean default true,
  created_at timestamp with time zone default now(),
  statut_essai text default 'non_programme'::text,
  compatible_males_castres boolean default false,
  compatible_males_entiers boolean default false,
  compatible_femelles_sterilisees boolean default false,
  compatible_femelles_entieres boolean default false,
  compatible_moins_15kg boolean default false,
  compatible_15_30kg boolean default false,
  compatible_30_40kg boolean default false,
  notes_essai text,
  niveau_energie text,
  male_non_castre boolean default false,
  en_chaleurs boolean default false,
  chien_decede boolean default false,
  protection_ressources boolean default false,
  destructeur boolean default false,
  craintif boolean default false,
  comportement_autre text,
  journee_essai_effectuee boolean default false,
  journee_essai_invalide boolean default false,
  journee_essai_note text,
  veterinaire_nom text,
  veterinaire_telephone text,
  sterilisation text default 'non'::text,
  doit_etre_isole boolean default false not null,
  journee_essai_resultat_le timestamp with time zone,
  journee_essai_resultat_par uuid,
  cohabitation_source text
);

create table if not exists public.clients (
  id uuid default gen_random_uuid() not null,
  nom text not null,
  prenom text not null,
  email text not null,
  telephone text,
  adresse text,
  membre boolean default false,
  created_at timestamp with time zone default now(),
  actif boolean default true,
  auth_user_id uuid,
  contact_urgence_nom text,
  contact_urgence_prenom text,
  contact_urgence_telephone text,
  cotisation_exemptee boolean default false not null,
  cotisation_exemptee_raison text,
  photos_ok boolean default true not null,
  photos_ok_modifie_le timestamp with time zone,
  interne boolean default false not null
);

create table if not exists public.comptes (
  numero text not null,
  libelle text not null,
  type text not null,
  actif boolean default true not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.contacts_urgence (
  id uuid default gen_random_uuid() not null,
  client_id uuid,
  nom text,
  prenom text,
  telephone text,
  email text,
  adresse text,
  created_at timestamp with time zone default now()
);

create table if not exists public.cotisations_membres (
  id uuid default gen_random_uuid() not null,
  client_id uuid,
  annee integer not null,
  montant numeric(10,2) default 200 not null,
  mode_paiement text,
  statut text default 'payee'::text,
  date_paiement date,
  reservation_id uuid,
  created_at timestamp with time zone default now(),
  date_debut date not null,
  date_fin date not null
);

create table if not exists public.demandes_vacances (
  id uuid default gen_random_uuid() not null,
  employe_id uuid,
  date_debut date not null,
  date_fin date not null,
  nb_jours numeric(4,1) not null,
  statut text default 'en_attente'::text,
  note_employe text,
  note_admin text,
  created_at timestamp with time zone default now()
);

create table if not exists public.ecritures (
  id uuid default gen_random_uuid() not null,
  date_ecriture date not null,
  libelle text not null,
  piece_type text,
  piece_id uuid,
  exercice integer not null,
  contre_passe_id uuid,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.ecritures_lignes (
  id uuid default gen_random_uuid() not null,
  ecriture_id uuid not null,
  compte_numero text not null,
  debit numeric(12,2) default 0 not null,
  credit numeric(12,2) default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.emails_campagnes (
  id uuid default gen_random_uuid() not null,
  sujet text not null,
  corps text not null,
  cible text not null,
  nb_destinataires integer default 0 not null,
  nb_echecs integer default 0 not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.emails_envoyes (
  id uuid default gen_random_uuid() not null,
  destinataire text not null,
  type text not null,
  sujet text,
  statut text default 'envoye'::text not null,
  resend_id text,
  erreur text,
  reservation_id uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.employes_rh (
  id uuid default gen_random_uuid() not null,
  profile_id uuid,
  prenom text not null,
  nom text not null,
  email text not null,
  taux_travail integer default 100 not null,
  salaire_base numeric(10,2) not null,
  date_entree date not null,
  date_sortie date,
  actif boolean default true,
  created_at timestamp with time zone default now(),
  poste text default 'Auxiliaire'::text,
  poste_autre text,
  adresse text,
  telephone text,
  numero_avs text,
  date_naissance date,
  jour_cours smallint,
  salaire_annee_1 numeric,
  salaire_annee_2 numeric,
  salaire_annee_3 numeric,
  annee_apprentissage smallint
);

create table if not exists public.ententes_chiens (
  id uuid default gen_random_uuid() not null,
  chien_id uuid not null,
  chien_cible_id uuid not null,
  type text not null,
  note text,
  created_at timestamp with time zone default now()
);

create table if not exists public.exercices (
  annee integer not null,
  statut text default 'ouvert'::text not null,
  date_cloture timestamp with time zone,
  cloture_par uuid,
  resultat numeric(12,2),
  created_at timestamp with time zone default now() not null
);

create table if not exists public.facture_lignes (
  id uuid default gen_random_uuid() not null,
  facture_id uuid not null,
  ordre integer default 0 not null,
  libelle text not null,
  quantite numeric default 1 not null,
  prix_unitaire numeric default 0 not null,
  montant numeric default 0 not null,
  taux_tva numeric default 0 not null,
  secteur_tdfn numeric,
  compte_produit text default '3000'::text not null,
  reservation_id uuid,
  abonnement_id uuid,
  cotisation_id uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.facture_numerotation (
  exercice integer not null,
  prefixe text default 'FAC'::text not null,
  prochain integer default 1 not null
);

create table if not exists public.facture_reservations (
  id uuid default gen_random_uuid() not null,
  facture_id uuid not null,
  reservation_id uuid not null,
  montant numeric default 0 not null,
  created_at timestamp with time zone default now(),
  facture_annulee boolean default false not null
);

create table if not exists public.factures (
  id uuid default gen_random_uuid() not null,
  numero text,
  client_id uuid,
  reservation_id uuid,
  type_facture text default 'reservation'::text,
  date_facture date default CURRENT_DATE,
  montant_total numeric default 0,
  montant_paye numeric default 0,
  montant_restant numeric default 0,
  statut text default 'brouillon'::text,
  arrangement_paiement boolean default false,
  notes_arrangement text,
  date_premier_rappel date,
  date_deuxieme_rappel date,
  premier_rappel_envoye boolean default false,
  deuxieme_rappel_envoye boolean default false,
  created_at timestamp with time zone default now(),
  reference_qr text,
  type text default 'facture'::text not null,
  facture_origine_id uuid,
  date_echeance date,
  montant_ht numeric,
  montant_tva numeric default 0 not null,
  montant_ttc numeric,
  motif text,
  pdf_path text,
  pdf_sha256 text,
  emise_par uuid,
  emise_le timestamp with time zone,
  exercice integer
);

create table if not exists public.fermetures_essai (
  id uuid default gen_random_uuid() not null,
  date_debut date not null,
  date_fin date not null,
  motif text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.fermetures_exceptionnelles (
  id uuid default gen_random_uuid() not null,
  date_debut date not null,
  date_fin date not null,
  motif text,
  created_at timestamp with time zone default now()
);

create table if not exists public.fiche_salaire_deductions (
  id uuid default gen_random_uuid() not null,
  fiche_id uuid,
  label text not null,
  type text not null,
  valeur numeric(10,4) not null,
  montant_calcule numeric(10,2) not null,
  ordre integer default 0
);

create table if not exists public.fiches_salaire (
  id uuid default gen_random_uuid() not null,
  employe_id uuid,
  mois integer not null,
  annee integer not null,
  salaire_brut numeric(10,2) not null,
  salaire_net numeric(10,2) not null,
  total_deductions numeric(10,2) not null,
  commentaire text,
  created_at timestamp with time zone default now()
);

create table if not exists public.indisponibilites (
  id uuid default gen_random_uuid() not null,
  employe_id uuid,
  date date not null,
  note text,
  created_at timestamp with time zone default now()
);

create table if not exists public.journal_evenements (
  id uuid default gen_random_uuid() not null,
  entite text not null,
  entite_id uuid not null,
  evenement text not null,
  avant jsonb,
  apres jsonb,
  motif text,
  user_id uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.jours_feries (
  id uuid default gen_random_uuid() not null,
  nom text not null,
  date_ferie date not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.liste_attente (
  id uuid default gen_random_uuid() not null,
  client_id uuid,
  chien_id uuid,
  date_debut date not null,
  date_fin date not null,
  type_reservation text,
  commentaire text,
  notifie boolean default false,
  created_at timestamp with time zone default now()
);

create table if not exists public.modeles_deductions (
  id uuid default gen_random_uuid() not null,
  label text not null,
  type text not null,
  valeur numeric(10,4) not null,
  actif boolean default true,
  ordre integer default 0,
  created_at timestamp with time zone default now()
);

create table if not exists public.modeles_email (
  type text not null,
  sujet text,
  titre text,
  intro text,
  message_final text,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid
);

create table if not exists public.occupation_boxes (
  id uuid default gen_random_uuid() not null,
  box_id uuid,
  chien_id uuid,
  reservation_id uuid,
  date_debut date not null,
  date_fin date not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.paiements_resa (
  id uuid default gen_random_uuid() not null,
  reservation_id uuid,
  client_id uuid not null,
  date_paiement date default CURRENT_DATE not null,
  mode text not null,
  montant numeric(12,2) not null,
  motif text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  cle_idempotence text,
  facture_id uuid,
  source text default 'manuel'::text not null,
  arrondi numeric default 0 not null
);

create table if not exists public.parametres (
  id uuid default gen_random_uuid() not null,
  cle text not null,
  valeur text not null,
  description text,
  updated_at timestamp with time zone default now()
);

create table if not exists public.photos_chiens (
  id uuid default gen_random_uuid() not null,
  chien_id uuid,
  image_url text not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.planning_employes (
  id uuid default gen_random_uuid() not null,
  employe_id uuid,
  date date not null,
  statut text default 'travail'::text not null,
  note text,
  valide boolean default false,
  created_at timestamp with time zone default now()
);

create table if not exists public.profiles (
  id uuid not null,
  email text,
  nom text,
  prenom text,
  role text default 'client'::text,
  actif boolean default true,
  perm_checkin boolean default true,
  perm_reservations_creer boolean default true,
  perm_reservations_modifier boolean default true,
  perm_reservations_annuler boolean default true,
  perm_clients_creer boolean default true,
  perm_clients_modifier boolean default true,
  perm_chiens_modifier boolean default true,
  perm_planning boolean default true,
  perm_tarifs_urgence boolean default false,
  created_at timestamp with time zone default now(),
  perm_chiens_creer boolean default true not null,
  perm_journee_essai boolean default true not null,
  perm_encaissements boolean default true not null,
  perm_box boolean default true not null,
  perm_timbrage_equipe boolean default false not null,
  perm_vacances_equipe boolean default false not null
);

create table if not exists public.reservation_chiens (
  id uuid default gen_random_uuid() not null,
  reservation_id uuid,
  chien_id uuid
);

create table if not exists public.reservation_extras (
  id uuid default gen_random_uuid() not null,
  reservation_id uuid not null,
  libelle text not null,
  montant numeric default 0 not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.reservations (
  id uuid default gen_random_uuid() not null,
  client_id uuid,
  type_reservation text not null,
  statut text default 'en_attente'::text not null,
  date_debut date not null,
  date_fin date not null,
  heure_arrivee time without time zone,
  heure_depart time without time zone,
  box_id uuid,
  urgence boolean default false,
  montant_calcule numeric default 0,
  montant_final numeric default 0,
  commentaire_admin text,
  created_at timestamp with time zone default now(),
  statut_paiement text default 'impaye'::text,
  montant_paye numeric(10,2) default 0,
  date_paiement date,
  mode_paiement text,
  numero integer default nextval('reservations_numero_seq'::regclass) not null,
  ajustement_manuel numeric default 0 not null,
  commentaire_client text,
  offerte boolean default false not null,
  compta_synchronisee boolean default true not null,
  compta_erreur text,
  compta_sync_at timestamp with time zone,
  abonnement_id uuid,
  paiement_demande_le date,
  relance_niveau integer default 0 not null,
  relance_le date,
  essai_force boolean default false not null,
  essai_force_raison text,
  vue_admin_le timestamp with time zone,
  essai_force_heure time without time zone
);

create table if not exists public.services_supplementaires (
  id uuid default gen_random_uuid() not null,
  nom text not null,
  prix numeric,
  prix_variable boolean default false,
  actif boolean default true,
  created_at timestamp with time zone default now()
);

create table if not exists public.tarifs (
  id uuid default gen_random_uuid() not null,
  actif boolean default true,
  categorie text not null,
  membre boolean default false,
  prix numeric not null,
  created_at timestamp with time zone default now(),
  annee integer default 2026
);

create table if not exists public.timbrage (
  id uuid default gen_random_uuid() not null,
  employe_id uuid,
  date date not null,
  heure_debut_matin time without time zone default '07:30:00'::time without time zone,
  heure_fin_matin time without time zone default '12:00:00'::time without time zone,
  heure_debut_aprem time without time zone default '14:30:00'::time without time zone,
  heure_fin_aprem time without time zone default '18:30:00'::time without time zone,
  type_absence text,
  note text,
  valide_admin boolean default false,
  created_at timestamp with time zone default now()
);

create table if not exists public.vacances_scolaires (
  id uuid default gen_random_uuid() not null,
  nom text not null,
  date_debut date not null,
  date_fin date not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.vaccins (
  id uuid default gen_random_uuid() not null,
  chien_id uuid,
  type_vaccin text,
  date_vaccin date,
  date_expiration date,
  document_url text,
  valide_admin boolean default false,
  created_at timestamp with time zone default now()
);

-- ── Contraintes ─────────────────────────────────────────────────────────

alter table public.abonnements add constraint abonnements_pkey PRIMARY KEY (id);
alter table public.abonnements_mouvements add constraint abonnements_mouvements_pkey PRIMARY KEY (id);
alter table public.avoirs_mouvements add constraint avoirs_mouvements_pkey PRIMARY KEY (id);
alter table public.box_indisponibilites add constraint box_indisponibilites_pkey PRIMARY KEY (id);
alter table public.boxes add constraint boxes_pkey PRIMARY KEY (id);
alter table public.calendrier_essais add constraint calendrier_essais_pkey PRIMARY KEY (id);
alter table public.chaleurs add constraint chaleurs_pkey PRIMARY KEY (id);
alter table public.checkin_checkout add constraint checkin_checkout_pkey PRIMARY KEY (id);
alter table public.chiens add constraint chiens_pkey PRIMARY KEY (id);
alter table public.clients add constraint clients_pkey PRIMARY KEY (id);
alter table public.comptes add constraint comptes_pkey PRIMARY KEY (numero);
alter table public.contacts_urgence add constraint contacts_urgence_pkey PRIMARY KEY (id);
alter table public.cotisations_membres add constraint cotisations_membres_pkey PRIMARY KEY (id);
alter table public.demandes_vacances add constraint demandes_vacances_pkey PRIMARY KEY (id);
alter table public.ecritures add constraint ecritures_pkey PRIMARY KEY (id);
alter table public.ecritures_lignes add constraint ecritures_lignes_pkey PRIMARY KEY (id);
alter table public.emails_campagnes add constraint emails_campagnes_pkey PRIMARY KEY (id);
alter table public.emails_envoyes add constraint emails_envoyes_pkey PRIMARY KEY (id);
alter table public.employes_rh add constraint employes_rh_pkey PRIMARY KEY (id);
alter table public.ententes_chiens add constraint ententes_chiens_pkey PRIMARY KEY (id);
alter table public.exercices add constraint exercices_pkey PRIMARY KEY (annee);
alter table public.facture_lignes add constraint facture_lignes_pkey PRIMARY KEY (id);
alter table public.facture_numerotation add constraint facture_numerotation_pkey PRIMARY KEY (exercice, prefixe);
alter table public.facture_reservations add constraint facture_reservations_pkey PRIMARY KEY (id);
alter table public.factures add constraint factures_pkey PRIMARY KEY (id);
alter table public.fermetures_essai add constraint fermetures_essai_pkey PRIMARY KEY (id);
alter table public.fermetures_exceptionnelles add constraint fermetures_exceptionnelles_pkey PRIMARY KEY (id);
alter table public.fiche_salaire_deductions add constraint fiche_salaire_deductions_pkey PRIMARY KEY (id);
alter table public.fiches_salaire add constraint fiches_salaire_pkey PRIMARY KEY (id);
alter table public.indisponibilites add constraint indisponibilites_pkey PRIMARY KEY (id);
alter table public.journal_evenements add constraint journal_evenements_pkey PRIMARY KEY (id);
alter table public.jours_feries add constraint jours_feries_pkey PRIMARY KEY (id);
alter table public.liste_attente add constraint liste_attente_pkey PRIMARY KEY (id);
alter table public.modeles_deductions add constraint modeles_deductions_pkey PRIMARY KEY (id);
alter table public.modeles_email add constraint modeles_email_pkey PRIMARY KEY (type);
alter table public.occupation_boxes add constraint occupation_boxes_pkey PRIMARY KEY (id);
alter table public.paiements_resa add constraint paiements_resa_pkey PRIMARY KEY (id);
alter table public.parametres add constraint parametres_pkey PRIMARY KEY (id);
alter table public.photos_chiens add constraint photos_chiens_pkey PRIMARY KEY (id);
alter table public.planning_employes add constraint planning_employes_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.reservation_chiens add constraint reservation_chiens_pkey PRIMARY KEY (id);
alter table public.reservation_extras add constraint reservation_extras_pkey PRIMARY KEY (id);
alter table public.reservations add constraint reservations_pkey PRIMARY KEY (id);
alter table public.services_supplementaires add constraint services_supplementaires_pkey PRIMARY KEY (id);
alter table public.tarifs add constraint tarifs_pkey PRIMARY KEY (id);
alter table public.timbrage add constraint timbrage_pkey PRIMARY KEY (id);
alter table public.vacances_scolaires add constraint vacances_scolaires_pkey PRIMARY KEY (id);
alter table public.vaccins add constraint vaccins_pkey PRIMARY KEY (id);
alter table public.boxes add constraint boxes_numero_key UNIQUE (numero);
alter table public.calendrier_essais add constraint calendrier_essais_date_essai_key UNIQUE (date_essai);
alter table public.clients add constraint clients_email_key UNIQUE (email);
alter table public.ententes_chiens add constraint ententes_chiens_chien_id_chien_cible_id_key UNIQUE (chien_id, chien_cible_id);
alter table public.facture_reservations add constraint facture_reservations_facture_id_reservation_id_key UNIQUE (facture_id, reservation_id);
alter table public.factures add constraint factures_numero_key UNIQUE (numero);
alter table public.fiches_salaire add constraint fiches_salaire_employe_id_mois_annee_key UNIQUE (employe_id, mois, annee);
alter table public.indisponibilites add constraint indisponibilites_employe_id_date_key UNIQUE (employe_id, date);
alter table public.parametres add constraint parametres_cle_key UNIQUE (cle);
alter table public.planning_employes add constraint planning_employes_employe_id_date_key UNIQUE (employe_id, date);
alter table public.timbrage add constraint timbrage_employe_id_date_key UNIQUE (employe_id, date);
alter table public.abonnements add constraint abonnements_mode_paiement_check CHECK (((mode_paiement IS NULL) OR (mode_paiement = ANY (ARRAY['cash'::text, 'twint'::text, 'virement'::text, 'stripe'::text, 'avoir'::text]))));
alter table public.abonnements add constraint abonnements_statut_check CHECK ((statut = ANY (ARRAY['en_attente_paiement'::text, 'actif'::text, 'epuise'::text, 'expire'::text, 'annule'::text])));
alter table public.abonnements_mouvements add constraint abonnements_mouvements_type_check CHECK ((type = ANY (ARRAY['achat'::text, 'consommation'::text, 'recredit'::text, 'expiration'::text, 'ajustement'::text])));
alter table public.avoirs_mouvements add constraint avoirs_mouvements_type_check CHECK ((type = ANY (ARRAY['ajout_manuel'::text, 'retrait_manuel'::text, 'annulation_paiement'::text, 'utilisation'::text, 'trop_percu'::text, 'reprise'::text, 'mise_en_avoir'::text, 'avoir_facture'::text])));
alter table public.box_indisponibilites add constraint box_indispo_dates_coherentes CHECK ((date_fin >= date_debut));
alter table public.checkin_checkout add constraint checkin_checkout_statut_check CHECK ((statut = ANY (ARRAY['attendu'::text, 'arrive'::text, 'a_recuperer'::text, 'parti'::text])));
alter table public.chiens add constraint chiens_categorie_poids_check CHECK ((categorie_poids = ANY (ARRAY['moins_15kg'::text, '15_30kg'::text, '30_40kg'::text])));
alter table public.chiens add constraint chiens_cohabitation_source_check CHECK ((cohabitation_source = ANY (ARRAY['pension'::text, 'client'::text])));
alter table public.chiens add constraint chiens_hebergement_autorise_check CHECK ((hebergement_autorise = ANY (ARRAY['partage_autorise'::text, 'privatif_obligatoire'::text])));
alter table public.chiens add constraint chiens_sexe_check CHECK ((sexe = ANY (ARRAY['M'::text, 'F'::text])));
alter table public.chiens add constraint chiens_statut_essai_check CHECK ((statut_essai = ANY (ARRAY['non_programme'::text, 'programme'::text, 'seconde_journee'::text, 'valide'::text, 'refuse'::text])));
alter table public.chiens add constraint chiens_sterilisation_check CHECK ((sterilisation = ANY (ARRAY['oui'::text, 'non'::text, 'chimique'::text])));
alter table public.comptes add constraint comptes_type_check CHECK ((type = ANY (ARRAY['actif'::text, 'passif'::text, 'produit'::text, 'charge'::text])));
alter table public.cotisations_membres add constraint cotisations_membres_mode_paiement_check CHECK ((mode_paiement = ANY (ARRAY['cash'::text, 'virement'::text, 'prochaine_resa'::text])));
alter table public.cotisations_membres add constraint cotisations_membres_periode_valide CHECK ((date_fin > date_debut));
alter table public.cotisations_membres add constraint cotisations_membres_statut_check CHECK ((statut = ANY (ARRAY['payee'::text, 'en_attente'::text])));
alter table public.demandes_vacances add constraint demandes_vacances_statut_check CHECK ((statut = ANY (ARRAY['en_attente'::text, 'acceptee'::text, 'refusee'::text])));
alter table public.ecritures_lignes add constraint ecritures_lignes_credit_check CHECK ((credit >= (0)::numeric));
alter table public.ecritures_lignes add constraint ecritures_lignes_debit_check CHECK ((debit >= (0)::numeric));
alter table public.ecritures_lignes add constraint ligne_debit_xor_credit CHECK ((NOT ((debit > (0)::numeric) AND (credit > (0)::numeric))));
alter table public.emails_campagnes add constraint emails_campagnes_cible_check CHECK ((cible = ANY (ARRAY['membres_actifs'::text, 'tous_clients'::text])));
alter table public.ententes_chiens add constraint ententes_chiens_type_check CHECK ((type = ANY (ARRAY['positif'::text, 'negatif'::text, 'box_compatible'::text, 'famille_uniquement'::text])));
alter table public.exercices add constraint exercices_statut_check CHECK ((statut = ANY (ARRAY['ouvert'::text, 'cloture'::text])));
alter table public.factures add constraint factures_avoir_origine_check CHECK (((type <> 'avoir'::text) OR (facture_origine_id IS NOT NULL)));
alter table public.factures add constraint factures_statut_check CHECK ((statut = ANY (ARRAY['brouillon'::text, 'envoyee'::text, 'partiellement_reglee'::text, 'arrangement_paiement'::text, 'acquittee'::text, 'annulee'::text, 'annulee_par_avoir'::text])));
alter table public.factures add constraint factures_type_doc_check CHECK ((type = ANY (ARRAY['facture'::text, 'acompte'::text, 'avoir'::text, 'libre'::text])));
alter table public.factures add constraint factures_type_facture_check CHECK ((type_facture = ANY (ARRAY['reservation'::text, 'adhesion'::text, 'service'::text])));
alter table public.fermetures_essai add constraint fermetures_essai_dates_ok CHECK ((date_fin >= date_debut));
alter table public.fiche_salaire_deductions add constraint fiche_salaire_deductions_type_check CHECK ((type = ANY (ARRAY['pourcentage'::text, 'montant_fixe'::text])));
alter table public.modeles_deductions add constraint modeles_deductions_type_check CHECK ((type = ANY (ARRAY['pourcentage'::text, 'montant_fixe'::text])));
alter table public.paiements_resa add constraint paiements_resa_mode_check CHECK ((mode = ANY (ARRAY['cash'::text, 'twint'::text, 'carte'::text, 'stripe'::text, 'virement'::text, 'avoir'::text])));
alter table public.paiements_resa add constraint paiements_resa_piece_check CHECK (((reservation_id IS NOT NULL) OR (facture_id IS NOT NULL)));
alter table public.planning_employes add constraint planning_employes_statut_check CHECK ((statut = ANY (ARRAY['travail'::text, 'repos'::text, 'vacances'::text, 'repos_vacances'::text, 'maladie'::text, 'accident'::text, 'militaire'::text, 'ferie'::text, 'ferie_travaille'::text, 'absent'::text, 'heures_sup'::text, 'autre'::text, 'cours'::text])));
alter table public.profiles add constraint profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'employe'::text, 'client'::text])));
alter table public.reservations add constraint reservations_mode_paiement_check CHECK ((mode_paiement = ANY (ARRAY['twint'::text, 'cash'::text, 'iban'::text, 'stripe'::text, 'autre'::text, 'avoir'::text, 'abonnement'::text])));
alter table public.reservations add constraint reservations_statut_check CHECK ((statut = ANY (ARRAY['en_attente'::text, 'validee'::text, 'refusee'::text, 'annulee'::text, 'terminee'::text])));
alter table public.reservations add constraint reservations_statut_paiement_check CHECK ((statut_paiement = ANY (ARRAY['impaye'::text, 'partiel'::text, 'paye'::text])));
alter table public.reservations add constraint reservations_type_reservation_check CHECK ((type_reservation = ANY (ARRAY['journee'::text, 'sejour'::text, 'essai'::text])));
alter table public.timbrage add constraint timbrage_type_absence_check CHECK ((type_absence = ANY (ARRAY['maladie'::text, 'accident'::text, 'militaire'::text, 'vacances'::text, 'ferie'::text, 'autre'::text])));
alter table public.vaccins add constraint vaccins_type_vaccin_check CHECK ((type_vaccin = ANY (ARRAY['DHPPI'::text, 'LEPTO'::text, 'KC_ORAL'::text])));
alter table public.abonnements add constraint abonnements_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public.abonnements_mouvements add constraint abonnements_mouvements_abonnement_id_fkey FOREIGN KEY (abonnement_id) REFERENCES abonnements(id);
alter table public.abonnements_mouvements add constraint abonnements_mouvements_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
alter table public.abonnements_mouvements add constraint abonnements_mouvements_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id);
alter table public.avoirs_mouvements add constraint avoirs_mouvements_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public.avoirs_mouvements add constraint avoirs_mouvements_facture_id_fkey FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE SET NULL;
alter table public.avoirs_mouvements add constraint avoirs_mouvements_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL;
alter table public.box_indisponibilites add constraint box_indisponibilites_box_id_fkey FOREIGN KEY (box_id) REFERENCES boxes(id) ON DELETE CASCADE;
alter table public.boxes add constraint boxes_proprietaire_client_id_fkey FOREIGN KEY (proprietaire_client_id) REFERENCES clients(id) ON DELETE SET NULL;
alter table public.chaleurs add constraint chaleurs_chien_id_fkey FOREIGN KEY (chien_id) REFERENCES chiens(id) ON DELETE CASCADE;
alter table public.checkin_checkout add constraint checkin_checkout_chien_id_fkey FOREIGN KEY (chien_id) REFERENCES chiens(id) ON DELETE CASCADE;
alter table public.checkin_checkout add constraint checkin_checkout_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;
alter table public.chiens add constraint chiens_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public.chiens add constraint chiens_journee_essai_resultat_par_fkey FOREIGN KEY (journee_essai_resultat_par) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.clients add constraint clients_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id);
alter table public.contacts_urgence add constraint contacts_urgence_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public.cotisations_membres add constraint cotisations_membres_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public.cotisations_membres add constraint cotisations_membres_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL;
alter table public.demandes_vacances add constraint demandes_vacances_employe_id_fkey FOREIGN KEY (employe_id) REFERENCES employes_rh(id);
alter table public.ecritures add constraint ecritures_contre_passe_id_fkey FOREIGN KEY (contre_passe_id) REFERENCES ecritures(id);
alter table public.ecritures_lignes add constraint ecritures_lignes_compte_numero_fkey FOREIGN KEY (compte_numero) REFERENCES comptes(numero);
alter table public.ecritures_lignes add constraint ecritures_lignes_ecriture_id_fkey FOREIGN KEY (ecriture_id) REFERENCES ecritures(id) ON DELETE RESTRICT;
alter table public.employes_rh add constraint employes_rh_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id);
alter table public.ententes_chiens add constraint ententes_chiens_chien_cible_id_fkey FOREIGN KEY (chien_cible_id) REFERENCES chiens(id) ON DELETE CASCADE;
alter table public.ententes_chiens add constraint ententes_chiens_chien_id_fkey FOREIGN KEY (chien_id) REFERENCES chiens(id) ON DELETE CASCADE;
alter table public.facture_lignes add constraint facture_lignes_abonnement_id_fkey FOREIGN KEY (abonnement_id) REFERENCES abonnements(id) ON DELETE SET NULL;
alter table public.facture_lignes add constraint facture_lignes_compte_produit_fkey FOREIGN KEY (compte_produit) REFERENCES comptes(numero);
alter table public.facture_lignes add constraint facture_lignes_cotisation_id_fkey FOREIGN KEY (cotisation_id) REFERENCES cotisations_membres(id) ON DELETE SET NULL;
alter table public.facture_lignes add constraint facture_lignes_facture_id_fkey FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE CASCADE;
alter table public.facture_lignes add constraint facture_lignes_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL;
alter table public.facture_reservations add constraint facture_reservations_facture_id_fkey FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE CASCADE;
alter table public.facture_reservations add constraint facture_reservations_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE RESTRICT;
alter table public.factures add constraint factures_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public.factures add constraint factures_emise_par_fkey FOREIGN KEY (emise_par) REFERENCES profiles(id);
alter table public.factures add constraint factures_facture_origine_id_fkey FOREIGN KEY (facture_origine_id) REFERENCES factures(id);
alter table public.factures add constraint factures_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL;
alter table public.fiche_salaire_deductions add constraint fiche_salaire_deductions_fiche_id_fkey FOREIGN KEY (fiche_id) REFERENCES fiches_salaire(id) ON DELETE CASCADE;
alter table public.fiches_salaire add constraint fiches_salaire_employe_id_fkey FOREIGN KEY (employe_id) REFERENCES employes_rh(id) ON DELETE CASCADE;
alter table public.indisponibilites add constraint indisponibilites_employe_id_fkey FOREIGN KEY (employe_id) REFERENCES employes_rh(id);
alter table public.journal_evenements add constraint journal_evenements_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public.liste_attente add constraint liste_attente_chien_id_fkey FOREIGN KEY (chien_id) REFERENCES chiens(id) ON DELETE CASCADE;
alter table public.liste_attente add constraint liste_attente_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public.occupation_boxes add constraint occupation_boxes_box_id_fkey FOREIGN KEY (box_id) REFERENCES boxes(id) ON DELETE CASCADE;
alter table public.occupation_boxes add constraint occupation_boxes_chien_id_fkey FOREIGN KEY (chien_id) REFERENCES chiens(id) ON DELETE CASCADE;
alter table public.occupation_boxes add constraint occupation_boxes_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;
alter table public.paiements_resa add constraint paiements_resa_facture_id_fkey FOREIGN KEY (facture_id) REFERENCES factures(id);
alter table public.paiements_resa add constraint paiements_resa_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id);
alter table public.photos_chiens add constraint photos_chiens_chien_id_fkey FOREIGN KEY (chien_id) REFERENCES chiens(id) ON DELETE CASCADE;
alter table public.planning_employes add constraint planning_employes_employe_id_fkey FOREIGN KEY (employe_id) REFERENCES employes_rh(id);
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.reservation_chiens add constraint reservation_chiens_chien_id_fkey FOREIGN KEY (chien_id) REFERENCES chiens(id) ON DELETE CASCADE;
alter table public.reservation_chiens add constraint reservation_chiens_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;
alter table public.reservation_extras add constraint reservation_extras_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;
alter table public.reservations add constraint reservations_abonnement_id_fkey FOREIGN KEY (abonnement_id) REFERENCES abonnements(id);
alter table public.reservations add constraint reservations_box_id_fkey FOREIGN KEY (box_id) REFERENCES boxes(id);
alter table public.reservations add constraint reservations_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public.timbrage add constraint timbrage_employe_id_fkey FOREIGN KEY (employe_id) REFERENCES employes_rh(id);
alter table public.vaccins add constraint vaccins_chien_id_fkey FOREIGN KEY (chien_id) REFERENCES chiens(id) ON DELETE CASCADE;

-- ── Index ───────────────────────────────────────────────────────────────

CREATE INDEX idx_abonnements_client ON public.abonnements USING btree (client_id);
CREATE INDEX idx_abonnements_statut ON public.abonnements USING btree (statut);
CREATE INDEX idx_abo_mouv_abonnement ON public.abonnements_mouvements USING btree (abonnement_id);
CREATE INDEX idx_abo_mouv_client ON public.abonnements_mouvements USING btree (client_id);
CREATE INDEX idx_abo_mouv_reservation ON public.abonnements_mouvements USING btree (reservation_id);
CREATE INDEX idx_avoirs_mouvements_client ON public.avoirs_mouvements USING btree (client_id, created_at);
CREATE INDEX idx_avoirs_mouvements_facture_id ON public.avoirs_mouvements USING btree (facture_id);
CREATE INDEX idx_avoirs_mouvements_reservation_id ON public.avoirs_mouvements USING btree (reservation_id);
CREATE INDEX idx_box_indispo_box_dates ON public.box_indisponibilites USING btree (box_id, date_debut, date_fin);
CREATE INDEX idx_boxes_proprietaire_client_id ON public.boxes USING btree (proprietaire_client_id) WHERE (proprietaire_client_id IS NOT NULL);
CREATE INDEX idx_chaleurs_chien_id ON public.chaleurs USING btree (chien_id);
CREATE INDEX idx_checkin_checkout_chien_id ON public.checkin_checkout USING btree (chien_id);
CREATE INDEX idx_checkin_checkout_reservation_id ON public.checkin_checkout USING btree (reservation_id);
CREATE INDEX idx_chiens_client_id ON public.chiens USING btree (client_id);
CREATE INDEX idx_clients_auth_user_id ON public.clients USING btree (auth_user_id);
CREATE INDEX idx_contacts_urgence_client_id ON public.contacts_urgence USING btree (client_id);
CREATE UNIQUE INDEX cotisations_membres_une_en_attente_par_client ON public.cotisations_membres USING btree (client_id) WHERE (statut = 'en_attente'::text);
CREATE INDEX idx_cotisations_membres_client_periode ON public.cotisations_membres USING btree (client_id, date_debut, date_fin);
CREATE INDEX idx_cotisations_membres_reservation_id ON public.cotisations_membres USING btree (reservation_id);
CREATE INDEX idx_demandes_vacances_employe_id ON public.demandes_vacances USING btree (employe_id);
CREATE INDEX idx_ecr_exercice ON public.ecritures USING btree (exercice);
CREATE INDEX idx_ecritures_contre_passe_id ON public.ecritures USING btree (contre_passe_id);
CREATE INDEX idx_ecr_lignes_compte ON public.ecritures_lignes USING btree (compte_numero);
CREATE INDEX idx_ecr_lignes_ecriture ON public.ecritures_lignes USING btree (ecriture_id);
CREATE INDEX idx_employes_rh_profile_id ON public.employes_rh USING btree (profile_id);
CREATE INDEX idx_ententes_chiens_chien_cible_id ON public.ententes_chiens USING btree (chien_cible_id);
CREATE INDEX idx_facture_lignes_abonnement ON public.facture_lignes USING btree (abonnement_id);
CREATE INDEX idx_facture_lignes_cotisation ON public.facture_lignes USING btree (cotisation_id);
CREATE INDEX idx_facture_lignes_facture ON public.facture_lignes USING btree (facture_id);
CREATE INDEX idx_facture_lignes_reservation ON public.facture_lignes USING btree (reservation_id);
CREATE INDEX idx_facture_reservations_facture ON public.facture_reservations USING btree (facture_id);
CREATE INDEX idx_facture_reservations_reservation ON public.facture_reservations USING btree (reservation_id);
CREATE UNIQUE INDEX uniq_reservation_facture_active ON public.facture_reservations USING btree (reservation_id) WHERE (facture_annulee = false);
CREATE INDEX idx_factures_client_id ON public.factures USING btree (client_id);
CREATE INDEX idx_factures_echeance ON public.factures USING btree (date_echeance);
CREATE INDEX idx_factures_exercice ON public.factures USING btree (exercice);
CREATE INDEX idx_factures_origine ON public.factures USING btree (facture_origine_id);
CREATE INDEX idx_factures_reservation_id ON public.factures USING btree (reservation_id);
CREATE INDEX idx_fiche_salaire_deductions_fiche_id ON public.fiche_salaire_deductions USING btree (fiche_id);
CREATE INDEX idx_journal_evenements_entite ON public.journal_evenements USING btree (entite, entite_id, created_at DESC);
CREATE INDEX idx_liste_attente_chien_id ON public.liste_attente USING btree (chien_id);
CREATE INDEX idx_liste_attente_client_id ON public.liste_attente USING btree (client_id);
CREATE INDEX idx_occupation_boxes_box_id ON public.occupation_boxes USING btree (box_id);
CREATE INDEX idx_occupation_boxes_chien_id ON public.occupation_boxes USING btree (chien_id);
CREATE INDEX idx_occupation_boxes_reservation_id ON public.occupation_boxes USING btree (reservation_id);
CREATE INDEX idx_paiements_resa_client ON public.paiements_resa USING btree (client_id);
CREATE INDEX idx_paiements_resa_facture ON public.paiements_resa USING btree (facture_id);
CREATE INDEX idx_paiements_resa_reservation ON public.paiements_resa USING btree (reservation_id);
CREATE UNIQUE INDEX uq_paiements_resa_idempotence ON public.paiements_resa USING btree (reservation_id, cle_idempotence) WHERE (cle_idempotence IS NOT NULL);
CREATE INDEX idx_photos_chiens_chien_id ON public.photos_chiens USING btree (chien_id);
CREATE INDEX idx_reservation_chiens_chien_id ON public.reservation_chiens USING btree (chien_id);
CREATE INDEX idx_reservation_chiens_reservation_id ON public.reservation_chiens USING btree (reservation_id);
CREATE INDEX idx_reservation_extras_reservation_id ON public.reservation_extras USING btree (reservation_id);
CREATE INDEX idx_reservations_abonnement ON public.reservations USING btree (abonnement_id);
CREATE INDEX idx_reservations_box_id ON public.reservations USING btree (box_id);
CREATE INDEX idx_reservations_client_id ON public.reservations USING btree (client_id);
CREATE INDEX idx_reservations_vue_admin_le ON public.reservations USING btree (vue_admin_le) WHERE (vue_admin_le IS NULL);
CREATE INDEX idx_vaccins_chien_id ON public.vaccins USING btree (chien_id);

-- ── Fonctions ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.abonnements_mouvements_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'abonnements_mouvements est append-only : un mouvement ne peut etre ni modifie ni supprime';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.acomptes_a_imputer(p_facture_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
   where (p.facture_id is null and p.reservation_id in (select reservation_id from resas))
      or (p.facture_id in (select id from factures_acompte));
$function$
;

CREATE OR REPLACE FUNCTION public.avoirs_mouvements_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'avoirs_mouvements est append-only : un mouvement ne peut etre ni modifie ni supprime';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bloquer_doublon_paiement_resa()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if exists (
    select 1
    from public.paiements_resa p
    where p.reservation_id = new.reservation_id
      and p.montant = new.montant
      and p.mode = new.mode
      and coalesce(p.motif, '') = coalesce(new.motif, '')
      and p.created_at > (now() - interval '10 seconds')
  ) then
    raise exception 'Paiement identique deja enregistre il y a quelques secondes (protection anti double-clic). Patientez quelques secondes ou modifiez le paiement avant de reessayer.'
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bloquer_ecriture_exercice_cloture()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_annee  integer := extract(year from NEW.date_ecriture)::int;
  v_statut text;
begin
  select statut into v_statut from public.exercices where annee = v_annee;
  if v_statut = 'cloture' then
    raise exception 'Exercice % cloture : aucune nouvelle ecriture autorisee', v_annee;
  end if;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bloquer_surbooking_box()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_client_new uuid;
  v_conflits int;
begin
  if new.box_id is null then
    return new;
  end if;

  -- Sérialise les insertions concurrentes sur le même box (verrou libéré en fin de transaction).
  perform pg_advisory_xact_lock(hashtextextended(new.box_id::text, 0));

  select r.client_id into v_client_new
  from public.reservations r
  where r.id = new.reservation_id;

  select count(*) into v_conflits
  from public.occupation_boxes o
  join public.reservations r2 on r2.id = o.reservation_id
  where o.box_id = new.box_id
    and o.id is distinct from new.id
    and o.reservation_id is distinct from new.reservation_id
    and r2.client_id is distinct from v_client_new           -- uniquement clients différents
    and greatest(o.date_debut, new.date_debut) < least(o.date_fin, new.date_fin);  -- vrai chevauchement

  if v_conflits > 0 then
    raise exception 'Ce box est déjà occupé par un autre client sur des dates qui se chevauchent (protection anti double-réservation). Choisissez un autre box ou d''autres dates.'
      using errcode = 'exclusion_violation';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.calculer_periode_cotisation(p_client_id uuid, p_date_paiement date DEFAULT CURRENT_DATE, p_exclure_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(date_debut date, date_fin date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with precedente as (
    select max(c.date_fin) as fin
    from public.cotisations_membres c
    where c.client_id = p_client_id
      and c.statut = 'payee'
      and (p_exclure_id is null or c.id <> p_exclure_id)
      and c.date_fin >= p_date_paiement
  ),
  debut as (
    select coalesce(precedente.fin + 1, p_date_paiement) as d from precedente
  )
  select debut.d,
         (date_trunc('month', debut.d::timestamp) + interval '1 year' - interval '1 day')::date
  from debut;
$function$
;

CREATE OR REPLACE FUNCTION public.chiens_synchroniser_flags_essai()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.statut_essai is null then
    new.statut_essai := 'non_programme';
  end if;
  new.journee_essai_effectuee := new.statut_essai in ('valide', 'refuse', 'seconde_journee');
  new.journee_essai_invalide  := new.statut_essai = 'refuse';
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cotisations_membres_synchroniser_periode()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.date_debut is null then
    new.date_debut := coalesce(new.date_paiement, current_date);
  end if;
  if new.date_fin is null then
    new.date_fin := (date_trunc('month', new.date_debut::timestamp) + interval '1 year' - interval '1 day')::date;
  end if;
  new.annee := extract(year from new.date_debut)::int;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ecritures_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'Les ecritures comptables sont inalterables : ni modification ni suppression (corriger par contre-passation).';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.emettre_facture(p_facture_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         montant_restant = round(v_total - coalesce(montant_paye, 0), 2),
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
$function$
;

CREATE OR REPLACE FUNCTION public.facture_lignes_integrite()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.facture_lignes_montant()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  NEW.montant := round(coalesce(NEW.quantite, 0) * coalesce(NEW.prix_unitaire, 0), 2);
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.facture_reservations_integrite()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_numero text;
begin
  select numero into v_numero from public.factures where id = OLD.facture_id;

  if v_numero is null then
    if TG_OP = 'DELETE' then return OLD; end if;
    return NEW;
  end if;

  if TG_OP = 'DELETE' then
    raise exception 'Ligne d''une facture emise (%) : suppression interdite.', v_numero;
  end if;

  if NEW.montant is distinct from OLD.montant
     or NEW.reservation_id is distinct from OLD.reservation_id
     or NEW.facture_id is distinct from OLD.facture_id then
    raise exception 'Ligne d''une facture emise (%) : montant et liens immuables.', v_numero;
  end if;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.factures_inalterabilite()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.flip_cotisation_au_paiement_reservation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c_ligne record;
  periode record;
  d_paiem date;
begin
  if (old.statut_paiement is distinct from 'paye') and (new.statut_paiement = 'paye') then
    d_paiem := coalesce(new.date_paiement, current_date);
    for c_ligne in
      select id, client_id
      from public.cotisations_membres
      where reservation_id = new.id
        and statut = 'en_attente'
    loop
      select * into periode
      from public.calculer_periode_cotisation(c_ligne.client_id, d_paiem, c_ligne.id);

      update public.cotisations_membres
      set statut        = 'payee',
          date_paiement = d_paiem,
          date_debut    = periode.date_debut,
          date_fin      = periode.date_fin
      where id = c_ligne.id;
    end loop;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and actif is not false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_personnel()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('admin','employe')
      and actif is not false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.journal_evenements_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'journal_evenements est en ajout seul : ni modification ni suppression.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.lier_client_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.clients
  set auth_user_id = new.id
  where lower(email) = lower(new.email)
    and auth_user_id is null;

  if not found then
    insert into public.clients (prenom, nom, email, auth_user_id, actif, membre)
    values ('', '', new.email, new.id, true, false)
    on conflict (email) do nothing;
  end if;

  insert into public.profiles (id, email, role, actif)
  values (new.id, new.email, 'client', true)
  on conflict (id) do nothing;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mon_employe_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from employes_rh where profile_id = auth.uid() limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.paiements_resa_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'paiements_resa est append-only : un mouvement ne peut etre ni modifie ni supprime.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.passer_ecriture(p_date date, p_libelle text, p_piece_type text, p_piece_id uuid, p_lignes jsonb, p_created_by uuid DEFAULT NULL::uuid, p_contre_passe_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ecriture_id uuid;
  v_total_debit numeric(12,2) := 0;
  v_total_credit numeric(12,2) := 0;
  v_ligne jsonb;
begin
  for v_ligne in select * from jsonb_array_elements(p_lignes) loop
    v_total_debit := v_total_debit + coalesce((v_ligne->>'debit')::numeric, 0);
    v_total_credit := v_total_credit + coalesce((v_ligne->>'credit')::numeric, 0);
  end loop;

  if round(v_total_debit, 2) <> round(v_total_credit, 2) then
    raise exception 'Ecriture desequilibree : total debit % <> total credit %', v_total_debit, v_total_credit;
  end if;
  if round(v_total_debit, 2) = 0 then
    raise exception 'Ecriture vide (montant nul)';
  end if;

  insert into public.ecritures (date_ecriture, libelle, piece_type, piece_id, exercice, created_by, contre_passe_id)
  values (p_date, p_libelle, p_piece_type, p_piece_id, extract(year from p_date)::int, p_created_by, p_contre_passe_id)
  returning id into v_ecriture_id;

  insert into public.ecritures_lignes (ecriture_id, compte_numero, debit, credit)
  select v_ecriture_id,
         (l->>'compte')::text,
         coalesce((l->>'debit')::numeric, 0),
         coalesce((l->>'credit')::numeric, 0)
  from jsonb_array_elements(p_lignes) as l;

  return v_ecriture_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.payer_reservation_avec_avoir(p_reservation_id uuid, p_client_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_resa reservations%ROWTYPE;
  v_du numeric;
  v_solde numeric;
BEGIN
  -- Sérialise les paiements par avoir d'un même client (évite la double dépense concurrente)
  PERFORM pg_advisory_xact_lock(hashtext(p_client_id::text));

  -- Verrouille la réservation ciblée
  SELECT * INTO v_resa FROM reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Réservation introuvable';
  END IF;
  IF v_resa.client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'Cette réservation n''appartient pas à ce client';
  END IF;
  IF v_resa.statut NOT IN ('validee','terminee') THEN
    RAISE EXCEPTION 'Réservation non payable (statut %)', v_resa.statut;
  END IF;

  -- montant_final, s'il est renseigné, est le montant net définitif (inclut déjà l'ajustement).
  -- Sinon repli sur montant_calcule + ajustement_manuel.
  v_du := COALESCE(v_resa.montant_final, COALESCE(v_resa.montant_calcule, 0) + COALESCE(v_resa.ajustement_manuel, 0))
        - COALESCE(v_resa.montant_paye, 0);
  IF v_du <= 0 THEN
    RAISE EXCEPTION 'Rien à payer sur cette réservation';
  END IF;

  SELECT COALESCE(SUM(montant), 0) INTO v_solde
  FROM avoirs_mouvements WHERE client_id = p_client_id;
  IF v_solde < v_du THEN
    RAISE EXCEPTION 'Solde avoir insuffisant';
  END IF;

  -- Tout-ou-rien : les trois écritures sont dans la même transaction (le corps de la fonction)
  INSERT INTO avoirs_mouvements (client_id, montant, type, motif, reservation_id)
  VALUES (p_client_id, -v_du, 'utilisation', 'Paiement réservation via avoir', p_reservation_id);

  -- Journal atomique des paiements : indispensable pour que synchroniserComptaResa
  -- impute la contrepartie avoir. Aligne le chemin client sur le chemin admin.
  INSERT INTO paiements_resa (reservation_id, client_id, date_paiement, mode, montant, motif)
  VALUES (p_reservation_id, p_client_id, current_date, 'avoir', v_du, 'Paiement par avoir (espace client)');

  UPDATE reservations
     SET montant_paye = COALESCE(montant_paye, 0) + v_du,
         statut_paiement = 'paye',
         date_paiement = current_date,
         mode_paiement = 'avoir'
   WHERE id = p_reservation_id;

  RETURN v_solde - v_du;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prochain_numero_facture(p_exercice integer, p_prefixe text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_n int;
begin
  insert into public.facture_numerotation (exercice, prefixe, prochain)
  values (p_exercice, p_prefixe, 1)
  on conflict (exercice, prefixe) do nothing;

  select prochain into v_n
    from public.facture_numerotation
   where exercice = p_exercice and prefixe = p_prefixe
     for update;

  update public.facture_numerotation
     set prochain = v_n + 1
   where exercice = p_exercice and prefixe = p_prefixe;

  return p_prefixe || '-' || p_exercice::text || '-' || lpad(v_n::text, 4, '0');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reference_qrr(p_numero text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_table int[][] := array[
    array[0,9,4,6,8,2,7,1,3,5],
    array[9,4,6,8,2,7,1,3,5,0],
    array[4,6,8,2,7,1,3,5,0,9],
    array[6,8,2,7,1,3,5,0,9,4],
    array[8,2,7,1,3,5,0,9,4,6],
    array[2,7,1,3,5,0,9,4,6,8],
    array[7,1,3,5,0,9,4,6,8,2],
    array[1,3,5,0,9,4,6,8,2,7],
    array[3,5,0,9,4,6,8,2,7,1],
    array[5,0,9,4,6,8,2,7,1,3]];
  v_chiffres text;
  v_base     text;
  v_report   int := 0;
  i          int;
begin
  v_chiffres := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
  if v_chiffres = '' then v_chiffres := '0'; end if;
  v_base := right(lpad(v_chiffres, 26, '0'), 26);

  for i in 1..26 loop
    v_report := v_table[v_report + 1][substr(v_base, i, 1)::int + 1];
  end loop;

  return v_base || ((10 - v_report) % 10)::text;
end;
$function$
;

-- ── Déclencheurs ────────────────────────────────────────────────────────

CREATE TRIGGER trg_abonnements_mouvements_append_only BEFORE DELETE OR UPDATE ON public.abonnements_mouvements FOR EACH ROW EXECUTE FUNCTION abonnements_mouvements_append_only();
CREATE TRIGGER trg_avoirs_mouvements_append_only BEFORE DELETE OR UPDATE ON public.avoirs_mouvements FOR EACH ROW EXECUTE FUNCTION avoirs_mouvements_append_only();
CREATE TRIGGER trg_chiens_flags_essai BEFORE INSERT OR UPDATE ON public.chiens FOR EACH ROW EXECUTE FUNCTION chiens_synchroniser_flags_essai();
CREATE TRIGGER trg_cotisations_membres_periode BEFORE INSERT OR UPDATE ON public.cotisations_membres FOR EACH ROW EXECUTE FUNCTION cotisations_membres_synchroniser_periode();
CREATE TRIGGER trg_ecritures_append_only BEFORE DELETE OR UPDATE ON public.ecritures FOR EACH ROW EXECUTE FUNCTION ecritures_append_only();
CREATE TRIGGER trg_ecritures_bloc_exercice_cloture BEFORE INSERT ON public.ecritures FOR EACH ROW EXECUTE FUNCTION bloquer_ecriture_exercice_cloture();
CREATE TRIGGER trg_ecritures_lignes_append_only BEFORE DELETE OR UPDATE ON public.ecritures_lignes FOR EACH ROW EXECUTE FUNCTION ecritures_append_only();
CREATE TRIGGER trg_facture_lignes_integrite BEFORE DELETE OR UPDATE ON public.facture_lignes FOR EACH ROW EXECUTE FUNCTION facture_lignes_integrite();
CREATE TRIGGER trg_facture_lignes_montant BEFORE INSERT OR UPDATE ON public.facture_lignes FOR EACH ROW EXECUTE FUNCTION facture_lignes_montant();
CREATE TRIGGER trg_facture_reservations_integrite BEFORE DELETE OR UPDATE ON public.facture_reservations FOR EACH ROW EXECUTE FUNCTION facture_reservations_integrite();
CREATE TRIGGER trg_factures_inalterabilite BEFORE DELETE OR UPDATE ON public.factures FOR EACH ROW EXECUTE FUNCTION factures_inalterabilite();
CREATE TRIGGER trg_journal_evenements_append_only BEFORE DELETE OR UPDATE ON public.journal_evenements FOR EACH ROW EXECUTE FUNCTION journal_evenements_append_only();
CREATE TRIGGER trg_occupation_boxes_anti_surbooking BEFORE INSERT ON public.occupation_boxes FOR EACH ROW EXECUTE FUNCTION bloquer_surbooking_box();
CREATE TRIGGER trg_paiements_resa_anti_doublon BEFORE INSERT ON public.paiements_resa FOR EACH ROW EXECUTE FUNCTION bloquer_doublon_paiement_resa();
CREATE TRIGGER trg_paiements_resa_append_only BEFORE DELETE OR UPDATE ON public.paiements_resa FOR EACH ROW EXECUTE FUNCTION paiements_resa_append_only();
CREATE TRIGGER trg_flip_cotisation_au_paiement AFTER UPDATE OF statut_paiement ON public.reservations FOR EACH ROW EXECUTE FUNCTION flip_cotisation_au_paiement_reservation();

-- ── Sécurité au niveau ligne ────────────────────────────────────────────

alter table public.abonnements enable row level security;
alter table public.abonnements_mouvements enable row level security;
alter table public.avoirs_mouvements enable row level security;
alter table public.box_indisponibilites enable row level security;
alter table public.boxes enable row level security;
alter table public.calendrier_essais enable row level security;
alter table public.chaleurs enable row level security;
alter table public.checkin_checkout enable row level security;
alter table public.chiens enable row level security;
alter table public.clients enable row level security;
alter table public.comptes enable row level security;
alter table public.contacts_urgence enable row level security;
alter table public.cotisations_membres enable row level security;
alter table public.demandes_vacances enable row level security;
alter table public.ecritures enable row level security;
alter table public.ecritures_lignes enable row level security;
alter table public.emails_campagnes enable row level security;
alter table public.emails_envoyes enable row level security;
alter table public.employes_rh enable row level security;
alter table public.ententes_chiens enable row level security;
alter table public.exercices enable row level security;
alter table public.facture_lignes enable row level security;
alter table public.facture_numerotation enable row level security;
alter table public.facture_reservations enable row level security;
alter table public.factures enable row level security;
alter table public.fermetures_essai enable row level security;
alter table public.fermetures_exceptionnelles enable row level security;
alter table public.fiche_salaire_deductions enable row level security;
alter table public.fiches_salaire enable row level security;
alter table public.indisponibilites enable row level security;
alter table public.journal_evenements enable row level security;
alter table public.jours_feries enable row level security;
alter table public.liste_attente enable row level security;
alter table public.modeles_deductions enable row level security;
alter table public.modeles_email enable row level security;
alter table public.occupation_boxes enable row level security;
alter table public.paiements_resa enable row level security;
alter table public.parametres enable row level security;
alter table public.photos_chiens enable row level security;
alter table public.planning_employes enable row level security;
alter table public.profiles enable row level security;
alter table public.reservation_chiens enable row level security;
alter table public.reservation_extras enable row level security;
alter table public.reservations enable row level security;
alter table public.services_supplementaires enable row level security;
alter table public.tarifs enable row level security;
alter table public.timbrage enable row level security;
alter table public.vacances_scolaires enable row level security;
alter table public.vaccins enable row level security;

create policy admin_all_abonnements on public.abonnements as PERMISSIVE for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy client_select_abonnements on public.abonnements as PERMISSIVE for SELECT to authenticated using ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = ( SELECT auth.uid() AS uid)))));
create policy personnel_select_abonnements on public.abonnements as PERMISSIVE for SELECT to authenticated using (( SELECT is_personnel() AS is_personnel));
create policy admin_all_abonnements_mouvements on public.abonnements_mouvements as PERMISSIVE for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy client_select_abonnements_mouvements on public.abonnements_mouvements as PERMISSIVE for SELECT to authenticated using ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = ( SELECT auth.uid() AS uid)))));
create policy personnel_select_abonnements_mouvements on public.abonnements_mouvements as PERMISSIVE for SELECT to authenticated using (( SELECT is_personnel() AS is_personnel));
create policy admin_all_avoirs_mouvements on public.avoirs_mouvements as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy client_select_avoirs_mouvements on public.avoirs_mouvements as PERMISSIVE for SELECT to authenticated using ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = ( SELECT auth.uid() AS uid)))));
create policy admin_all_box_indisponibilites on public.box_indisponibilites as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy personnel_select_box_indisponibilites on public.box_indisponibilites as PERMISSIVE for SELECT to authenticated using (is_personnel());
create policy admin_all_boxes on public.boxes as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy personnel_select_boxes on public.boxes as PERMISSIVE for SELECT to authenticated using (is_personnel());
create policy admin_all_calendrier_essais on public.calendrier_essais as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy personnel_select_calendrier_essais on public.calendrier_essais as PERMISSIVE for SELECT to authenticated using ((is_admin() OR is_personnel()));
create policy admin_all_chaleurs on public.chaleurs as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy admin_all_checkin_checkout on public.checkin_checkout as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy admin_all_chiens on public.chiens as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy client_select_chiens on public.chiens as PERMISSIVE for SELECT to authenticated using ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = ( SELECT auth.uid() AS uid)))));
create policy personnel_select_chiens on public.chiens as PERMISSIVE for SELECT to authenticated using (is_personnel());
create policy admin_all_clients on public.clients as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy client_self_select on public.clients as PERMISSIVE for SELECT to authenticated using ((auth_user_id = ( SELECT auth.uid() AS uid)));
create policy personnel_select_clients on public.clients as PERMISSIVE for SELECT to authenticated using (is_personnel());
create policy admin_all_contacts_urgence on public.contacts_urgence as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy admin_all_cotisations_membres on public.cotisations_membres as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy admin_all_demandes_vacances on public.demandes_vacances as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy employe_insert_vacances on public.demandes_vacances as PERMISSIVE for INSERT to authenticated with check ((employe_id = ( SELECT mon_employe_id() AS mon_employe_id)));
create policy employe_self_select_vacances on public.demandes_vacances as PERMISSIVE for SELECT to authenticated using ((employe_id = ( SELECT mon_employe_id() AS mon_employe_id)));
create policy employe_update_vacances on public.demandes_vacances as PERMISSIVE for UPDATE to authenticated using ((employe_id = ( SELECT mon_employe_id() AS mon_employe_id))) with check ((employe_id = ( SELECT mon_employe_id() AS mon_employe_id)));
create policy admin_all_emails_campagnes on public.emails_campagnes as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy admin_all_emails_envoyes on public.emails_envoyes as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy admin_all_employes_rh on public.employes_rh as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy employe_self_select_employes_rh on public.employes_rh as PERMISSIVE for SELECT to authenticated using ((profile_id = ( SELECT auth.uid() AS uid)));
create policy admin_all_ententes_chiens on public.ententes_chiens as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy admin_all_facture_lignes on public.facture_lignes as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy client_select_facture_lignes on public.facture_lignes as PERMISSIVE for SELECT to authenticated using ((facture_id IN ( SELECT f.id
   FROM (factures f
     JOIN clients c ON ((c.id = f.client_id)))
  WHERE (c.auth_user_id = ( SELECT auth.uid() AS uid)))));
create policy admin_all_facture_numerotation on public.facture_numerotation as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy admin_all_facture_reservations on public.facture_reservations as PERMISSIVE for ALL to authenticated using (is_admin());
create policy admin_all_factures on public.factures as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy client_select_factures on public.factures as PERMISSIVE for SELECT to authenticated using ((client_id IN ( SELECT c.id
   FROM clients c
  WHERE (c.auth_user_id = ( SELECT auth.uid() AS uid)))));
create policy admin_all_fermetures_exceptionnelles on public.fermetures_exceptionnelles as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy admin_all_fiche_salaire_deductions on public.fiche_salaire_deductions as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy employe_self_select_fiche_deductions on public.fiche_salaire_deductions as PERMISSIVE for SELECT to authenticated using ((fiche_id IN ( SELECT fiches_salaire.id
   FROM fiches_salaire
  WHERE (fiches_salaire.employe_id = ( SELECT mon_employe_id() AS mon_employe_id)))));
create policy admin_all_fiches_salaire on public.fiches_salaire as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy employe_self_select_fiches_salaire on public.fiches_salaire as PERMISSIVE for SELECT to authenticated using ((employe_id = ( SELECT mon_employe_id() AS mon_employe_id)));
create policy admin_all_indisponibilites on public.indisponibilites as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy employe_delete_indispo on public.indisponibilites as PERMISSIVE for DELETE to authenticated using ((employe_id = ( SELECT mon_employe_id() AS mon_employe_id)));
create policy employe_insert_indispo on public.indisponibilites as PERMISSIVE for INSERT to authenticated with check ((employe_id = ( SELECT mon_employe_id() AS mon_employe_id)));
create policy employe_self_select_indispo on public.indisponibilites as PERMISSIVE for SELECT to authenticated using ((employe_id = ( SELECT mon_employe_id() AS mon_employe_id)));
create policy employe_update_indispo on public.indisponibilites as PERMISSIVE for UPDATE to authenticated using ((employe_id = ( SELECT mon_employe_id() AS mon_employe_id))) with check ((employe_id = ( SELECT mon_employe_id() AS mon_employe_id)));
create policy admin_all_journal_evenements on public.journal_evenements as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy admin_all_jours_feries on public.jours_feries as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy admin_all_liste_attente on public.liste_attente as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy admin_all_modeles_deductions on public.modeles_deductions as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy admin_all_modeles_email on public.modeles_email as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy admin_all_occupation_boxes on public.occupation_boxes as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy personnel_select_occupation_boxes on public.occupation_boxes as PERMISSIVE for SELECT to authenticated using (is_personnel());
create policy admin_all_parametres on public.parametres as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy personnel_select_parametres on public.parametres as PERMISSIVE for SELECT to authenticated using (is_personnel());
create policy admin_all_photos_chiens on public.photos_chiens as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy admin_all_planning_employes on public.planning_employes as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy employe_self_select_planning on public.planning_employes as PERMISSIVE for SELECT to authenticated using ((employe_id = ( SELECT mon_employe_id() AS mon_employe_id)));
create policy personnel_select_planning on public.planning_employes as PERMISSIVE for SELECT to authenticated using (is_personnel());
create policy admin_all_profiles on public.profiles as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy self_read_profiles on public.profiles as PERMISSIVE for SELECT to authenticated using ((id = ( SELECT auth.uid() AS uid)));
create policy admin_all_reservation_chiens on public.reservation_chiens as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy client_select_reservation_chiens on public.reservation_chiens as PERMISSIVE for SELECT to authenticated using ((reservation_id IN ( SELECT r.id
   FROM reservations r
  WHERE (r.client_id IN ( SELECT c.id
           FROM clients c
          WHERE (c.auth_user_id = ( SELECT auth.uid() AS uid)))))));
create policy admin_all_reservation_extras on public.reservation_extras as PERMISSIVE for ALL to authenticated using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy client_select_reservation_extras on public.reservation_extras as PERMISSIVE for SELECT to authenticated using ((reservation_id IN ( SELECT r.id
   FROM reservations r
  WHERE (r.client_id IN ( SELECT c.id
           FROM clients c
          WHERE (c.auth_user_id = ( SELECT auth.uid() AS uid)))))));
create policy admin_all_reservations on public.reservations as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy client_select_reservations on public.reservations as PERMISSIVE for SELECT to authenticated using ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = ( SELECT auth.uid() AS uid)))));
create policy personnel_select_reservations on public.reservations as PERMISSIVE for SELECT to authenticated using (is_personnel());
create policy admin_all_services_supplementaires on public.services_supplementaires as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy admin_all_tarifs on public.tarifs as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy personnel_select_tarifs on public.tarifs as PERMISSIVE for SELECT to authenticated using (is_personnel());
create policy admin_all_timbrage on public.timbrage as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy employe_insert_timbrage on public.timbrage as PERMISSIVE for INSERT to authenticated with check ((employe_id = ( SELECT mon_employe_id() AS mon_employe_id)));
create policy employe_self_select_timbrage on public.timbrage as PERMISSIVE for SELECT to authenticated using ((employe_id = ( SELECT mon_employe_id() AS mon_employe_id)));
create policy employe_update_timbrage on public.timbrage as PERMISSIVE for UPDATE to authenticated using ((employe_id = ( SELECT mon_employe_id() AS mon_employe_id))) with check ((employe_id = ( SELECT mon_employe_id() AS mon_employe_id)));
create policy admin_all_vacances_scolaires on public.vacances_scolaires as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy admin_all_vaccins on public.vaccins as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());

-- ── Droits sur les fonctions SECURITY DEFINER ───────────────────────────

revoke all on function public.acomptes_a_imputer(p_facture_id uuid) from anon, authenticated;
revoke all on function public.bloquer_ecriture_exercice_cloture() from anon, authenticated;
revoke all on function public.bloquer_surbooking_box() from anon, authenticated;
revoke all on function public.emettre_facture(p_facture_id uuid, p_user_id uuid) from anon, authenticated;
revoke all on function public.flip_cotisation_au_paiement_reservation() from anon, authenticated;
revoke all on function public.handle_new_user() from anon, authenticated;
revoke all on function public.is_admin() from anon, authenticated;
revoke all on function public.is_personnel() from anon, authenticated;
revoke all on function public.lier_client_auth() from anon, authenticated;
revoke all on function public.mon_employe_id() from anon, authenticated;
revoke all on function public.passer_ecriture(p_date date, p_libelle text, p_piece_type text, p_piece_id uuid, p_lignes jsonb, p_created_by uuid, p_contre_passe_id uuid) from anon, authenticated;
revoke all on function public.payer_reservation_avec_avoir(p_reservation_id uuid, p_client_id uuid) from anon, authenticated;
revoke all on function public.prochain_numero_facture(p_exercice integer, p_prefixe text) from anon, authenticated;
