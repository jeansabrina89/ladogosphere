import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Ce qu'on attend d'un client Supabase ici : lire l'utilisateur et un profil. */
type SupabaseClientLike = SupabaseClient;
import { createClient } from "../utils/supabase/server";
import type { PerimetreStock, NiveauStock } from "./perimetreStock";
import type { PermissionPersonnel } from "./permissionsCatalogue";
import {
  AccesRefuse,
  lireAppelant,
  verifierAppelant,
  type Exigence,
} from "./garde";

/**
 * Les gardes historiques, gardées pour leur façon de RÉPONDRE (objet d'erreur
 * pour une action, 401/403 pour une route) et pour leurs messages. La décision,
 * elle, se prend en un seul endroit : `verifierAppelant` (garde.ts), qui lit
 * l'utilisateur par `getUser()`, relit le profil — `actif` compris — et
 * journalise chaque refus.
 */

type ClientSession = Awaited<ReturnType<typeof createClient>>;

/** Le refus traduit dans le message qu'affichait la garde historique. */
async function tenter(
  exigence: Exigence,
  messages: { role: string; permission?: string },
  client?: SupabaseClientLike,
): Promise<{ ok: true; userId: string; isAdmin: boolean } | { ok: false; statut: 401 | 403; message: string }> {
  try {
    const a = await verifierAppelant(exigence, { client: client as unknown as ClientSession | undefined });
    return { ok: true, userId: a.userId, isAdmin: a.isAdmin };
  } catch (e) {
    if (!(e instanceof AccesRefuse)) throw e;
    const message =
      e.motif === "non_connecte" ? "Non connecté"
      : e.motif === "inactif" ? "Compte désactivé"
      : e.motif === "permission" && messages.permission ? messages.permission
      : messages.role;
    return { ok: false, statut: e.statut, message };
  }
}

const RESERVE_ADMIN = "Accès réservé à l'admin";
const RESERVE_PERSONNEL = "Accès réservé au personnel";

// ── API Routes ──────────────────────────────────────────────────────────────

export async function exigerPersonnel(supabase: SupabaseClientLike): Promise<NextResponse | null> {
  const r = await tenter({}, { role: RESERVE_PERSONNEL }, supabase);
  return r.ok ? null : NextResponse.json({ error: r.message }, { status: r.statut });
}

export async function exigerPermissionApi(supabase: SupabaseClientLike, perm: string): Promise<NextResponse | null> {
  const r = await tenter({ permissions: [perm as PermissionPersonnel] }, { role: RESERVE_ADMIN }, supabase);
  return r.ok ? null : NextResponse.json({ error: r.message }, { status: r.statut });
}

// ── Server Actions ───────────────────────────────────────────────────────────

export async function verifierPermission(
  perm: string
): Promise<{ error?: string; userId?: string; isAdmin?: boolean }> {
  const r = await tenter({ permissions: [perm as PermissionPersonnel] }, { role: RESERVE_ADMIN });
  return r.ok ? { userId: r.userId, isAdmin: r.isAdmin } : { error: r.message };
}

/**
 * Réservé à l'admin, sans délégation possible à un employé.
 * Pour les gestes comptables sensibles (resynchronisation, export du grand livre).
 */
export async function verifierAdmin(): Promise<{ error?: string; userId?: string }> {
  const r = await tenter({ adminSeul: true }, { role: RESERVE_ADMIN });
  return r.ok ? { userId: r.userId } : { error: r.message };
}

/** Même règle que verifierAdmin, côté Route Handler. */
export async function exigerAdminApi(supabase: SupabaseClientLike): Promise<NextResponse | null> {
  const r = await tenter({ adminSeul: true }, { role: RESERVE_ADMIN }, supabase);
  return r.ok ? null : NextResponse.json({ error: r.message }, { status: r.statut });
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
  /** Les prestations des locataires de box (tâches du jour, fiche de locataire). */
  perm_prestations: boolean;
};

/**
 * Ce que l'écran peut montrer. Même lecture que la garde : un profil
 * désactivé, ou un client, n'a aucune permission de personnel.
 */
export async function getProfilePerms(): Promise<ProfilePerms> {
  const appelant = await lireAppelant();
  if (!appelant || !appelant.actif) return falsePerms();
  const isAdmin = appelant.isAdmin;
  const p = appelant.permissions;
  // Un client n'a aucune colonne perm_* vraie, mais on ne s'y fie pas.
  const personnel = isAdmin || appelant.role === "employe";
  const v = (cle: PermissionPersonnel) => personnel && p[cle];

  return {
    isAdmin,
    perm_chiens_creer: v("perm_chiens_creer"),
    perm_chiens_modifier: v("perm_chiens_modifier"),
    perm_clients_creer: v("perm_clients_creer"),
    perm_clients_modifier: v("perm_clients_modifier"),
    perm_depenses: v("perm_depenses"),
    // La gestion emporte la vente : voir permissionsEffectives.
    perm_boutique_vente: v("perm_boutique_vente"),
    perm_boutique_gestion: v("perm_boutique_gestion"),
    // L'atelier ne découle d'aucune permission boutique : on peut tenir le
    // magasin sans toucher aux fournitures de fabrication, et l'inverse.
    perm_atelier: v("perm_atelier"),
    perm_reservations_creer: v("perm_reservations_creer"),
    perm_reservations_modifier: v("perm_reservations_modifier"),
    perm_reservations_annuler: v("perm_reservations_annuler"),
    perm_journee_essai: v("perm_journee_essai"),
    perm_encaissements: v("perm_encaissements"),
    perm_factures: v("perm_factures"),
    perm_tarifs_urgence: v("perm_tarifs_urgence"),
    perm_checkin: v("perm_checkin"),
    perm_box: v("perm_box"),
    perm_planning: v("perm_planning"),
    perm_timbrage_equipe: v("perm_timbrage_equipe"),
    perm_vacances_equipe: v("perm_vacances_equipe"),
    perm_prestations: v("perm_prestations"),
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
    perm_prestations: false,
  };
}

// ── Boutique : deux niveaux, et la gestion emporte la vente ─────────────────

function messageBoutique(niveau: "vente" | "gestion"): string {
  return niveau === "gestion"
    ? "Cette action demande la permission « Boutique — gestion »."
    : "Cette action demande la permission « Boutique — vente ».";
}

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
  const r = await tenter(
    { permissions: [niveau === "gestion" ? "perm_boutique_gestion" : "perm_boutique_vente"] },
    { role: RESERVE_PERSONNEL, permission: messageBoutique(niveau) },
  );
  return r.ok ? { userId: r.userId, isAdmin: r.isAdmin } : { error: r.message };
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
      error: verif.error === RESERVE_ADMIN
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
  const r = await tenter(
    { permissions: [niveau === "gestion" ? "perm_boutique_gestion" : "perm_boutique_vente"] },
    { role: RESERVE_PERSONNEL, permission: messageBoutique(niveau) },
    supabase,
  );
  return r.ok ? null : NextResponse.json({ error: r.message }, { status: r.statut });
}
