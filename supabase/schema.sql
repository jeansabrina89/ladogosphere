-- Schema snapshot generated from production Supabase project lljxyrbocdqerricggfc
-- Generated: 2026-06-24
-- Schema only, no data

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA extensions;

-- Sequences
CREATE SEQUENCE IF NOT EXISTS public.factures_numero_seq
    START WITH 1
    INCREMENT BY 1
    MINVALUE 1
    MAXVALUE 9223372036854775807
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.reservations_numero_seq
    START WITH 1
    INCREMENT BY 1
    MINVALUE 1
    MAXVALUE 2147483647
    CACHE 1;

-- Tables
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid NOT NULL,
    email text,
    nom text,
    prenom text,
    role text DEFAULT 'client'::text,
    actif boolean DEFAULT true,
    perm_checkin boolean DEFAULT true,
    perm_reservations_creer boolean DEFAULT true,
    perm_reservations_modifier boolean DEFAULT true,
    perm_reservations_annuler boolean DEFAULT true,
    perm_clients_creer boolean DEFAULT true,
    perm_clients_modifier boolean DEFAULT true,
    perm_chiens_modifier boolean DEFAULT true,
    perm_planning boolean DEFAULT true,
    perm_tarifs_urgence boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    perm_chiens_creer boolean DEFAULT true NOT NULL,
    perm_journee_essai boolean DEFAULT true NOT NULL,
    perm_encaissements boolean DEFAULT true NOT NULL,
    perm_box boolean DEFAULT true NOT NULL,
    perm_timbrage_equipe boolean DEFAULT false NOT NULL,
    perm_vacances_equipe boolean DEFAULT false NOT NULL,
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'employe'::text, 'client'::text])))
);

CREATE TABLE IF NOT EXISTS public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nom text NOT NULL,
    prenom text NOT NULL,
    email text NOT NULL,
    telephone text,
    adresse text,
    membre boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    actif boolean DEFAULT true,
    auth_user_id uuid,
    contact_urgence_nom text,
    contact_urgence_prenom text,
    contact_urgence_telephone text,
    cotisation_exemptee boolean DEFAULT false NOT NULL,
    cotisation_exemptee_raison text,
    CONSTRAINT clients_pkey PRIMARY KEY (id),
    CONSTRAINT clients_email_key UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS public.comptes (
    numero text NOT NULL,
    libelle text NOT NULL,
    type text NOT NULL,
    actif boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT comptes_pkey PRIMARY KEY (numero),
    CONSTRAINT comptes_type_check CHECK ((type = ANY (ARRAY['actif'::text, 'passif'::text, 'produit'::text, 'charge'::text])))
);

CREATE TABLE IF NOT EXISTS public.exercices (
    annee integer NOT NULL,
    statut text DEFAULT 'ouvert'::text NOT NULL,
    date_cloture timestamptz,
    cloture_par uuid,
    resultat numeric,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT exercices_pkey PRIMARY KEY (annee),
    CONSTRAINT exercices_statut_check CHECK ((statut = ANY (ARRAY['ouvert'::text, 'cloture'::text])))
);

CREATE TABLE IF NOT EXISTS public.boxes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero integer NOT NULL,
    actif boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    capacite_standard integer DEFAULT 2,
    capacite_petits_chiens integer DEFAULT 4,
    notes text,
    nom text,
    CONSTRAINT boxes_pkey PRIMARY KEY (id),
    CONSTRAINT boxes_numero_key UNIQUE (numero)
);

CREATE TABLE IF NOT EXISTS public.services_supplementaires (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nom text NOT NULL,
    prix numeric,
    prix_variable boolean DEFAULT false,
    actif boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT services_supplementaires_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    type_reservation text NOT NULL,
    statut text DEFAULT 'en_attente'::text NOT NULL,
    date_debut date NOT NULL,
    date_fin date NOT NULL,
    heure_arrivee time,
    heure_depart time,
    box_id uuid,
    urgence boolean DEFAULT false,
    montant_calcule numeric DEFAULT 0,
    montant_final numeric DEFAULT 0,
    commentaire_admin text,
    created_at timestamptz DEFAULT now(),
    statut_paiement text DEFAULT 'impaye'::text,
    montant_paye numeric DEFAULT 0,
    date_paiement date,
    mode_paiement text,
    numero integer DEFAULT nextval('reservations_numero_seq'::regclass) NOT NULL,
    ajustement_manuel numeric DEFAULT 0 NOT NULL,
    commentaire_client text,
    offerte boolean DEFAULT false NOT NULL,
    compta_synchronisee boolean DEFAULT true NOT NULL,
    compta_erreur text,
    compta_sync_at timestamptz,
    CONSTRAINT reservations_pkey PRIMARY KEY (id),
    CONSTRAINT reservations_mode_paiement_check CHECK ((mode_paiement = ANY (ARRAY['twint'::text, 'cash'::text, 'iban'::text, 'stripe'::text, 'autre'::text, 'avoir'::text]))),
    CONSTRAINT reservations_statut_check CHECK ((statut = ANY (ARRAY['en_attente'::text, 'validee'::text, 'refusee'::text, 'annulee'::text, 'terminee'::text]))),
    CONSTRAINT reservations_statut_paiement_check CHECK ((statut_paiement = ANY (ARRAY['impaye'::text, 'partiel'::text, 'paye'::text]))),
    CONSTRAINT reservations_type_reservation_check CHECK ((type_reservation = ANY (ARRAY['journee'::text, 'sejour'::text, 'essai'::text])))
);

