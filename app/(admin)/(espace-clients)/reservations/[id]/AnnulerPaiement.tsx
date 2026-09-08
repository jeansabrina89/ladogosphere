"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { annulerPaiement } from "@/app/(admin)/(espace-comptabilite)/factures/actions";

const MARINE = "#1B2B5E";

/** Annuler un encaissement : geste séparé, motivé, jamais une suppression. */
export default function AnnulerPaiement({
  paiementId,
  montant,
}: {
  paiementId: string;
  montant: number;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  const [destination, setDestination] = useState<"rembourser" | "avoir">("rembourser");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const router = useRouter();

  async function valider() {
    if (!motif.trim()) { setErreur("Le motif est obligatoire."); return; }
    setEnCours(true);
    setErreur(null);
    const fd = new FormData();
    fd.set("paiement_id", paiementId);
    fd.set("motif", motif.trim());
    fd.set("destination", destination);
    const res = await annulerPaiement(fd);
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    setOuvert(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => { setMotif(""); setErreur(null); setOuvert(true); }}
        className="px-3 py-1 rounded-lg text-xs font-semibold"
        style={{ backgroundColor: "#FBE2DE", color: "#A8453A" }}
      >
        Annuler ce paiement
      </button>

      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-1" style={{ color: MARINE }}>Annuler un encaissement</h2>
            <p className="text-sm mb-4" style={{ color: "rgba(27,43,94,0.6)" }}>
              Versement de {montant.toFixed(2)} CHF. Le mouvement est contre-passé, jamais effacé.
            </p>

            <label className="block text-sm font-semibold mb-1" style={{ color: MARINE }}>
              Motif <span style={{ color: "#A8453A" }}>*</span>
            </label>
            <textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={2}
                      placeholder="Erreur de saisie, chèque sans provision…"
                      className="w-full border rounded-xl p-2.5 text-sm mb-4" />

            <label className="block text-sm font-semibold mb-1" style={{ color: MARINE }}>
              Que devient l&apos;argent ?
            </label>
            <div className="flex gap-2 mb-4">
              {([["rembourser", "Rembourser"], ["avoir", "Mettre en avoir"]] as const).map(([v, l]) => (
                <button key={v} type="button" onClick={() => setDestination(v)}
                        className="flex-1 px-3 py-2 rounded-xl text-sm font-semibold border"
                        style={{
                          backgroundColor: destination === v ? MARINE : "white",
                          color: destination === v ? "white" : MARINE,
                          borderColor: destination === v ? MARINE : "rgba(27,43,94,0.2)",
                        }}>
                  {l}
                </button>
              ))}
            </div>

            {erreur && (
              <p className="text-sm mb-3 px-3 py-2 rounded-lg"
                 style={{ backgroundColor: "#FBE2DE", color: "#A8453A" }}>{erreur}</p>
            )}

            <div className="flex gap-3">
              <button onClick={valider} disabled={enCours}
                      className="flex-1 py-2.5 rounded-xl font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: "#E8847A" }}>
                {enCours ? "…" : "Confirmer l'annulation"}
              </button>
              <button onClick={() => setOuvert(false)} className="px-4 py-2.5 rounded-xl font-semibold"
                      style={{ backgroundColor: "#EDE8DF", color: MARINE }}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
