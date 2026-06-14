import { createClient } from "../utils/supabase/server";

export type ProfilePerms = {
  isAdmin: boolean;
  perm_chiens_creer: boolean;
  perm_chiens_modifier: boolean;
  perm_clients_creer: boolean;
  perm_clients_modifier: boolean;
  perm_reservations_creer: boolean;
  perm_reservations_modifier: boolean;
  perm_reservations_annuler: boolean;
  perm_journee_essai: boolean;
  perm_encaissements: boolean;
  perm_tarifs_urgence: boolean;
  perm_checkin: boolean;
  perm_box: boolean;
  perm_planning: boolean;
  perm_timbrage_equipe: boolean;
  perm_vacances_equipe: boolean;
};

export async function getProfilePerms(): Promise<ProfilePerms> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return falsePerms();

  const { data: profile } = await supabase
    .from("profiles")
    .select(`role,
      perm_chiens_creer, perm_chiens_modifier,
      perm_clients_creer, perm_clients_modifier,
      perm_reservations_creer, perm_reservations_modifier, perm_reservations_annuler,
      perm_journee_essai, perm_encaissements, perm_tarifs_urgence,
      perm_checkin, perm_box, perm_planning,
      perm_timbrage_equipe, perm_vacances_equipe`)
    .eq("id", user.id)
    .single();

  if (!profile) return falsePerms();
  const isAdmin = profile.role === "admin";

  return {
    isAdmin,
    perm_chiens_creer: isAdmin || !!profile.perm_chiens_creer,
    perm_chiens_modifier: isAdmin || !!profile.perm_chiens_modifier,
    perm_clients_creer: isAdmin || !!profile.perm_clients_creer,
    perm_clients_modifier: isAdmin || !!profile.perm_clients_modifier,
    perm_reservations_creer: isAdmin || !!profile.perm_reservations_creer,
    perm_reservations_modifier: isAdmin || !!profile.perm_reservations_modifier,
    perm_reservations_annuler: isAdmin || !!profile.perm_reservations_annuler,
    perm_journee_essai: isAdmin || !!profile.perm_journee_essai,
    perm_encaissements: isAdmin || !!profile.perm_encaissements,
    perm_tarifs_urgence: isAdmin || !!profile.perm_tarifs_urgence,
    perm_checkin: isAdmin || !!profile.perm_checkin,
    perm_box: isAdmin || !!profile.perm_box,
    perm_planning: isAdmin || !!profile.perm_planning,
    perm_timbrage_equipe: isAdmin || !!profile.perm_timbrage_equipe,
    perm_vacances_equipe: isAdmin || !!profile.perm_vacances_equipe,
  };
}

function falsePerms(): ProfilePerms {
  return {
    isAdmin: false,
    perm_chiens_creer: false,
    perm_chiens_modifier: false,
    perm_clients_creer: false,
    perm_clients_modifier: false,
    perm_reservations_creer: false,
    perm_reservations_modifier: false,
    perm_reservations_annuler: false,
    perm_journee_essai: false,
    perm_encaissements: false,
    perm_tarifs_urgence: false,
    perm_checkin: false,
    perm_box: false,
    perm_planning: false,
    perm_timbrage_equipe: false,
    perm_vacances_equipe: false,
  };
}
