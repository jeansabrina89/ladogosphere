import { supabaseAdmin } from "@/src/lib/supabase-admin";
import {
  versionCourante,
  type Acceptation,
  type DocumentConditions,
} from "@/src/lib/acceptationsConditionsLogique";
import { lireVersionsConditions } from "@/src/lib/conditionsVersions";
import { lireAuteurs } from "@/src/lib/auteursDb";
import { initialesDe } from "@/src/lib/auteur";

/**
 * L'acceptation des conditions — couche base (APP 42).
 *
 * Les écritures passent TOUTES par ici, avec la clé de service : la table n'a
 * aucune politique d'insertion pour `authenticated`, et c'est voulu. Une
 * acceptation doit naître AVEC le geste qu'elle accompagne — la réservation ou
 * la commande — et c'est l'action serveur qui tient les deux ensemble.
 */

export type EcritureAcceptation = {
  clientId: string;
  document: DocumentConditions;
  mode: "en_ligne" | "papier";
  reservationId?: string | null;
  commandeId?: string | null;
  /** Obligatoire pour « papier », interdit pour « en_ligne » (la base le tient). */
  saisiePar?: string | null;
  /** Le papier peut être daté d'un autre jour que sa saisie. */
  accepteeLe?: string | null;
};

/**
 * Enregistre une acceptation. La VERSION n'est jamais reçue de l'appelant :
 * elle est lue à la source, pour qu'aucun écran ne puisse en inventer une.
 */
export async function enregistrerAcceptation(
  e: EcritureAcceptation,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabaseAdmin.from("acceptations_conditions").insert({
    client_id: e.clientId,
    document: e.document,
    version: versionCourante(e.document, await lireVersionsConditions()),
    mode: e.mode,
    reservation_id: e.reservationId ?? null,
    commande_id: e.commandeId ?? null,
    saisie_par: e.mode === "papier" ? (e.saisiePar ?? null) : null,
    ...(e.accepteeLe ? { acceptee_le: e.accepteeLe } : {}),
  });
  if (error) {
    return { ok: false, message: "L'acceptation des conditions n'a pas pu être enregistrée." };
  }
  return { ok: true };
}

/** Les acceptations d'un client, la plus récente d'abord. */
export async function acceptationsDuClient(clientId: string): Promise<Acceptation[]> {
  const { data } = await supabaseAdmin
    .from("acceptations_conditions")
    .select("document, version, acceptee_le, mode, saisie_par")
    .eq("client_id", clientId)
    .order("acceptee_le", { ascending: false });

  const lignes = (data ?? []) as unknown as {
    document: string; version: string; acceptee_le: string; mode: string; saisie_par: string | null;
  }[];

  /*
   * Les initiales de qui a saisi un papier, par le MÊME chemin que le journal
   * des gestes : `lireAuteurs` va chercher la fiche RH avant le profil, et
   * `initialesDe` en tire les deux lettres. Les recalculer ici aurait donné
   * « JS » d'un côté et « J.S. » de l'autre pour la même personne.
   */
  const auteurs = await lireAuteurs(lignes.map((l) => l.saisie_par));

  return lignes.map((l) => ({
    document: l.document,
    version: l.version,
    acceptee_le: l.acceptee_le,
    mode: l.mode,
    saisiePar: l.saisie_par ? initialesDe(auteurs.get(l.saisie_par)) : null,
  }));
}

/**
 * Les clients qui n'ont JAMAIS accepté les conditions de la pension.
 *
 * Une seule requête pour toute une liste — l'écran des arrivées en affiche
 * vingt d'un coup, et vingt allers-retours pour une pastille seraient vingt
 * fois trop.
 */
export async function clientsSansConditionsPension(
  clientIds: readonly string[],
): Promise<Set<string>> {
  const ids = [...new Set(clientIds.filter(Boolean))];
  if (ids.length === 0) return new Set();

  const { data } = await supabaseAdmin
    .from("acceptations_conditions")
    .select("client_id")
    .eq("document", "pension")
    .in("client_id", ids);

  const avec = new Set(((data ?? []) as { client_id: string }[]).map((l) => l.client_id));
  return new Set(ids.filter((id) => !avec.has(id)));
}
