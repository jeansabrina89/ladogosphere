import { createClient } from "../utils/supabase/server";
import { PERMISSIONS_PERSONNEL, type PermissionPersonnel } from "./permissionsCatalogue";

/**
 * LA garde des actions serveur et des routes. Une seule façon de savoir qui
 * appelle, et une seule règle pour dire s'il passe :
 *
 *   1. pas de session                    → refus (401) ;
 *   2. profil désactivé (`actif` faux)   → refus (403) ;
 *   3. l'admin passe toujours ;
 *   4. une permission de personnel demandée à un rôle qui n'est pas employé
 *      (un client) → refus (403) ;
 *   5. un employé à qui manque une permission demandée → refus (403).
 *
 * L'identité vient de `getUser()` côté serveur — jamais d'un cookie décodé à
 * la main : Supabase revalide le jeton. Le profil (rôle, actif, permissions)
 * est relu à CHAQUE appel : désactiver quelqu'un ferme ses portes au geste
 * suivant, sans attendre la fin de sa session.
 *
 * Un refus lève `AccesRefuse` et laisse une ligne dans le journal (entité
 * « acces », événement « refus ») : l'action, le motif, les permissions
 * demandées. Rien d'autre — ni corps de requête, ni donnée métier.
 *
 * Les gardes historiques (verifierPermission, exigerPermissionApi,
 * exigerAccesAdmin…) passent toutes par `lireAppelant` et `deciderGarde` :
 * elles ne gardent que leur façon de répondre (objet d'erreur, 403, redirection).
 */

export type MotifRefus = "non_connecte" | "inactif" | "role" | "permission";

export class AccesRefuse extends Error {
  readonly motif: MotifRefus;
  readonly statut: 401 | 403;
  constructor(motif: MotifRefus, message: string) {
    super(message);
    this.name = "AccesRefuse";
    this.motif = motif;
    this.statut = motif === "non_connecte" ? 401 : 403;
  }
}

export type Appelant = {
  userId: string;
  email: string | null;
  role: string | null;
  isAdmin: boolean;
  /** Faux seulement si le profil le dit explicitement, comme `is_admin()` en SQL. */
  actif: boolean;
  /** Permissions effectives : tout vrai pour l'admin, la gestion emporte la vente. */
  permissions: Record<PermissionPersonnel, boolean>;
  /** Le profil tel que lu, pour les écrans qui en affichent davantage. */
  brut: Record<string, unknown> | null;
};

/** Ce qu'une garde exige. Vide : le personnel (admin ou employé). */
export type Exigence = {
  permissions?: PermissionPersonnel[];
  adminSeul?: boolean;
  /** Le rôle seul ne suffit pas à tout : un client connecté, par exemple. */
  personnel?: boolean;
};

export type DecisionGarde = { ok: true } | { ok: false; motif: MotifRefus; message: string };

// ── La règle, pure ──────────────────────────────────────────────────────────

/** La gestion de la boutique emporte la vente — même règle que peut_boutique(). */
export function permissionsEffectives(
  role: string | null,
  brut: Record<string, unknown> | null | undefined,
): Record<PermissionPersonnel, boolean> {
  const perms = {} as Record<PermissionPersonnel, boolean>;
  for (const p of PERMISSIONS_PERSONNEL) perms[p] = role === "admin" || brut?.[p] === true;
  if (role !== "admin" && brut?.perm_boutique_gestion === true) perms.perm_boutique_vente = true;
  return perms;
}

export function deciderGarde(
  appelant: Pick<Appelant, "role" | "actif" | "permissions"> | null,
  exigence: Exigence = {},
): DecisionGarde {
  if (!appelant) return { ok: false, motif: "non_connecte", message: "Non connecté" };
  if (!appelant.actif) return { ok: false, motif: "inactif", message: "Compte désactivé" };
  if (appelant.role === "admin") return { ok: true };
  if (exigence.adminSeul) return { ok: false, motif: "role", message: "Accès réservé à l'admin" };

  const perms = exigence.permissions ?? [];
  const personnel = exigence.personnel ?? true;
  if ((personnel || perms.length > 0) && appelant.role !== "employe") {
    return { ok: false, motif: "role", message: "Accès réservé au personnel" };
  }
  const manque = perms.find((p) => !appelant.permissions[p]);
  if (manque) return { ok: false, motif: "permission", message: `Permission manquante : ${manque}` };
  return { ok: true };
}

// ── Lecture de l'appelant ───────────────────────────────────────────────────

type ClientSession = Awaited<ReturnType<typeof createClient>>;

/**
 * L'appelant, ou null sans session. Lit le profil avec le client de SESSION
 * (la ligne de son propre profil lui est lisible) : c'est la même lecture que
 * faisaient les gardes historiques.
 */
export async function lireAppelant(client?: ClientSession): Promise<Appelant | null> {
  const supabase = client ?? (await createClient());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select(`role, actif, email, ${PERMISSIONS_PERSONNEL.join(", ")}`)
    .eq("id", user.id)
    .single();
  const brut = (data ?? null) as Record<string, unknown> | null;
  const role = (brut?.role as string | null | undefined) ?? null;

  return {
    userId: user.id,
    email: (brut?.email as string | null | undefined) ?? user.email ?? null,
    role,
    isAdmin: role === "admin",
    actif: brut?.actif !== false,
    permissions: permissionsEffectives(role, brut),
    brut,
  };
}