CREATE TABLE IF NOT EXISTS public.factures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero text,
    client_id uuid,
    reservation_id uuid,
    type_facture text DEFAULT 'reservation'::text,
    date_facture date DEFAULT CURRENT_DATE,
    montant_total numeric DEFAULT 0,
    montant_paye numeric DEFAULT 0,
    montant_restant numeric DEFAULT 0,
    statut text DEFAULT 'brouillon'::text,
    arrangement_paiement boolean DEFAULT false,
    notes_arrangement text,
    date_premier_rappel date,
    date_deuxieme_rappel date,
    premier_rappel_envoye boolean DEFAULT false,
    deuxieme_rappel_envoye boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    reference_qr text,
    CONSTRAINT factures_pkey PRIMARY KEY (id),
    CONSTRAINT factures_numero_key UNIQUE (numero),
    CONSTRAINT factures_statut_check CHECK ((statut = ANY (ARRAY['brouillon'::text, 'envoyee'::text, 'partiellement_reglee'::text, 'arrangement_paiement'::text, 'acquittee'::text, 'annulee'::text]))),
    CONSTRAINT factures_type_facture_check CHECK ((type_facture = ANY (ARRAY['reservation'::text, 'adhesion'::text, 'service'::text])))
);

CREATE TABLE IF NOT EXISTS public.paiements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    facture_id uuid,
    date_paiement date DEFAULT CURRENT_DATE,
    mode_paiement text NOT NULL,
    montant numeric NOT NULL,
    commentaire text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT paiements_pkey PRIMARY KEY (id),
    CONSTRAINT paiements_mode_paiement_check CHECK ((mode_paiement = ANY (ARRAY['stripe'::text, 'twint'::text, 'qr_iban'::text, 'especes'::text])))
);

CREATE TABLE IF NOT EXISTS public.ecritures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date_ecriture date NOT NULL,
    libelle text NOT NULL,
    piece_type text,
    piece_id uuid,
    exercice integer NOT NULL,
    contre_passe_id uuid,
    created_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT ecritures_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.adhesions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    annee integer NOT NULL,
    montant numeric DEFAULT 180,
    facture_id uuid,
    payee boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT adhesions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.avoirs_mouvements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    montant numeric NOT NULL,
    type text NOT NULL,
    motif text,
    reservation_id uuid,
    facture_id uuid,
    paiement_id uuid,
    created_by uuid,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT avoirs_mouvements_pkey PRIMARY KEY (id),
    CONSTRAINT avoirs_mouvements_type_check CHECK ((type = ANY (ARRAY['ajout_manuel'::text, 'retrait_manuel'::text, 'annulation_paiement'::text, 'utilisation'::text, 'trop_percu'::text, 'reprise'::text, 'mise_en_avoir'::text])))
);

CREATE TABLE IF NOT EXISTS public.box_indisponibilites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    box_id uuid NOT NULL,
    date_debut date NOT NULL,
    date_fin date NOT NULL,
    motif text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT box_indisponibilites_pkey PRIMARY KEY (id),
    CONSTRAINT box_indispo_dates_coherentes CHECK ((date_fin >= date_debut))
);

CREATE TABLE IF NOT EXISTS public.calendrier_essais (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date_essai date NOT NULL,
    disponible boolean DEFAULT true,
    fermeture_manuelle boolean DEFAULT false,
    commentaire text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT calendrier_essais_pkey PRIMARY KEY (id),
    CONSTRAINT calendrier_essais_date_essai_key UNIQUE (date_essai)
);

CREATE TABLE IF NOT EXISTS public.chaleurs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chien_id uuid,
    date_debut date NOT NULL,
    date_fin date NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT chaleurs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.checkin_checkout (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reservation_id uuid,
    chien_id uuid,
    date_arrivee_prevue timestamp without time zone,
    date_arrivee_reelle timestamp without time zone,
    date_depart_prevu timestamp without time zone,
    date_depart_reel timestamp without time zone,
    statut text DEFAULT 'attendu'::text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT checkin_checkout_pkey PRIMARY KEY (id),
    CONSTRAINT checkin_checkout_statut_check CHECK ((statut = ANY (ARRAY['attendu'::text, 'arrive'::text, 'a_recuperer'::text, 'parti'::text])))
);

CREATE TABLE IF NOT EXISTS public.chiens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    nom text NOT NULL,
    race text,
    couleur text,
    date_naissance date,
    sexe text,
    sterilise boolean DEFAULT false,
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
    actif boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    statut_essai text DEFAULT 'non_programme'::text,
    compatible_males_castres boolean DEFAULT false,
    compatible_males_entiers boolean DEFAULT false,
    compatible_femelles_sterilisees boolean DEFAULT false,
    compatible_femelles_entieres boolean DEFAULT false,
    compatible_moins_15kg boolean DEFAULT false,
    compatible_15_30kg boolean DEFAULT false,
    compatible_30_40kg boolean DEFAULT false,
    notes_essai text,
    niveau_energie text,
    male_non_castre boolean DEFAULT false,
    en_chaleurs boolean DEFAULT false,
    chien_decede boolean DEFAULT false,
    protection_ressources boolean DEFAULT false,
    destructeur boolean DEFAULT false,
    craintif boolean DEFAULT false,
    comportement_autre text,
    journee_essai_effectuee boolean DEFAULT false,
    journee_essai_invalide boolean DEFAULT false,
    journee_essai_note text,
    veterinaire_nom text,
    veterinaire_telephone text,
    sterilisation text DEFAULT 'non'::text,
    doit_etre_isole boolean DEFAULT false NOT NULL,
    CONSTRAINT chiens_pkey PRIMARY KEY (id),
    CONSTRAINT chiens_categorie_poids_check CHECK ((categorie_poids = ANY (ARRAY['moins_15kg'::text, '15_30kg'::text, '30_40kg'::text]))),
    CONSTRAINT chiens_hebergement_autorise_check CHECK ((hebergement_autorise = ANY (ARRAY['partage_autorise'::text, 'privatif_obligatoire'::text]))),
    CONSTRAINT chiens_sexe_check CHECK ((sexe = ANY (ARRAY['M'::text, 'F'::text]))),
    CONSTRAINT chiens_statut_essai_check CHECK ((statut_essai = ANY (ARRAY['non_programme'::text, 'programme'::text, 'valide'::text, 'refuse'::text]))),
    CONSTRAINT chiens_sterilisation_check CHECK ((sterilisation = ANY (ARRAY['oui'::text, 'non'::text, 'chimique'::text])))
);

