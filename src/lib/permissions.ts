import { NextResponse } from "next/server";

/** Ce qu'on attend d'un client Supabase ici : lire l'utilisateur et un profil. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientLike = any;
import { createClient } from "../utils/supabase/server";
import type { PerimetreStock, NiveauStock } from "./perimetreStock";

// ── API Routes ──────────────────────────────────────────────────────────────

export async function exigerPersonnel(supabase: any): Promise<NextResponse | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!["admin", "employe"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Accès réservé au personnel" }, { status: 403 });
  }
  return null;
}

export async function exigerPermissionApi(supabase: any, perm: string): Promise<NextResponse | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select(`role, ${perm}`)
    .eq("id", user.id)
    .single();
  if (profile?.role === "admin") return null;
  if (profile?.role === "employe" && (profile as any)?.[perm] === true) return null;
  return NextResponse.json({ error: "Accès réservé à l'admin" }, { status: 403 });
}

// ── Server Actions ───────────────────────────────────────────────────────────

export async function verifierPermission(
  perm: string
): Promise<{ error?: string; userId?: string; isAdmin?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };
  const { data: rawProfile } = await supabase
    .from("profiles")
    .select(`role, ${perm}`)
    .eq("id", user.id)
    .single();
  // Template-literal select prevents Supabase from inferring the exact column set; cast to known shape
  const profile = rawProfile as { role: string; [key: string]: unknown } | null;
  if (profile?.role === "admin") return { userId: user.id, isAdmin: true };
  if (profile?.role === "employe" && profile?.[perm] === true)
    return { userId: user.id, isAdmin: false };
  return { error: "Accès réservé à l'admin" };
}

/**
 * Réservé à l'admin, sans délégation possible à un employé.
 * Pour les gestes comptables sensibles (resynchronisation, export du grand livre).
 */
export async function verifierAdmin(): Promise<{ error?: string; userId?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { error: "Accès réservé à l'admin" };
  return { userId: user.id };
}

/** Même règle que verifierAdmin, côté Route Handler. */
export async function exigerAdminApi(supabase: any): Promise<NextResponse | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Accès réservé à l'admin" }, { status: 403 });
  }
  return null;
}

/**
 * Id du profil connecté, ou null (traitement automatique / trigger).
 * Sert à renseigner created_by sur les écritures comptables.
 */
export async function idUtilisateurCourant(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ── Profile Permissions ──────────────────────────────────────────────────────

export type ProfilePerms = {
  isAdmin: boolean;
  perm_chiens_creer: boolean;
  perm_chiens_modifier: boolean;
  perm_clients_creer: boolean;
  perm_clients_modifier: boolean;
  perm_depenses: boolean;
  perm_boutique_vente: boolean;
  perm_boutique_gestion: boolean;
  /** L'atelier : les fournitures de fabrication. Indépendante de la boutique. */
  perm_atelier: boolean;
  perm_reservations_creer: boolean;
  perm_reservations_modifier: boolean;
  perm_reservations_annuler: boolean;
  perm_journee_essai: boolean;
  perm_encaissements: boolean;
  /** Le travail administratif de facturation, distinct du geste au comptoir. */
  perm_factures: boolean;
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
      perm_clients_creer, perm_clients_modifier, perm_depenses,
      perm_boutique_vente, perm_boutique_gestion, perm_atelier,
      perm_reservations_creer, perm_reservations_modifier, perm_reservations_annuler,
      perm_journee_essai, perm_encaissements, perm_factures, perm_tarifs_urgence,
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
    perm_depenses: isAdmin || !!profile.perm_depenses,
    // La gestion emporte la vente : voir permissionsBoutique.
    perm_boutique_vente: isAdmin || !!profile.perm_boutique_vente || !!profile.perm_boutique_gestion,
    perm_boutique_gestion: isAdmin || !!profile.perm_boutique_gestion,
    // L'atelier ne découle d'aucune permission boutique : on peut tenir le
    // magasin sans toucher aux fournitures de fabrication, et l'inverse.
    perm_atelier: isAdmin || !!profile.perm_atelier,
    perm_reservations_creer: isAdmin || !!profile.perm_reservations_creer,
    perm_reservations_modifier: isAdmin || !!profile.perm_reservations_modifier,
    perm_reservations_annuler: isAdmin || !!profile.perm_reservations_annuler,
    perm_journee_essai: isAdmin || !!profile.perm_journee_essai,
    perm_encaissements: isAdmin || !!profile.perm_encaissements,
    perm_factures: isAdmin || !!profile.perm_factures,
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
    perm_depenses: false,
    perm_boutique_vente: false,
    perm_boutique_gestion: false,
    perm_atelier: false,
    perm_reservations_creer: false,
    perm_reservations_modifier: false,
    perm_reservations_annuler: false,
    perm_journee_essai: false,
    perm_encaissements: false,
    perm_factures: false,
    perm_tarifs_urgence: false,
    perm_checkin: false,
    perm_box: false,
    perm_planning: false,
    perm_timbrage_equipe: false,
    perm_vacances_equipe: false,
  };
}

