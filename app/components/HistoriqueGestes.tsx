import { formatHorodatage } from "@/src/lib/dates";
import type { LigneHistorique } from "@/src/lib/journalEvenements";
import AuteurGeste from "./AuteurGeste";

/** Au-delà, les lignes plus anciennes se replient. */
export const LIGNES_VISIBLES = 8;

function Ligne({ h }: { h: LigneHistorique }) {
  return (
    <li className="text-sm" style={{ padding: "6px 0", borderBottom: "1px solid rgba(27,43,94,0.06)" }}>
      <span style={{ color: "rgba(27,43,94,0.6)", fontVariantNumeric: "tabular-nums" }}>
        {formatHorodatage(h.created_at)}
      </span>
      {" · "}
      <span style={{ color: "#1B2B5E", fontWeight: 600 }}>{h.libelle}</span>
      {" · "}
      <AuteurGeste auteur={h.auteur} />
      {h.motif && <div style={{ color: "rgba(27,43,94,0.6)", marginTop: 2 }}>{h.motif}</div>}
    </li>
  );
}

/**
 * L'historique d'une fiche : chaque geste, le plus récent d'abord, avec qui
 * l'a fait. « 14.09.2026 17:32 · Départ · SJ ».
 *
 * Réservé aux écrans du personnel. L'espace client ne l'importe jamais.
 */
export default function HistoriqueGestes({
  lignes,
  titre = "Historique",
}: {
  lignes: LigneHistorique[];
  titre?: string;
}) {
  const visibles = lignes.slice(0, LIGNES_VISIBLES);
  const repliees = lignes.slice(LIGNES_VISIBLES);

  return (
    <section className="border rounded-xl p-4 mb-6" style={{ borderColor: "rgba(27,43,94,0.15)" }}
      aria-label={titre}>
      <h2 className="font-bold mb-2" style={{ color: "#1B2B5E" }}>{titre}</h2>
      {lignes.length === 0 ? (
        <p className="text-sm" style={{ color: "rgba(27,43,94,0.5)" }}>Aucun geste enregistré.</p>
      ) : (
        <>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {visibles.map((h) => <Ligne key={h.id} h={h} />)}
          </ul>
          {repliees.length > 0 && (
            <details className="mt-2">
              <summary className="text-sm cursor-pointer" style={{ color: "#4AAEA0", fontWeight: 600 }}>
                {repliees.length === 1 ? "Voir la ligne plus ancienne" : `Voir les ${repliees.length} lignes plus anciennes`}
              </summary>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {repliees.map((h) => <Ligne key={h.id} h={h} />)}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
