-- Correctif de recette A2 — les permissions du personnel ne s'accordent plus par
-- défaut. Un profil créé sans décision explicite n'a AUCUN droit d'exploitation.
-- Les comptes employés créés par l'application posent leurs droits explicitement
-- (PERMISSIONS_EMPLOYE_DEFAUT), ils ne dépendent pas de ces valeurs par défaut.

alter table public.profiles alter column perm_box                    set default false;
alter table public.profiles alter column perm_checkin                set default false;
alter table public.profiles alter column perm_chiens_creer           set default false;
alter table public.profiles alter column perm_chiens_modifier        set default false;
alter table public.profiles alter column perm_clients_creer          set default false;
alter table public.profiles alter column perm_clients_modifier       set default false;
alter table public.profiles alter column perm_encaissements          set default false;
alter table public.profiles alter column perm_journee_essai          set default false;
alter table public.profiles alter column perm_planning               set default false;
alter table public.profiles alter column perm_reservations_annuler   set default false;
alter table public.profiles alter column perm_reservations_creer     set default false;
alter table public.profiles alter column perm_reservations_modifier  set default false;

-- Reprise des données : un profil CLIENT n'a aucune permission d'exploitation.
-- Les profils admin et employé ne sont pas touchés : leurs droits actuels sont
-- revus à l'écran.
update public.profiles
set perm_box                   = false,
    perm_checkin               = false,
    perm_chiens_creer          = false,
    perm_chiens_modifier       = false,
    perm_clients_creer         = false,
    perm_clients_modifier      = false,
    perm_encaissements         = false,
    perm_journee_essai         = false,
    perm_planning              = false,
    perm_reservations_annuler  = false,
    perm_reservations_creer    = false,
    perm_reservations_modifier = false,
    perm_tarifs_urgence        = false,
    perm_timbrage_equipe       = false,
    perm_vacances_equipe       = false
where role = 'client';