// ── Journal des refus ───────────────────────────────────────────────────────

const AUCUN = "00000000-0000-0000-0000-000000000000";

export async function journaliserRefus(
  appelant: Appelant | null,
  motif: MotifRefus,
  exigence: Exigence,
  action: string | null,
): Promise<void> {
  // Chargé à la demande : la règle pure (deciderGarde) doit rester testable
  // sans clé de service ni base.
  const { tracerEvenement } = await import("./journalEvenements");
  await tracerEvenement({
    entite: "acces",
    entiteId: appelant?.userId ?? AUCUN,
    evenement: "refus",
    apres: {
      action,
      motif,
      permissions: exigence.permissions ?? [],
      admin_seul: exigence.adminSeul === true,
    },
    // Un compte sans profil ne peut pas être cité (clé étrangère) : la trace
    // reste, sans auteur.
    userId: appelant?.brut ? appelant.userId : null,
  });
}

/**
 * Le cœur : décide, journalise un refus, rend l'appelant ou lève AccesRefuse.
 * Toutes les gardes, nouvelles et historiques, passent par ici.
 */
export async function verifierAppelant(
  exigence: Exigence,
  options: { action?: string | null; client?: ClientSession } = {},
): Promise<Appelant> {
  const appelant = await lireAppelant(options.client);
  const decision = deciderGarde(appelant, exigence);
  if (!decision.ok) {
    await journaliserRefus(appelant, decision.motif, exigence, options.action ?? null);
    throw new AccesRefuse(decision.motif, decision.message);
  }
  return appelant!;
}

// ── Les gardes ──────────────────────────────────────────────────────────────

type OptionAction = { action: string };

function separer(args: (PermissionPersonnel | OptionAction)[]): {
  permissions: PermissionPersonnel[];
  action: string | null;
} {
  const permissions: PermissionPersonnel[] = [];
  let action: string | null = null;
  for (const a of args) {
    if (typeof a === "string") permissions.push(a);
    else action = a.action;
  }
  return { permissions, action };
}

/**
 * Le personnel, avec les permissions demandées (toutes). L'admin passe
 * toujours. `exiger()` sans argument : admin ou employé actif.
 * Un `{ action: "nom" }` en dernier argument nomme le geste dans le journal.
 */
export async function exiger(...args: (PermissionPersonnel | OptionAction)[]): Promise<Appelant> {
  const { permissions, action } = separer(args);
  return verifierAppelant({ permissions }, { action });
}

/** L'administratrice seule, sans délégation possible. */
export async function exigerAdmin(action?: string): Promise<Appelant> {
  return verifierAppelant({ adminSeul: true }, { action: action ?? null });
}

/**
 * Le client propriétaire de la fiche : la session doit être celle du compte
 * rattaché (`clients.auth_user_id`). Le personnel n'y passe PAS : une action
 * de l'espace client n'est pas une porte de service.
 */
export async function exigerClientProprietaire(
  clientId: string,
  action?: string,
): Promise<Appelant & { clientId: string }> {
  const exigence: Exigence = { personnel: false };
  const appelant = await verifierAppelant(exigence, { action: action ?? null });
  const { supabaseAdmin } = await import("./supabase-admin");
  const { data: fiche } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("auth_user_id", appelant.userId)
    .maybeSingle();
  if (!fiche) {
    await journaliserRefus(appelant, "permission", exigence, action ?? "client_proprietaire");
    throw new AccesRefuse("permission", "Cette fiche n'est pas la vôtre.");
  }
  return { ...appelant, clientId: fiche.id as string };
}

/** Pour une route : transforme un refus en réponse JSON 401/403, relance le reste. */
export function statutRefus(e: unknown): { statut: 401 | 403; message: string } | null {
  return e instanceof AccesRefuse ? { statut: e.statut, message: e.message } : null;
}

/**
 * Pour une route : la garde, et en cas de refus la réponse toute prête.
 *
 *   const g = await garderRoute(exigerAdmin("cloture"));
 *   if (g.refus) return g.refus;
 *   g.appelant.userId …
 */
export async function garderRoute(
  garde: Promise<Appelant>,
): Promise<{ appelant: Appelant; refus: null } | { appelant: null; refus: Response }> {
  try {
    return { appelant: await garde, refus: null };
  } catch (e) {
    const r = statutRefus(e);
    if (!r) throw e;
    return { appelant: null, refus: Response.json({ error: r.message }, { status: r.statut }) };
  }
}

/**
 * Pour une action qui répond `{ error }` : la garde, et en cas de refus le
 * message tout prêt.
 */
export async function garderAction(
  garde: Promise<Appelant>,
): Promise<{ appelant: Appelant; erreur: null } | { appelant: null; erreur: string }> {
  try {
    return { appelant: await garde, erreur: null };
  } catch (e) {
    const r = statutRefus(e);
    if (!r) throw e;
    return { appelant: null, erreur: r.message };
  }
}
