"use client";

import { useEffect, useState } from "react";
import { appelerApi } from "@/src/lib/reseau";
import { poidsLisible, type Inventaire } from "@/src/lib/exportComptableLogique";

/**
 * L'inventaire d'un exercice, à l'écran. LECTURE SEULE.
 *
 * Aucun bouton d'action, pas même désactivé : rien n'est encore fabricable, et
 * un bouton grisé invite à revenir voir. Il n'y a rien à revenir chercher.
 */

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const GRIS = "#6B7280";
const MARINE = "#1B2B5E";

export default function InventaireExport({ exercices, exerciceInitial }: {
  exercices: number[];
  exerciceInitial: number;
}) {
  const [exercice, setExercice] = useState(exerciceInitial);
  const [inventaire, setInventaire] = useState<Inventaire | null>(null);
  // Vrai dès le départ : au premier rendu, la lecture est effectivement en
  // cours. L'attente se rallume dans le gestionnaire du sélecteur, jamais dans
  // l'effet — y poser un état déclenche des rendus en cascade.
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;
    void (async () => {
      const r = await appelerApi<Inventaire>(
        "ExportComptable.inventaire",
        `/api/export-comptable/inventaire?exercice=${exercice}`,
        {},
        {
          toujours: () => { if (vivant) setChargement(false); },
          siEchec: (phrase) => { if (vivant) setErreur(phrase); },
        },
      );
      if (!vivant) return;
      if (!r.ok) return; // l'écran garde ce qu'il montrait, et dit pourquoi
      setErreur(null);
      setInventaire(r.valeur);
    })();
    return () => { vivant = false; };
  }, [exercice]);

  const anomalies = inventaire?.anomalies;
  const nbAnomalies = anomalies
    ? anomalies.manquants.length + anomalies.orphelins.length + anomalies.originauxManquants.length
    : 0;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <label htmlFor="exercice" className="text-sm" style={{ color: GRIS }}>Exercice</label>
        <select
          id="exercice"
          value={exercice}
          onChange={(e) => { setChargement(true); setExercice(Number(e.target.value)); }}
          className="rounded-lg border px-3 py-2"
        >
          {exercices.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {chargement && <span className="text-sm" style={{ color: GRIS }}>Lecture en cours…</span>}
      </div>

      {erreur && (
        <p role="alert" className="mb-4 p-3 rounded-xl text-sm font-semibold"
          style={{ backgroundColor: "#FDECEC", color: "#8A1F1F", border: "1px solid #F0C2C2" }}>
          {erreur}
        </p>
      )}

      {inventaire && (
        <>
          <table className="w-full text-sm mb-6">
            <thead>
              <tr style={{ backgroundColor: MARINE, color: "white" }}>
                <th className="text-left p-2">Mois</th>
                <th className="text-right p-2">Factures</th>
                <th className="text-right p-2">Justificatifs</th>
                <th className="text-right p-2">Originaux</th>
                <th className="text-right p-2">Poids</th>
              </tr>
            </thead>
            <tbody>
              {inventaire.mois.map((m) => (
                <tr key={m.mois} className="border-b">
                  <td className="p-2">{MOIS[m.mois - 1]}</td>
                  <td className="p-2 text-right">{m.nbFactures || "—"}</td>
                  <td className="p-2 text-right">{m.nbPieces || "—"}</td>
                  <td className="p-2 text-right">{m.nbOriginaux || "—"}</td>
                  <td className="p-2 text-right">{m.octets ? poidsLisible(m.octets) : "—"}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="p-2">Total {inventaire.exercice}</td>
                <td className="p-2 text-right">{inventaire.total.nbFactures}</td>
                <td className="p-2 text-right">{inventaire.total.nbPieces}</td>
                <td className="p-2 text-right">{inventaire.total.nbOriginaux}</td>
                <td className="p-2 text-right">{poidsLisible(inventaire.total.octets)}</td>
              </tr>
            </tbody>
          </table>

          <p className="mb-6" style={{ color: MARINE }}>
            L&apos;export de l&apos;exercice {inventaire.exercice} pèsera{" "}
            <strong>{poidsLisible(inventaire.total.octets)}</strong>, pour{" "}
            {inventaire.total.nbFactures} facture(s) et {inventaire.total.nbPieces} justificatif(s).
          </p>

          <section>
            <h2 className="font-semibold mb-2" style={{ color: MARINE }}>
              Anomalies {nbAnomalies > 0 ? `(${nbAnomalies})` : ""}
            </h2>
            {nbAnomalies === 0 ? (
              <p style={{ color: GRIS }}>
                Aucune : tout ce que la base désigne est présent, et le stockage ne porte rien
                d&apos;inconnu dans les dossiers parcourus.
              </p>
            ) : (
              <div role="alert" className="p-3 rounded-xl"
                style={{ backgroundColor: "#FDECEC", color: "#8A1F1F", border: "1px solid #F0C2C2" }}>
                {anomalies!.manquants.length > 0 && (
                  <div className="mb-3">
                    <p className="font-semibold">
                      Référencés en base, absents du stockage ({anomalies!.manquants.length})
                    </p>
                    <ul className="list-disc ml-5">
                      {anomalies!.manquants.map((a) => (
                        <li key={a.chemin}><code>{a.chemin}</code> — {a.dateComptable}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {anomalies!.originauxManquants.length > 0 && (
                  <div className="mb-3">
                    <p className="font-semibold">
                      Original annoncé, fichier absent ({anomalies!.originauxManquants.length})
                    </p>
                    <ul className="list-disc ml-5">
                      {anomalies!.originauxManquants.map((a) => (
                        <li key={a.chemin}><code>{a.chemin}</code> — {a.dateComptable}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {anomalies!.orphelins.length > 0 && (
                  <div>
                    <p className="font-semibold">
                      Dans le stockage, désignés par rien ({anomalies!.orphelins.length})
                    </p>
                    <ul className="list-disc ml-5">
                      {anomalies!.orphelins.map((a) => (
                        <li key={a.chemin}><code>{a.chemin}</code> — {poidsLisible(a.octets)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>

          <p className="mt-6 text-xs" style={{ color: GRIS }}>
            Poids lus sur les objets réels du stockage — {inventaire.appelsStockage} appel(s).
            L&apos;appartenance à l&apos;exercice suit la date comptable (facture, dépense,
            paiement), jamais la date de dépôt du fichier.
          </p>
        </>
      )}
    </div>
  );
}
