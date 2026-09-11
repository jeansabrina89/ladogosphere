import Link from "next/link";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { aujourdhuiISO, formatDateFR } from "@/src/lib/dates";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import ListeTaches from "./ListeTaches";
import { regenererTous, tachesDuJour } from "@/src/lib/prestationsDb";
import { MENTION_HORS_PENSION } from "@/src/lib/prestationsLogique";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.6)";

/**
 * Les tâches du jour chez les locataires de box.
 *
 * C'est l'écran qu'une employée garde ouvert : une colonne, des cibles de
 * 44 px, lisible à 375 px d'une main. Rien d'autre n'y entre.
 *
 * L'ouverture régénère la fenêtre glissante de quatorze jours. C'est
 * idempotent : relancer ne duplique rien, et aucune tâche déjà faite n'est
 * touchée. Pas de tâche planifiée nocturne à surveiller — l'écran qu'on ouvre
 * chaque matin fait le travail.
 */
export default async function PrestationsAujourdhuiPage() {
  const acces = await exigerAccesAdmin("perm_prestations");
  const jour = aujourdhuiISO();

  await regenererTous(jour);
  const taches = await tachesDuJour(jour);

  const aFaire = taches.filter((t) => t.statut === "a_faire").length;
  const faites = taches.filter((t) => t.statut === "faite").length;
  const gardes = taches.filter((t) => t.garde && t.statut !== "annulee").length;
  const peutAnnuler = acces.isAdmin || acces.permissions.perm_encaissements === true;

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-8" style={{ backgroundColor: "#F5F0E8" }}>
      {/* Une seule colonne, même sur grand écran : c'est une liste qu'on descend. */}
      <div style={{ maxWidth: 640, margin: "0 auto", minWidth: 0 }}>
        <EnTete
          titre="🧹 Prestations du jour"
          sousTitre={`${formatDateFR(jour)} — ${aFaire} à faire, ${faites} faite(s)`}
          action={<Bouton href="/prestations/planning" variante="secondaire">🗂️ La semaine</Bouton>}
        />

        {gardes > 0 && (
          <p style={{
            background: "#F4EAC9", border: "1px solid #C9A84C", color: "#6E5410",
            borderRadius: 14, padding: "10px 12px", fontSize: 14, fontWeight: 600,
            margin: "0 0 16px",
          }}>
            🏠 {gardes} chien{gardes > 1 ? "s" : ""}{" "}sous garde complète aujourd&apos;hui.
            La pension en répond 24 h, dans son propre box.
          </p>
        )}

        <ListeTaches taches={taches} peutAnnuler={peutAnnuler} />

        <p style={{ color: SOUS, fontSize: 12, marginTop: 24, borderTop: "1px solid rgba(27,43,94,.08)", paddingTop: 12 }}>
          {MENTION_HORS_PENSION}
        </p>
        <p style={{ color: SOUS, fontSize: 12, margin: "6px 0 0" }}>
          <Link href="/prestations/locataires" style={{ color: MARINE, fontWeight: 600 }}>
            Voir les locataires
          </Link>
        </p>
      </div>
    </main>
  );
}
