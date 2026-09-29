import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import EnTete from "@/app/components/ui/EnTete";
import { aujourdhuiISO } from "@/src/lib/dates";
import { fermeturesPension } from "@/src/lib/fermeturesPension";
import {
  fermetureAVenir,
  reservationsAContacter,
} from "@/src/lib/fermeturesPensionLogique";
import FormFermetures, { type ReservationTouchee } from "./FormFermetures";

export const dynamic = "force-dynamic";

/**
 * 🔒 Fermetures de la pension (APP 59).
 *
 * ── CE QUE CET ÉCRAN FAIT ─────────────────────────────────────────────────
 *
 * Il ferme la pension sur une période : pendant ces jours, aucune arrivée et
 * aucun départ. Les chiens déjà en séjour restent — un séjour qui enjambe la
 * fermeture reste possible, c'est même celui-là que la fermeture doit laisser
 * passer.
 *
 * ── CE QU'IL NE FAIT PAS ──────────────────────────────────────────────────
 *
 * Il n'annule aucune réservation. Celles qui tombent dans une période sont
 * NOMMÉES, sous « À contacter » : c'est un appel à passer, pas une ligne à
 * effacer. Et il ne ferme rien pour le personnel, qui peut toujours saisir un
 * cas particulier — il en est averti.
 *
 * Effet de bord voulu : une journée d'essai tombant un jour de fermeture est
 * fermée d'office. Inutile de la fermer aussi dans « Essais fermés ».
 */
export default async function FermeturesPensionPage() {
  await exigerAdminPage();

  const jour = aujourdhuiISO();
  const fermetures = await fermeturesPension();

  // Les réservations à venir, pour nommer celles que chaque période touche.
  const { data: resas } = await supabaseAdmin
    .from("reservations")
    .select("id, date_debut, date_fin, statut, clients (prenom, nom), reservation_chiens (chiens (nom))")
    .in("statut", ["validee", "en_attente"])
    .gte("date_fin", jour)
    .order("date_debut");

  const reservations: ReservationTouchee[] = ((resas ?? []) as unknown as {
    id: string; date_debut: string; date_fin: string;
    clients: { prenom: string | null; nom: string | null } | null;
    reservation_chiens: { chiens: { nom: string | null } | null }[] | null;
  }[]).map((r) => ({
    id: r.id,
    date_debut: r.date_debut,
    date_fin: r.date_fin,
    client: `${r.clients?.prenom ?? ""} ${r.clients?.nom ?? ""}`.trim() || "client inconnu",
    chiens: (r.reservation_chiens ?? [])
      .map((rc) => rc.chiens?.nom ?? "")
      .filter((n) => n !== "")
      .join(", "),
  }));

  const aVenir = fermetures.filter((f) => fermetureAVenir(f, jour));
  const passees = fermetures.filter((f) => !fermetureAVenir(f, jour));

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", minWidth: 0 }}>
        <EnTete
          titre="🔒 Fermetures de la pension"
          sousTitre="Les périodes où l'on n'accueille ni n'rend aucun chien. Un séjour qui enjambe la fermeture reste possible."
        />

        <FormFermetures
          aVenir={aVenir}
          passees={passees}
          reservations={reservations}
          touchees={Object.fromEntries(
            aVenir.map((f) => [f.id, reservationsAContacter(reservations, f).map((r) => r.id)]),
          )}
        />
      </div>
    </main>
  );
}
