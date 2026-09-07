"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { encaisser } from "./actions";
import { MODES_ENCAISSEMENT } from "@/src/lib/factureStatut";

// Le SEUL composant d'encaissement de l'application : liste des réservations,
// fiche réservation, fiche facture. Un versement, jamais un cumul.

const MARINE = "#1B2B5E";

export default function Encaisser({
  factureId,
  reservationId,
  resteDu,
  libellePiece,
  variante = "principal",
}: {
  factureId?: string | null;
  reservationId?: string | null;
  /** Reste à payer : pré-remplit le montant, et le plafonne. */
  resteDu: number;
  libellePiece?: string;
  variante?: "principal" | "compact";
}) {
  const aujourdhui = new Date().toISOString().split("T")[0];
  const [ouvert, setOuvert] = useState(false);
  const [montant, setMontant] = useState(resteDu.toFixed(2));
  const [mode, setMode] = useState("");
  const [date, setDate] = useState(aujourdhui);
  const [reference, setReference] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const router = useRouter();

  const ouvrir = () => {
    setMontant(resteDu.toFixed(2));
    setMode("");
    setDate(aujourdhui);
    setReference("");
    setErreur(null);
    setAvis(null);
    setOuvert(true);
  };

  const valider = async () => {
    if (!mode) { setErreur("Choisissez un mode de paiement."); return; }
    const valeur = parseFloat(montant.replace(",", "."));
    if (!Number.isFinite(valeur) || valeur <= 0) { setErreur("Montant invalide."); return; }

    setEnCours(true);
    setErreur(null);

    const fd = new FormData();
    if (factureId) fd.set("facture_id", factureId);
    if (reservationId) fd.set("reservation_id", reservationId);
    fd.set("montant", String(valeur));
    fd.set("mode", mode);
    fd.set("date_paiement", date);
    fd.set("reference", reference);
    // Un double clic rejoue le même versement : il n'en crée pas deux.
    fd.set("cle_idempotence", [factureId ?? reservationId, valeur.toFixed(2), date, mode].join(":"));

    const res = await encaisser(fd);
    setEnCours(false);

    if (res.error) { setErreur(res.error); return; }
    if (res.arrondi && res.arrondi !== 0) {
      setAvis(`Arrondi des espèces : ${res.arrondi > 0 ? "+" : ""}${res.arrondi.toFixed(2)} CHF.`);
      setTimeout(() => { setOuvert(false); router.refresh(); }, 1800);
      return;
    }
    setOuvert(false);
    router.refresh();
  };

  const styleBouton = variante === "compact"
    ? { padding: "4px 12px", fontSize: 12, borderRadius: 8 }
    : { padding: "10px 20px", fontSize: 14, borderRadius: 12 };

  return (
    <>
      <button
        onClick={ouvrir}
        className="font-semibold text-white transition"
        style={{ backgroundColor: "#4AAEA0", ...styleBouton }}
      >
        💳 Encaisser
      </button>

      {ouvert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-1" style={{ color: MARINE }}>Encaisser</h2>
            {libellePiece && (
              <p className="text-sm mb-4" style={{ color: "rgba(27,43,94,0.6)" }}>{libellePiece}</p>
            )}

            <label className="block text-sm font-semibold mb-1" style={{ color: MARINE }}>
              Montant du versement
            </label>
            <div className="flex items-center gap-2 mb-1">
              <input
                type="text"
                inputMode="decimal"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                className="flex-1 border rounded-xl p-3 text-lg font-bold"
                style={{ color: MARINE }}
              />
              <span className="font-semibold" style={{ color: MARINE }}>CHF</span>
            </div>
            <p className="text-xs mb-4" style={{ color: "rgba(27,43,94,0.5)" }}>
              Reste à payer : {resteDu.toFixed(2)} CHF. Un versement partiel est accepté.
            </p>

            <label className="block text-sm font-semibold mb-1" style={{ color: MARINE }}>
              Mode de paiement
            </label>
            <div className="flex flex-wrap gap-2 mb-4">
              {MODES_ENCAISSEMENT.map((m) => (
                <button
                  key={m.valeur}
                  type="button"
                  onClick={() => setMode(m.valeur)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold border transition"
                  style={{
                    backgroundColor: mode === m.valeur ? MARINE : "white",
                    color: mode === m.valeur ? "white" : MARINE,
                    borderColor: mode === m.valeur ? MARINE : "rgba(27,43,94,0.2)",
                  }}
                >
                  {m.libelle}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: MARINE }}>Date</label>
                <input
                  type="date"
                  value={date}
                  max={aujourdhui}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border rounded-xl p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: MARINE }}>
                  Référence <span className="font-normal text-xs">(facultatif)</span>
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="N° de virement…"
                  className="w-full border rounded-xl p-2.5 text-sm"
                />
              </div>
            </div>

            {erreur && (
              <p className="text-sm mb-3 px-3 py-2 rounded-lg"
                 style={{ backgroundColor: "#FBE2DE", color: "#A8453A" }}>{erreur}</p>
            )}
            {avis && (
              <p className="text-sm mb-3 px-3 py-2 rounded-lg"
                 style={{ backgroundColor: "#DBEFEA", color: "#1F6E5B" }}>{avis}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={valider}
                disabled={enCours}
                className="flex-1 py-2.5 rounded-xl font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#4AAEA0" }}
              >
                {enCours ? "…" : "Valider l'encaissement"}
              </button>
              <button
                onClick={() => setOuvert(false)}
                className="px-4 py-2.5 rounded-xl font-semibold"
                style={{ backgroundColor: "#EDE8DF", color: MARINE }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