// ── Boutique : deux niveaux, et la gestion emporte la vente ─────────────────

/**
 * Garde des actions serveur de la boutique.
 *
 * « vente » : la caisse, les retours, le catalogue en lecture, les commandes.
 * « gestion » : les articles, les options, les modèles, l'inventaire, les prix
 * d'achat — et, parce qu'elle l'implique, tout ce que la vente permet.
 *
 * La même règle vit dans permissionsBoutique (écrans) et peut_boutique (RLS).
 * Les trois doivent dire la même chose, sinon on se contredirait selon la
 * porte empruntée.
 */
export async function verifierPermissionBoutique(
  niveau: "vente" | "gestion"
): Promise<{ error?: string; userId?: string; isAdmin?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, perm_boutique_vente, perm_boutique_gestion")
    .eq("id", user.id)
    .single();

  if (profile?.role === "admin") return { userId: user.id, isAdmin: true };
  if (profile?.role !== "employe") return { error: "Accès réservé au personnel" };

  const gestion = profile.perm_boutique_gestion === true;
  const accorde = niveau === "gestion" ? gestion : gestion || profile.perm_boutique_vente === true;

  return accorde
    ? { userId: user.id, isAdmin: false }
    : {
        error: niveau === "gestion"
          ? "Cette action demande la permission « Boutique — gestion »."
          : "Cette action demande la permission « Boutique — vente ».",
      };
}

/**
 * Garde des actions de stock, boutique OU atelier.
 *
 * Elle n'ajoute aucune règle : sur la boutique elle appelle la garde des deux
 * niveaux posée en APP 13b, sur l'atelier elle exige `perm_atelier`. C'est le
 * périmètre de la DONNÉE qui décide, jamais le formulaire — une fourniture se
 * modifie depuis l'atelier, quel que soit l'écran d'où part la requête.
 */
export async function verifierPermissionStock(
  perimetre: PerimetreStock,
  niveau: NiveauStock
): Promise<{ error?: string; userId?: string; isAdmin?: boolean }> {
  if (perimetre === "boutique") return verifierPermissionBoutique(niveau);

  const verif = await verifierPermission("perm_atelier");
  if (verif.error) {
    return {
      error: verif.error === "Accès réservé à l'admin"
        ? "Cette action demande la permission « Atelier »."
        : verif.error,
    };
  }
  return verif;
}

/** La même garde, pour une route d'API : 403 plutôt qu'une redirection. */
export async function exigerBoutiqueApi(
  supabase: SupabaseClientLike,
  niveau: "vente" | "gestion"
): Promise<NextResponse | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, perm_boutique_vente, perm_boutique_gestion")
    .eq("id", user.id)
    .single();

  if (profile?.role === "admin") return null;
  if (profile?.role !== "employe") {
    return NextResponse.json({ error: "Accès réservé au personnel" }, { status: 403 });
  }

  const gestion = profile.perm_boutique_gestion === true;
  const accorde = niveau === "gestion" ? gestion : gestion || profile.perm_boutique_vente === true;
  if (accorde) return null;

  return NextResponse.json(
    {
      error: niveau === "gestion"
        ? "Cette action demande la permission « Boutique — gestion »."
        : "Cette action demande la permission « Boutique — vente ».",
    },
    { status: 403 }
  );
}