CREATE TABLE IF NOT EXISTS public.contacts_urgence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    nom text,
    prenom text,
    telephone text,
    email text,
    adresse text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT contacts_urgence_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.cotisations_membres (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    annee integer NOT NULL,
    montant numeric DEFAULT 180 NOT NULL,
    mode_paiement text,
    statut text DEFAULT 'payee'::text,
    date_paiement date,
    reservation_id uuid,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT cotisations_membres_pkey PRIMARY KEY (id),
    CONSTRAINT cotisations_membres_client_id_annee_key UNIQUE (client_id, annee),
    CONSTRAINT cotisations_membres_mode_paiement_check CHECK ((mode_paiement = ANY (ARRAY['cash'::text, 'virement'::text, 'prochaine_resa'::text]))),
    CONSTRAINT cotisations_membres_statut_check CHECK ((statut = ANY (ARRAY['payee'::text, 'en_attente'::text])))
);

CREATE TABLE IF NOT EXISTS public.demandes_vacances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employe_id uuid,
    date_debut date NOT NULL,
    date_fin date NOT NULL,
    nb_jours numeric NOT NULL,
    statut text DEFAULT 'en_attente'::text,
    note_employe text,
    note_admin text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT demandes_vacances_pkey PRIMARY KEY (id),
    CONSTRAINT demandes_vacances_statut_check CHECK ((statut = ANY (ARRAY['en_attente'::text, 'acceptee'::text, 'refusee'::text])))
);

CREATE TABLE IF NOT EXISTS public.ecritures_lignes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ecriture_id uuid NOT NULL,
    compte_numero text NOT NULL,
    debit numeric DEFAULT 0 NOT NULL,
    credit numeric DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT ecritures_lignes_pkey PRIMARY KEY (id),
    CONSTRAINT ecritures_lignes_credit_check CHECK ((credit >= (0)::numeric)),
    CONSTRAINT ecritures_lignes_debit_check CHECK ((debit >= (0)::numeric)),
    CONSTRAINT ligne_debit_xor_credit CHECK ((NOT ((debit > (0)::numeric) AND (credit > (0)::numeric))))
);

CREATE TABLE IF NOT EXISTS public.emails_envoyes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    destinataire text NOT NULL,
    type text NOT NULL,
    sujet text,
    statut text DEFAULT 'envoye'::text NOT NULL,
    resend_id text,
    erreur text,
    reservation_id uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT emails_envoyes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.employes_rh (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid,
    prenom text NOT NULL,
    nom text NOT NULL,
    email text NOT NULL,
    taux_travail integer DEFAULT 100 NOT NULL,
    salaire_base numeric NOT NULL,
    date_entree date NOT NULL,
    date_sortie date,
    actif boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    poste text DEFAULT 'Auxiliaire'::text,
    poste_autre text,
    adresse text,
    telephone text,
    numero_avs text,
    date_naissance date,
    CONSTRAINT employes_rh_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.ententes_chiens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chien_id uuid NOT NULL,
    chien_cible_id uuid NOT NULL,
    type text NOT NULL,
    note text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT ententes_chiens_pkey PRIMARY KEY (id),
    CONSTRAINT ententes_chiens_chien_id_chien_cible_id_key UNIQUE (chien_id, chien_cible_id),
    CONSTRAINT ententes_chiens_type_check CHECK ((type = ANY (ARRAY['positif'::text, 'negatif'::text, 'box_compatible'::text, 'famille_uniquement'::text])))
);

CREATE TABLE IF NOT EXISTS public.facture_reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    facture_id uuid NOT NULL,
    reservation_id uuid NOT NULL,
    montant numeric DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now(),
    facture_annulee boolean DEFAULT false NOT NULL,
    CONSTRAINT facture_reservations_pkey PRIMARY KEY (id),
    CONSTRAINT facture_reservations_facture_id_reservation_id_key UNIQUE (facture_id, reservation_id)
);

CREATE TABLE IF NOT EXISTS public.facture_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    facture_id uuid,
    service_id uuid,
    description text,
    quantite numeric DEFAULT 1,
    prix_unitaire numeric DEFAULT 0,
    montant_total numeric DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT facture_services_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.fermetures_essai (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date_debut date NOT NULL,
    date_fin date NOT NULL,
    motif text,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT fermetures_essai_pkey PRIMARY KEY (id),
    CONSTRAINT fermetures_essai_dates_ok CHECK ((date_fin >= date_debut))
);

CREATE TABLE IF NOT EXISTS public.fermetures_exceptionnelles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date_debut date NOT NULL,
    date_fin date NOT NULL,
    motif text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT fermetures_exceptionnelles_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.fiche_salaire_deductions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fiche_id uuid,
    label text NOT NULL,
    type text NOT NULL,
    valeur numeric NOT NULL,
    montant_calcule numeric NOT NULL,
    ordre integer DEFAULT 0,
    CONSTRAINT fiche_salaire_deductions_pkey PRIMARY KEY (id),
    CONSTRAINT fiche_salaire_deductions_type_check CHECK ((type = ANY (ARRAY['pourcentage'::text, 'montant_fixe'::text])))
);

CREATE TABLE IF NOT EXISTS public.fiches_salaire (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employe_id uuid,
    mois integer NOT NULL,
    annee integer NOT NULL,
    salaire_brut numeric NOT NULL,
    salaire_net numeric NOT NULL,
    total_deductions numeric NOT NULL,
    commentaire text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT fiches_salaire_pkey PRIMARY KEY (id),
    CONSTRAINT fiches_salaire_employe_id_mois_annee_key UNIQUE (employe_id, mois, annee)
);

CREATE TABLE IF NOT EXISTS public.indisponibilites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employe_id uuid,
    date date NOT NULL,
    note text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT indisponibilites_pkey PRIMARY KEY (id),
    CONSTRAINT indisponibilites_employe_id_date_key UNIQUE (employe_id, date)
);

