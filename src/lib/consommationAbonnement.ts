import "server-only";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { calculerSolde } from "@/src/lib/abonnementSolde";
import { categorieJourneePourChiens, type ChienSociabilite } from "@/src/lib/abonnementsTypes";
import { synchroniserComptaAbonnement } from "@/src/lib/comptaAbonnement";

export async function trouverAbonnementUtilisable(clientId: string, categorie: string) {
  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabaseAdmin
    .from("abonnements")
    .select("id, statut, date_expiration, abonnements_mouvements(delta)")
    .eq("client_id", clientId)
    .eq("categorie", categorie)
    .eq("statut", "actif")
    .or(`date_expiration.is.null,date_expiration.gte.${today}`);

  if (!data) return null;

  const avecSolde = data
    .map((abo: any) => ({
      id: abo.id as string,
      statut: abo.statut as string,
      date_expiration: abo.date_expiration as string | null,
      jours_restants: calculerSolde(
        (abo.abonnements_mouvements ?? []) as { delta: number | string }[]
      ),
    }))
    .filter((a) => a.jours_restants >= 1)
    .sort((a, b) => {
      if (a.date_expiration === null && b.date_expiration === null) return 0;
      if (a.date_expiration === null) return 1;
      if (b.date_expiration === null) return -1;
      return a.date_expiration.localeCompare(b.date_expiration);
    });

  return avecSolde[0] ?? null;
}

export async function consommerAbonnementResa(
  reservationId: string,
  clientId: string
): Promise<{ ok?: boolean; error?: string }> {
  const { data: resa } = await supabaseAdmin
    .from("reservations")
    .select(`
      id, client_id, type_reservation, statut, abonnement_id,
      reservation_chiens ( chiens ( doit_etre_isole ) )
    `)
    .eq("id", reservationId)
    .maybeSingle();

  if (!resa || resa.client_id !== clientId) return { error: "Reservation introuvable." };
  if (resa.abonnement_id) return { error: "Cette reservation est deja reglee par une carte." };
  if (resa.type_reservation !== "journee") return { error: "Seules les journees peuvent etre reglees par une carte." };
  if (!["en_attente", "validee"].includes(resa.statut)) return { error: "Cette reservation ne peut pas etre reglee par carte." };

  const dogs = (resa.reservation_chiens ?? [])
    .map((rc: any) => rc.chiens)
    .filter(Boolean) as ChienSociabilite[];
  const categorie = categorieJourneePourChiens(dogs);
  if (!categorie) return { error: "Configuration de chiens non prise en charge par les cartes." };

  const abo = await trouverAbonnementUtilisable(clientId, categorie);
  if (!abo) return { error: "Aucune carte disponible pour cette reservation." };

  const { error: errMvt } = await supabaseAdmin.from("abonnements_mouvements").insert({
    abonnement_id: abo.id,
    client_id: clientId,
    delta: -1,
    type: "consommation",
    reservation_id: reservationId,
    motif: "Journee reglee par carte",
  });
  if (errMvt) return { error: errMvt.message };

  const { error: errResa } = await supabaseAdmin
    .from("reservations")
    .update({ abonnement_id: abo.id, statut_paiement: "paye", mode_paiement: "abonnement" })
    .eq("id", reservationId);
  if (errResa) return { error: errResa.message };

  if (abo.jours_restants - 1 <= 0) {
    await supabaseAdmin.from("abonnements").update({ statut: "epuise" }).eq("id", abo.id);
  }

  await synchroniserComptaAbonnement(abo.id);
  return { ok: true };
}

export async function recrediterAbonnementResa(reservationId: string): Promise<void> {
  const { data: resa } = await supabaseAdmin
    .from("reservations")
    .select("id, abonnement_id, client_id")
    .eq("id", reservationId)
    .maybeSingle();

  if (!resa?.abonnement_id) return;

  await supabaseAdmin.from("abonnements_mouvements").insert({
    abonnement_id: resa.abonnement_id,
    client_id: resa.client_id,
    delta: 1,
    type: "recredit",
    reservation_id: reservationId,
    motif: "Journee recreditee (annulation)",
  });

  await supabaseAdmin
    .from("reservations")
    .update({ abonnement_id: null, statut_paiement: "impaye", mode_paiement: null })
    .eq("id", reservationId);

  const { data: aboData } = await supabaseAdmin
    .from("abonnements")
    .select("statut")
    .eq("id", resa.abonnement_id)
    .maybeSingle();

  if (aboData?.statut === "epuise") {
    await supabaseAdmin
      .from("abonnements")
      .update({ statut: "actif" })
      .eq("id", resa.abonnement_id);
  }

  await synchroniserComptaAbonnement(resa.abonnement_id);
}
