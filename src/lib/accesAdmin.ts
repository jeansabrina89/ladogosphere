import { redirect } from "next/navigation";
import { createClient } from "../utils/supabase/server";

/**
 * Garde d'accès unique des écrans d'administration.
 *
 * Règle, dans cet ordre et jamais autrement :
 *   1. pas de session          → /login
 *   2. rôle ni admin ni employé → /mon-compte  (un client n'entre pas, même en lecture ;
 *                                 pas vers « / », qui EST le tableau de bord admin)
 *   3. permission demandée     → admin toujours, employé seulement si la colonne est vraie
 *
 * Le rôle passe TOUJOURS avant la permission. Une permission ne suffit jamais
 * à elle seule : les colonnes `perm_*` ne veulent rien dire sur un profil client.
 */

export const PERMISSIONS_PERSONNEL = [
  "perm_boutique_vente",
  "perm_boutique_gestion",
  "perm_box",
  "perm_checkin",
  "perm_chiens_creer",
  "perm_chiens_modifier",
  "perm_clients_creer",
  "perm_clients_modifier",
  "perm_depenses",
  "perm_encaissements",
  "perm_journee_essai",
  "perm_planning",
  "perm_reservations_annuler",
  "perm_reservations_creer",
  "perm_reservations_modifier",
  "perm_tarifs_urgence",
  "perm_timbrage_equipe",
  "perm_vacances_equipe",
] as const;

export type PermissionPersonnel = (typeof PERMISSIONS_PERSONNEL)[number];

/**
 * La gestion IMPLIQUE la vente.
 *
 * Qui décide des prix et de l'inventaire sait forcément encaisser ; l'inverse
 * n'est pas vrai. Un profil qui porterait la gestion sans la vente est donc
 * traité comme ayant les deux — c'est plus sûr que de lui refuser la caisse,
 * et l'écran des permissions le dit noir sur blanc plutôt que de le laisser
 * découvrir.
 *
 * La même règle vit dans peut_boutique() côté base : les deux doivent dire la
 * même chose, sinon RLS et écrans se contrediraient.
 */
export function permissionsBoutique(
  brut: Record<string, unknown> | null | undefined
): { vente: boolean; gestion: boolean } {
  const gestion = brut?.perm_boutique_gestion === true;
  return { gestion, vente: gestion || brut?.perm_boutique_vente === true };
}

export type ContexteAcces = {
  connecte: boolean;
  role?: string | null;
  email?: string | null;
  permissions?: Record<string, unknown> | null;
};

export type ExigenceAcces = {
  /** Permission requise en plus du rôle. Un admin l'a d'office. */
  permission?: PermissionPersonnel;
  /** Écran réservé à l'admin : aucun employé, quelles que soient ses permissions. */
  adminSeul?: boolean;
};

export type DecisionAcces =
  | { autorise: true }
  /**
   * Un écran de boutique interdit renvoie à l'accueil de la boutique, pas à
   * celui de l'application : la vendeuse n'est pas égarée, elle a seulement
   * poussé une porte qui n'est pas la sienne.
   */
  | { autorise: false; redirection: "/login" | "/" | "/mon-compte" | "/boutique"; motif: string };

/**
 * Décision pure, sans base ni requête : c'est elle qui porte la règle, et c'est
 * elle que les tests couvrent.
 */
export function deciderAccesAdmin(
  contexte: ContexteAcces,
  exigence: ExigenceAcces = {}
): DecisionAcces {
  if (!contexte.connecte) {
    return { autorise: false, redirection: "/login", motif: "Non connecté" };
  }

  const role = contexte.role ?? null;
  if (role !== "admin" && role !== "employe") {
    return { autorise: false, redirection: "/mon-compte", motif: "Accès réservé au personnel" };
  }

  if (role === "admin") return { autorise: true };

  if (exigence.adminSeul) {
    return { autorise: false, redirection: "/", motif: "Accès réservé à l'administratrice" };
  }

  if (!exigence.permission) return { autorise: true };

  // La boutique a deux niveaux, et la gestion emporte la vente.
  if (exigence.permission === "perm_boutique_vente" || exigence.permission === "perm_boutique_gestion") {
    const boutique = permissionsBoutique(contexte.permissions);
    const accorde = exigence.permission === "perm_boutique_gestion" ? boutique.gestion : boutique.vente;
    return accorde
      ? { autorise: true }
      : { autorise: false, redirection: "/boutique", motif: "Permission manquante" };
  }

  if (contexte.permissions?.[exigence.permission] === true) return { autorise: true };

  return { autorise: false, redirection: "/", motif: "Permission manquante" };
}

export type AccesAdmin = {
  userId: string;
  /** E-mail du profil applicatif, avec repli sur celui du compte Auth. */
  email: string | null;
  role: "admin" | "employe";
  isAdmin: boolean;
  permissions: Record<string, boolean>;
};

async function lireContexte(): Promise<{ contexte: ContexteAcces; user: { id: string; email: string | null } | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { contexte: { connecte: false }, user: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select(`role, email, ${PERMISSIONS_PERSONNEL.join(", ")}`)
    .eq("id", user.id)
    .single();

  const brut = profile as ({ role: string | null; email: string | null } & Record<string, unknown>) | null;

  return {
    contexte: {
      connecte: true,
      role: brut?.role ?? null,
      email: brut?.email ?? user.email ?? null,
      permissions: brut ?? null,
    },
    user: { id: user.id, email: user.email ?? null },
  };
}

function normaliserPermissions(
  role: "admin" | "employe",
  brut: Record<string, unknown> | null | undefined
): Record<string, boolean> {
  const perms: Record<string, boolean> = {};
  for (const p of PERMISSIONS_PERSONNEL) {
    perms[p] = role === "admin" ? true : brut?.[p] === true;
  }
  // La gestion emporte la vente, ici comme partout ailleurs.
  if (role !== "admin") {
    const boutique = permissionsBoutique(brut);
    perms.perm_boutique_vente = boutique.vente;
    perms.perm_boutique_gestion = boutique.gestion;
  }
  return perms;
}

/**
 * À appeler en tête de CHAQUE page et layout du groupe (admin).
 * Redirige (donc n'a jamais de valeur de retour côté refus) ou renvoie l'accès.
 */
export async function exigerAccesAdmin(
  permission?: PermissionPersonnel
): Promise<AccesAdmin> {
  return exiger({ permission });
}

/** Variante des écrans réservés à l'administratrice (comptabilité, RH, tarifs…). */
export async function exigerAdminPage(): Promise<AccesAdmin> {
  return exiger({ adminSeul: true });
}

async function exiger(exigence: ExigenceAcces): Promise<AccesAdmin> {
  const { contexte, user } = await lireContexte();
  const decision = deciderAccesAdmin(contexte, exigence);
  if (!decision.autorise) redirect(decision.redirection);

  const role = contexte.role as "admin" | "employe";
  return {
    userId: user!.id,
    email: contexte.email ?? user!.email,
    role,
    isAdmin: role === "admin",
    permissions: normaliserPermissions(role, contexte.permissions),
  };
}