CREATE TABLE IF NOT EXISTS public.jours_feries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nom text NOT NULL,
    date_ferie date NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT jours_feries_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.liste_attente (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    chien_id uuid,
    date_debut date NOT NULL,
    date_fin date NOT NULL,
    type_reservation text,
    commentaire text,
    notifie boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT liste_attente_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.modeles_deductions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    type text NOT NULL,
    valeur numeric NOT NULL,
    actif boolean DEFAULT true,
    ordre integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT modeles_deductions_pkey PRIMARY KEY (id),
    CONSTRAINT modeles_deductions_type_check CHECK ((type = ANY (ARRAY['pourcentage'::text, 'montant_fixe'::text])))
);

CREATE TABLE IF NOT EXISTS public.occupation_boxes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    box_id uuid,
    chien_id uuid,
    reservation_id uuid,
    date_debut date NOT NULL,
    date_fin date NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT occupation_boxes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.paiements_resa (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reservation_id uuid NOT NULL,
    client_id uuid,
    date_paiement date DEFAULT CURRENT_DATE NOT NULL,
    mode text NOT NULL,
    montant numeric NOT NULL,
    motif text,
    created_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    cle_idempotence text,
    CONSTRAINT paiements_resa_pkey PRIMARY KEY (id),
    CONSTRAINT paiements_resa_mode_check CHECK ((mode = ANY (ARRAY['cash'::text, 'twint'::text, 'stripe'::text, 'virement'::text, 'avoir'::text])))
);

CREATE TABLE IF NOT EXISTS public.parametres (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cle text NOT NULL,
    valeur text NOT NULL,
    description text,
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT parametres_pkey PRIMARY KEY (id),
    CONSTRAINT parametres_cle_key UNIQUE (cle)
);

CREATE TABLE IF NOT EXISTS public.parametres_generaux (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date_ouverture date DEFAULT '2027-03-01'::date,
    delai_premier_rappel integer DEFAULT 30,
    delai_deuxieme_rappel integer DEFAULT 45,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT parametres_generaux_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.photos_chiens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chien_id uuid,
    image_url text NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT photos_chiens_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.planning_employes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employe_id uuid,
    date date NOT NULL,
    statut text DEFAULT 'travail'::text NOT NULL,
    note text,
    valide boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT planning_employes_pkey PRIMARY KEY (id),
    CONSTRAINT planning_employes_employe_id_date_key UNIQUE (employe_id, date),
    CONSTRAINT planning_employes_statut_check CHECK ((statut = ANY (ARRAY['travail'::text, 'repos'::text, 'vacances'::text, 'repos_vacances'::text, 'maladie'::text, 'accident'::text, 'militaire'::text, 'ferie'::text, 'ferie_travaille'::text, 'absent'::text, 'heures_sup'::text, 'autre'::text])))
);

CREATE TABLE IF NOT EXISTS public.recus (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero text,
    facture_id uuid,
    paiement_id uuid,
    date_recu date DEFAULT CURRENT_DATE,
    montant numeric NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT recus_pkey PRIMARY KEY (id),
    CONSTRAINT recus_numero_key UNIQUE (numero)
);

CREATE TABLE IF NOT EXISTS public.reservation_chiens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reservation_id uuid,
    chien_id uuid,
    CONSTRAINT reservation_chiens_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.reservation_extras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reservation_id uuid NOT NULL,
    libelle text NOT NULL,
    montant numeric DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT reservation_extras_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tarifs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actif boolean DEFAULT true,
    categorie text NOT NULL,
    membre boolean DEFAULT false,
    prix numeric NOT NULL,
    created_at timestamptz DEFAULT now(),
    annee integer DEFAULT 2026,
    CONSTRAINT tarifs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.timbrage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employe_id uuid,
    date date NOT NULL,
    heure_debut_matin time DEFAULT '07:30:00'::time without time zone,
    heure_fin_matin time DEFAULT '12:00:00'::time without time zone,
    heure_debut_aprem time DEFAULT '14:30:00'::time without time zone,
    heure_fin_aprem time DEFAULT '18:30:00'::time without time zone,
    type_absence text,
    note text,
    valide_admin boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT timbrage_pkey PRIMARY KEY (id),
    CONSTRAINT timbrage_employe_id_date_key UNIQUE (employe_id, date),
    CONSTRAINT timbrage_type_absence_check CHECK ((type_absence = ANY (ARRAY['maladie'::text, 'accident'::text, 'militaire'::text, 'vacances'::text, 'ferie'::text, 'autre'::text])))
);

CREATE TABLE IF NOT EXISTS public.vacances_scolaires (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nom text NOT NULL,
    date_debut date NOT NULL,
    date_fin date NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT vacances_scolaires_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.vaccins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chien_id uuid,
    type_vaccin text,
    date_vaccin date,
    date_expiration date,
    document_url text,
    valide_admin boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT vaccins_pkey PRIMARY KEY (id),
    CONSTRAINT vaccins_type_vaccin_check CHECK ((type_vaccin = ANY (ARRAY['DHPPI'::text, 'LEPTO'::text, 'KC_ORAL'::text])))
);

-- Foreign key constraints
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id);
ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_box_id_fkey FOREIGN KEY (box_id) REFERENCES boxes(id);
ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.factures
    ADD CONSTRAINT factures_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.factures
    ADD CONSTRAINT factures_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.paiements
    ADD CONSTRAINT paiements_facture_id_fkey FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ecritures
    ADD CONSTRAINT ecritures_contre_passe_id_fkey FOREIGN KEY (contre_passe_id) REFERENCES ecritures(id);
