"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { creerFactureAcompte } from "../../factures/actionsCreation";

const MARINE = "#1B2B5E";

/** Facture d'acompte sur une réservation validée : montant libre. */
export default function DemanderAcompte({
  reservationId,
  maximum,
}: {
  reservationId: string;
  maximum: number;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [montant, setMontant] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const router = useRouter();

  async function valider() {
    const valeur = parseFloat(montant.replace(",", "."));
    if (!Number.isFinite(valeur) || valeur <= 0) { setErreur("Montant invalide."); return; }
    setEnCours(true);
    setErreur(null);
    const fd = new FormData();
    fd.set("reservation_id", reservationId);
    fd.set("montant", String(valeur));
    const res = await creerFactureAcompte(fd);
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    setOuvert(false);
    if (res.factureId) router.push(`/factures/${res.factureId}`);
    else router.refresh();
  }

  return (
    <>
      <button onClick={() => { setMontant(""); setErreur(null); setOuvert(true); }}
              className="px-5 py-2.5 rounded-xl font-semibold"
              style={{ backgroundColor: "#F4EAC9", color: "#6E5410" }}>
        Demander un acompte
      </button>

      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-sm">
            <h2 className="text-xl font-bold mb-1" style={{ color: MARINE }}>Demander un acompte</h2>
            <p className="text-sm mb-4" style={{ color: "rgba(27,43,94,0.6)" }}>
              Une facture d&apos;acompte est émise et envoyée au client. Elle sera déduite de la facture finale.
            </p>

            <label className="block text-sm font-semibold mb-1" style={{ color: MARINE }}>Montant</label>
            <div className="flex items-center gap-2 mb-1">
              <input type="text" inputMode="decimal" value={montant}
                     onChange={(e) => setMontant(e.target.value)}
                     className="flex-1 border rounded-xl p-3 text-lg font-bold" style={{ color: MARINE }} />
              <span className="font-semibold" style={{ color: MARINE }}>CHF</span>
            </div>
            <p className="text-xs mb-4" style={{ color: "rgba(27,43,94,0.5)" }}>
              Au maximum {maximum.toFixed(2)} CHF.
            </p>

            {erreur && (
              <p className="text-sm mb-3 px-3 py-2 rounded-lg"
                 style={{ backgroundColor: "#FBE2DE", color: "#A8453A" }}>{erreur}</p>
            )}

            <div className="flex gap-3">
              <button onClick={valider} disabled={enCours}
                      className="flex-1 py-2.5 rounded-xl font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: MARINE }}>
                {enCours ? "…" : "Émettre l'acompte"}
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