ALTER TABLE ONLY public.adhesions
    ADD CONSTRAINT adhesions_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.avoirs_mouvements
    ADD CONSTRAINT avoirs_mouvements_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.avoirs_mouvements
    ADD CONSTRAINT avoirs_mouvements_facture_id_fkey FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.avoirs_mouvements
    ADD CONSTRAINT avoirs_mouvements_paiement_id_fkey FOREIGN KEY (paiement_id) REFERENCES paiements(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.avoirs_mouvements
    ADD CONSTRAINT avoirs_mouvements_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.box_indisponibilites
    ADD CONSTRAINT box_indisponibilites_box_id_fkey FOREIGN KEY (box_id) REFERENCES boxes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.chaleurs
    ADD CONSTRAINT chaleurs_chien_id_fkey FOREIGN KEY (chien_id) REFERENCES chiens(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.checkin_checkout
    ADD CONSTRAINT checkin_checkout_chien_id_fkey FOREIGN KEY (chien_id) REFERENCES chiens(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.checkin_checkout
    ADD CONSTRAINT checkin_checkout_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.chiens
    ADD CONSTRAINT chiens_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.contacts_urgence
    ADD CONSTRAINT contacts_urgence_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.cotisations_membres
    ADD CONSTRAINT cotisations_membres_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.cotisations_membres
    ADD CONSTRAINT cotisations_membres_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.demandes_vacances
    ADD CONSTRAINT demandes_vacances_employe_id_fkey FOREIGN KEY (employe_id) REFERENCES employes_rh(id);
ALTER TABLE ONLY public.ecritures_lignes
    ADD CONSTRAINT ecritures_lignes_compte_numero_fkey FOREIGN KEY (compte_numero) REFERENCES comptes(numero);
ALTER TABLE ONLY public.ecritures_lignes
    ADD CONSTRAINT ecritures_lignes_ecriture_id_fkey FOREIGN KEY (ecriture_id) REFERENCES ecritures(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.employes_rh
    ADD CONSTRAINT employes_rh_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id);
ALTER TABLE ONLY public.ententes_chiens
    ADD CONSTRAINT ententes_chiens_chien_cible_id_fkey FOREIGN KEY (chien_cible_id) REFERENCES chiens(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ententes_chiens
    ADD CONSTRAINT ententes_chiens_chien_id_fkey FOREIGN KEY (chien_id) REFERENCES chiens(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.facture_reservations
    ADD CONSTRAINT facture_reservations_facture_id_fkey FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.facture_reservations
    ADD CONSTRAINT facture_reservations_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.facture_services
    ADD CONSTRAINT facture_services_facture_id_fkey FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.facture_services
    ADD CONSTRAINT facture_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES services_supplementaires(id);
ALTER TABLE ONLY public.fiche_salaire_deductions
    ADD CONSTRAINT fiche_salaire_deductions_fiche_id_fkey FOREIGN KEY (fiche_id) REFERENCES fiches_salaire(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.fiches_salaire
    ADD CONSTRAINT fiches_salaire_employe_id_fkey FOREIGN KEY (employe_id) REFERENCES employes_rh(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.indisponibilites
    ADD CONSTRAINT indisponibilites_employe_id_fkey FOREIGN KEY (employe_id) REFERENCES employes_rh(id);
ALTER TABLE ONLY public.liste_attente
    ADD CONSTRAINT liste_attente_chien_id_fkey FOREIGN KEY (chien_id) REFERENCES chiens(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.liste_attente
    ADD CONSTRAINT liste_attente_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.occupation_boxes
    ADD CONSTRAINT occupation_boxes_box_id_fkey FOREIGN KEY (box_id) REFERENCES boxes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.occupation_boxes
    ADD CONSTRAINT occupation_boxes_chien_id_fkey FOREIGN KEY (chien_id) REFERENCES chiens(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.occupation_boxes
    ADD CONSTRAINT occupation_boxes_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.paiements_resa
    ADD CONSTRAINT paiements_resa_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id);
ALTER TABLE ONLY public.photos_chiens
    ADD CONSTRAINT photos_chiens_chien_id_fkey FOREIGN KEY (chien_id) REFERENCES chiens(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.planning_employes
    ADD CONSTRAINT planning_employes_employe_id_fkey FOREIGN KEY (employe_id) REFERENCES employes_rh(id);
ALTER TABLE ONLY public.recus
    ADD CONSTRAINT recus_facture_id_fkey FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recus
    ADD CONSTRAINT recus_paiement_id_fkey FOREIGN KEY (paiement_id) REFERENCES paiements(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reservation_chiens
    ADD CONSTRAINT reservation_chiens_chien_id_fkey FOREIGN KEY (chien_id) REFERENCES chiens(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reservation_chiens
    ADD CONSTRAINT reservation_chiens_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reservation_extras
    ADD CONSTRAINT reservation_extras_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.timbrage
    ADD CONSTRAINT timbrage_employe_id_fkey FOREIGN KEY (employe_id) REFERENCES employes_rh(id);
ALTER TABLE ONLY public.vaccins
    ADD CONSTRAINT vaccins_chien_id_fkey FOREIGN KEY (chien_id) REFERENCES chiens(id) ON DELETE CASCADE;

-- Non-unique and unique indexes (excluding PK indexes)
CREATE INDEX idx_adhesions_client_id ON public.adhesions USING btree (client_id);
CREATE INDEX idx_avoirs_mouvements_client ON public.avoirs_mouvements USING btree (client_id, created_at);
CREATE INDEX idx_avoirs_mouvements_facture_id ON public.avoirs_mouvements USING btree (facture_id);
CREATE INDEX idx_avoirs_mouvements_paiement_id ON public.avoirs_mouvements USING btree (paiement_id);
CREATE INDEX idx_avoirs_mouvements_reservation_id ON public.avoirs_mouvements USING btree (reservation_id);
CREATE INDEX idx_box_indispo_box_dates ON public.box_indisponibilites USING btree (box_id, date_debut, date_fin);
CREATE INDEX idx_chaleurs_chien_id ON public.chaleurs USING btree (chien_id);
CREATE INDEX idx_checkin_checkout_chien_id ON public.checkin_checkout USING btree (chien_id);
CREATE INDEX idx_checkin_checkout_reservation_id ON public.checkin_checkout USING btree (reservation_id);
CREATE INDEX idx_chiens_client_id ON public.chiens USING btree (client_id);
CREATE INDEX idx_clients_auth_user_id ON public.clients USING btree (auth_user_id);
CREATE INDEX idx_contacts_urgence_client_id ON public.contacts_urgence USING btree (client_id);
CREATE INDEX idx_cotisations_membres_reservation_id ON public.cotisations_membres USING btree (reservation_id);
CREATE INDEX idx_demandes_vacances_employe_id ON public.demandes_vacances USING btree (employe_id);
CREATE INDEX idx_ecr_exercice ON public.ecritures USING btree (exercice);
CREATE INDEX idx_ecritures_contre_passe_id ON public.ecritures USING btree (contre_passe_id);
CREATE INDEX idx_ecr_lignes_compte ON public.ecritures_lignes USING btree (compte_numero);
CREATE INDEX idx_ecr_lignes_ecriture ON public.ecritures_lignes USING btree (ecriture_id);
CREATE INDEX idx_employes_rh_profile_id ON public.employes_rh USING btree (profile_id);
CREATE INDEX idx_facture_reservations_facture ON public.facture_reservations USING btree (facture_id);
CREATE INDEX idx_facture_reservations_reservation ON public.facture_reservations USING btree (reservation_id);
CREATE UNIQUE INDEX uniq_reservation_facture_active ON public.facture_reservations USING btree (reservation_id) WHERE (facture_annulee = false);
CREATE INDEX idx_factures_client_id ON public.factures USING btree (client_id);
CREATE INDEX idx_factures_reservation_id ON public.factures USING btree (reservation_id);
CREATE INDEX idx_fiche_salaire_deductions_fiche_id ON public.fiche_salaire_deductions USING btree (fiche_id);
CREATE INDEX idx_liste_attente_chien_id ON public.liste_attente USING btree (chien_id);
CREATE INDEX idx_liste_attente_client_id ON public.liste_attente USING btree (client_id);
CREATE INDEX idx_occupation_boxes_box_id ON public.occupation_boxes USING btree (box_id);
CREATE INDEX idx_occupation_boxes_chien_id ON public.occupation_boxes USING btree (chien_id);
CREATE INDEX idx_occupation_boxes_reservation_id ON public.occupation_boxes USING btree (reservation_id);
CREATE INDEX idx_paiements_resa_client ON public.paiements_resa USING btree (client_id);
CREATE INDEX idx_paiements_resa_reservation ON public.paiements_resa USING btree (reservation_id);
CREATE UNIQUE INDEX uq_paiements_resa_idempotence ON public.paiements_resa USING btree (reservation_id, cle_idempotence) WHERE (cle_idempotence IS NOT NULL);
CREATE INDEX idx_photos_chiens_chien_id ON public.photos_chiens USING btree (chien_id);
CREATE INDEX idx_reservation_chiens_chien_id ON public.reservation_chiens USING btree (chien_id);
CREATE INDEX idx_reservation_chiens_reservation_id ON public.reservation_chiens USING btree (reservation_id);
CREATE INDEX idx_reservation_extras_reservation_id ON public.reservation_extras USING btree (reservation_id);
CREATE INDEX idx_reservations_box_id ON public.reservations USING btree (box_id);
CREATE INDEX idx_reservations_client_id ON public.reservations USING btree (client_id);
CREATE INDEX idx_vaccins_chien_id ON public.vaccins USING btree (chien_id);

-- Functions
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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.mon_employe_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from employes_rh where profile_id = auth.uid() limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.generer_numero_facture()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select 'FAC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.factures_numero_seq')::text, 4, '0');
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.lier_client_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.clients
  SET auth_user_id = NEW.id
  WHERE email = NEW.email
  AND auth_user_id IS NULL;

  IF NOT FOUND THEN
    INSERT INTO public.clients (prenom, nom, email, auth_user_id, actif, membre)
    VALUES ('', '', NEW.email, NEW.id, true, false)
    ON CONFLICT (email) DO UPDATE SET auth_user_id = NEW.id;
  END IF;

  INSERT INTO public.profiles (id, email, role, actif)
  VALUES (NEW.id, NEW.email, 'client', true)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.avoirs_mouvements_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'avoirs_mouvements est append-only : un mouvement ne peut etre ni modifie ni supprime';
end;
$function$;

CREATE OR REPLACE FUNCTION public.ecritures_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'Les ecritures comptables sont inalterables : ni modification ni suppression (corriger par contre-passation).';
end;
$function$;

CREATE OR REPLACE FUNCTION public.paiements_resa_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'paiements_resa est append-only : un mouvement ne peut etre ni modifie ni supprime.';
end;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.factures_inalterabilite()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if (TG_OP = 'DELETE') then
    if OLD.numero is not null then
      raise exception 'Facture % deja emise : suppression interdite (annuler via note de credit).', OLD.numero;
    end if;
    return OLD;
  end if;

  if OLD.numero is not null then
    if NEW.numero is distinct from OLD.numero then
      raise exception 'Le numero d''une facture emise est immuable.';
    end if;
    if NEW.montant_total is distinct from OLD.montant_total then
      raise exception 'Le montant total d''une facture emise (%) est immuable.', OLD.numero;
    end if;
    if NEW.date_facture is distinct from OLD.date_facture then
      raise exception 'La date d''une facture emise (%) est immuable.', OLD.numero;
    end if;
    if NEW.client_id is distinct from OLD.client_id then
      raise exception 'Le client d''une facture emise (%) est immuable.', OLD.numero;
    end if;
    if NEW.type_facture is distinct from OLD.type_facture then
      raise exception 'Le type d''une facture emise (%) est immuable.', OLD.numero;
    end if;
  end if;
  return NEW;
end;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.passer_ecriture(p_date date, p_libelle text, p_piece_type text, p_piece_id uuid, p_lignes jsonb)
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

  insert into public.ecritures (date_ecriture, libelle, piece_type, piece_id, exercice)
  values (p_date, p_libelle, p_piece_type, p_piece_id, extract(year from p_date)::int)
  returning id into v_ecriture_id;

  insert into public.ecritures_lignes (ecriture_id, compte_numero, debit, credit)
  select v_ecriture_id,
         (l->>'compte')::text,
         coalesce((l->>'debit')::numeric, 0),
         coalesce((l->>'credit')::numeric, 0)
  from jsonb_array_elements(p_lignes) as l;

  return v_ecriture_id;
end;
$function$;

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
  PERFORM pg_advisory_xact_lock(hashtext(p_client_id::text));

  SELECT * INTO v_resa FROM reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation introuvable';
  END IF;
  IF v_resa.client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'Cette reservation n''appartient pas a ce client';
  END IF;
  IF v_resa.statut NOT IN ('validee','terminee') THEN
    RAISE EXCEPTION 'Reservation non payable (statut %)', v_resa.statut;
  END IF;

  v_du := COALESCE(v_resa.montant_final, COALESCE(v_resa.montant_calcule, 0) + COALESCE(v_resa.ajustement_manuel, 0))
        - COALESCE(v_resa.montant_paye, 0);
  IF v_du <= 0 THEN
    RAISE EXCEPTION 'Rien a payer sur cette reservation';
  END IF;

  SELECT COALESCE(SUM(montant), 0) INTO v_solde
  FROM avoirs_mouvements WHERE client_id = p_client_id;
  IF v_solde < v_du THEN
    RAISE EXCEPTION 'Solde avoir insuffisant';
  END IF;

  INSERT INTO avoirs_mouvements (client_id, montant, type, motif, reservation_id)
  VALUES (p_client_id, -v_du, 'utilisation', 'Paiement reservation via avoir', p_reservation_id);

  UPDATE reservations
     SET montant_paye = COALESCE(montant_paye, 0) + v_du,
         statut_paiement = 'paye',
         date_paiement = current_date,
         mode_paiement = 'avoir'
   WHERE id = p_reservation_id;

  RETURN v_solde - v_du;
END;
$function$;

-- Triggers
CREATE TRIGGER trg_avoirs_mouvements_append_only
  BEFORE DELETE OR UPDATE ON public.avoirs_mouvements
  FOR EACH ROW EXECUTE FUNCTION avoirs_mouvements_append_only();

CREATE TRIGGER trg_ecritures_append_only
  BEFORE DELETE OR UPDATE ON public.ecritures
  FOR EACH ROW EXECUTE FUNCTION ecritures_append_only();

CREATE TRIGGER trg_ecritures_bloc_exercice_cloture
  BEFORE INSERT ON public.ecritures
  FOR EACH ROW EXECUTE FUNCTION bloquer_ecriture_exercice_cloture();

CREATE TRIGGER trg_ecritures_lignes_append_only
  BEFORE DELETE OR UPDATE ON public.ecritures_lignes
  FOR EACH ROW EXECUTE FUNCTION ecritures_append_only();

CREATE TRIGGER trg_facture_reservations_integrite
  BEFORE DELETE OR UPDATE ON public.facture_reservations
  FOR EACH ROW EXECUTE FUNCTION facture_reservations_integrite();

CREATE TRIGGER trg_factures_inalterabilite
  BEFORE DELETE OR UPDATE ON public.factures
  FOR EACH ROW EXECUTE FUNCTION factures_inalterabilite();

CREATE TRIGGER trg_paiements_resa_append_only
  BEFORE DELETE OR UPDATE ON public.paiements_resa
  FOR EACH ROW EXECUTE FUNCTION paiements_resa_append_only();

-- Auth trigger (on auth schema):
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION lier_client_auth();

-- Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comptes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services_supplementaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paiements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecritures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adhesions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avoirs_mouvements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.box_indisponibilites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendrier_essais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chaleurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_checkout ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chiens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts_urgence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotisations_membres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demandes_vacances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecritures_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emails_envoyes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employes_rh ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ententes_chiens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facture_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facture_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fermetures_essai ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fermetures_exceptionnelles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiche_salaire_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiches_salaire ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indisponibilites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jours_feries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liste_attente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modeles_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.occupation_boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paiements_resa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parametres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parametres_generaux ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos_chiens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_chiens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarifs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timbrage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacances_scolaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vaccins ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY admin_all_profiles ON public.profiles
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY self_read_profiles ON public.profiles
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING ((id = auth.uid()));
CREATE POLICY admin_all_clients ON public.clients
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY client_self_select ON public.clients
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING ((auth_user_id = auth.uid()));
CREATE POLICY personnel_select_clients ON public.clients
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (is_personnel());
CREATE POLICY admin_all_boxes ON public.boxes
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY personnel_select_boxes ON public.boxes
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (is_personnel());
CREATE POLICY admin_all_services_supplementaires ON public.services_supplementaires
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY admin_all_reservations ON public.reservations
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY client_select_reservations ON public.reservations
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = auth.uid()))));
CREATE POLICY personnel_select_reservations ON public.reservations
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (is_personnel());
CREATE POLICY admin_all_factures ON public.factures
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY admin_all_paiements ON public.paiements
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY admin_all_adhesions ON public.adhesions
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY admin_all_avoirs_mouvements ON public.avoirs_mouvements
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY client_select_avoirs_mouvements ON public.avoirs_mouvements
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = auth.uid()))));
CREATE POLICY admin_all_box_indisponibilites ON public.box_indisponibilites
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY personnel_select_box_indisponibilites ON public.box_indisponibilites
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (is_personnel());
CREATE POLICY admin_all_calendrier_essais ON public.calendrier_essais
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY personnel_select_calendrier_essais ON public.calendrier_essais
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING ((is_admin() OR is_personnel()));
CREATE POLICY admin_all_chaleurs ON public.chaleurs
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY admin_all_checkin_checkout ON public.checkin_checkout
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY admin_all_chiens ON public.chiens
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY client_select_chiens ON public.chiens
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = auth.uid()))));
CREATE POLICY personnel_select_chiens ON public.chiens
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (is_personnel());
CREATE POLICY admin_all_contacts_urgence ON public.contacts_urgence
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY admin_all_cotisations_membres ON public.cotisations_membres
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY admin_all_demandes_vacances ON public.demandes_vacances
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY employe_insert_vacances ON public.demandes_vacances
  AS PERMISSIVE
  FOR INSERT
  WITH CHECK ((employe_id = mon_employe_id()));
CREATE POLICY employe_self_select_vacances ON public.demandes_vacances
  AS PERMISSIVE
  FOR SELECT
  USING ((employe_id = mon_employe_id()));
CREATE POLICY employe_update_vacances ON public.demandes_vacances
  AS PERMISSIVE
  FOR UPDATE
  USING ((employe_id = mon_employe_id()))
  WITH CHECK ((employe_id = mon_employe_id()));
CREATE POLICY admin_all_emails_envoyes ON public.emails_envoyes
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY admin_all_employes_rh ON public.employes_rh
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY employe_self_select_employes_rh ON public.employes_rh
  AS PERMISSIVE
  FOR SELECT
  USING ((profile_id = auth.uid()));
CREATE POLICY admin_all_ententes_chiens ON public.ententes_chiens
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY admin_all_facture_reservations ON public.facture_reservations
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin());
CREATE POLICY admin_all_facture_services ON public.facture_services
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY admin_all_fermetures_exceptionnelles ON public.fermetures_exceptionnelles
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY admin_all_fiche_salaire_deductions ON public.fiche_salaire_deductions
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY employe_self_select_fiche_deductions ON public.fiche_salaire_deductions
  AS PERMISSIVE
  FOR SELECT
  USING ((fiche_id IN ( SELECT fiches_salaire.id
   FROM fiches_salaire
  WHERE (fiches_salaire.employe_id = mon_employe_id()))));
CREATE POLICY admin_all_fiches_salaire ON public.fiches_salaire
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY employe_self_select_fiches_salaire ON public.fiches_salaire
  AS PERMISSIVE
  FOR SELECT
  USING ((employe_id = mon_employe_id()));
CREATE POLICY admin_all_indisponibilites ON public.indisponibilites
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY employe_delete_indispo ON public.indisponibilites
  AS PERMISSIVE
  FOR DELETE
  USING ((employe_id = mon_employe_id()));
CREATE POLICY employe_insert_indispo ON public.indisponibilites
  AS PERMISSIVE
  FOR INSERT
  WITH CHECK ((employe_id = mon_employe_id()));
CREATE POLICY employe_self_select_indispo ON public.indisponibilites
  AS PERMISSIVE
  FOR SELECT
  USING ((employe_id = mon_employe_id()));
CREATE POLICY employe_update_indispo ON public.indisponibilites
  AS PERMISSIVE
  FOR UPDATE
  USING ((employe_id = mon_employe_id()))
  WITH CHECK ((employe_id = mon_employe_id()));
CREATE POLICY admin_all_jours_feries ON public.jours_feries
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY admin_all_liste_attente ON public.liste_attente
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY admin_all_modeles_deductions ON public.modeles_deductions
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY admin_all_occupation_boxes ON public.occupation_boxes
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY personnel_select_occupation_boxes ON public.occupation_boxes
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (is_personnel());
CREATE POLICY admin_all_parametres ON public.parametres
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY personnel_select_parametres ON public.parametres
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (is_personnel());
CREATE POLICY admin_all_parametres_generaux ON public.parametres_generaux
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY admin_all_photos_chiens ON public.photos_chiens
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY admin_all_planning_employes ON public.planning_employes
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY employe_self_select_planning ON public.planning_employes
  AS PERMISSIVE
  FOR SELECT
  USING ((employe_id = mon_employe_id()));
CREATE POLICY personnel_select_planning ON public.planning_employes
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (is_personnel());
CREATE POLICY admin_all_recus ON public.recus
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY admin_all_reservation_chiens ON public.reservation_chiens
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY client_select_reservation_chiens ON public.reservation_chiens
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING ((reservation_id IN ( SELECT r.id
   FROM reservations r
  WHERE (r.client_id IN ( SELECT c.id
           FROM clients c
          WHERE (c.auth_user_id = auth.uid()))))));
CREATE POLICY admin_all_reservation_extras ON public.reservation_extras
  AS PERMISSIVE
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY client_select_reservation_extras ON public.reservation_extras
  AS PERMISSIVE
  FOR SELECT
  USING ((reservation_id IN ( SELECT r.id
   FROM reservations r
  WHERE (r.client_id IN ( SELECT c.id
           FROM clients c
          WHERE (c.auth_user_id = auth.uid()))))));
CREATE POLICY admin_all_tarifs ON public.tarifs
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY personnel_select_tarifs ON public.tarifs
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (is_personnel());
CREATE POLICY admin_all_timbrage ON public.timbrage
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY employe_insert_timbrage ON public.timbrage
  AS PERMISSIVE
  FOR INSERT
  WITH CHECK ((employe_id = mon_employe_id()));
CREATE POLICY employe_self_select_timbrage ON public.timbrage
  AS PERMISSIVE
  FOR SELECT
  USING ((employe_id = mon_employe_id()));
CREATE POLICY employe_update_timbrage ON public.timbrage
  AS PERMISSIVE
  FOR UPDATE
  USING ((employe_id = mon_employe_id()))
  WITH CHECK ((employe_id = mon_employe_id()));
CREATE POLICY admin_all_vacances_scolaires ON public.vacances_scolaires
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY admin_all_vaccins ON public.vaccins
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());