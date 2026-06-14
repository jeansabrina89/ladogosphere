"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { modifierPrixSejour, ajouterExtraReservation, supprimerExtraReservation } from "./actions";
import { messageEcart } from "../../../src/lib/facturation";

type Extra = { id: string; libelle: string; montant: number };

const STATUTS_CLOTURES = ["terminee", "annulee", "refusee"];

export default function GestionPrix({
  reservation_id,
  statut,
  montant_calcule,
  ajustement_manuel,
  montant_final,
  extras,
  perm_reservations_modifier,
}: {
  reservation_id: string;
  statut: string | null;
  montant_calcule: number | null;
  ajustement_manuel: number | null;
  montant_final: number | null;
  extras: Extra[];
  perm_reservations_modifier: boolean;
}) {
  const router = useRouter();
  const cloturee = !!statut && STATUTS_CLOTURES.includes(statut);
  const editable = !cloturee && perm_reservations_modifier;

  const calcule = Number(montant_calcule) || 0;
  const ajustement = Number(ajustement_manuel) || 0;
  const prixRetenuInitial = calcule + ajustement;

  const [prixSejour, setPrixSejour] = useState(prixRetenuInitial.toFixed(2));
  const [loadingPrix, setLoadingPrix] = useState(false);
  const [libelleExtra, setLibelleExtra] = useState("");
  const [montantExtra, setMontantExtra] = useState("");
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [suppressionId, setSuppressionId] = useState<string | null>(null);
  const [ecartMsg, setEcartMsg] = useState<string | null>(null);

  const handleEnregistrerPrix = async () => {
    const valeur = parseFloat(prixSejour);
    if (isNaN(valeur) || valeur < 0) { alert("Montant invalide."); return; }
    setLoadingPrix(true);
    setEcartMsg(null);
    const res = await modifierPrixSejour(reservation_id, valeur);
    if (res.error) { alert(res.error); setLoadingPrix(false); return; }
    setEcartMsg(messageEcart(res.type_ecart, res.ecart));
    router.refresh();
    setLoadingPrix(false);
  };

  const handleAjouterExtra = async () => {
    const valeur = parseFloat(montantExtra);
    if (!libelleExtra.trim()) { alert("Indique un libellé."); return; }
    if (isNaN(valeur) || valeur === 0) { alert("Montant invalide."); return; }
    setLoadingExtra(true);
    setEcartMsg(null);
    const res = await ajouterExtraReservation(reservation_id, libelleExtra, valeur);
    if (res.error) { alert(res.error); setLoadingExtra(false); return; }
    setLibelleExtra("");
    setMontantExtra("");
    setEcartMsg(messageEcart(res.type_ecart, res.ecart));
    router.refresh();
    setLoadingExtra(false);
  };

  const handleSupprimerExtra = async (id: string) => {
    if (!confirm("Supprimer cette ligne ?")) return;
    setSuppressionId(id);
    setEcartMsg(null);
    const res = await supprimerExtraReservation(id);
    if (res.error) { alert(res.error); setSuppressionId(null); return; }
    setEcartMsg(messageEcart(res.type_ecart, res.ecart));
    router.refresh();
    setSuppressionId(null);
  };

  return (
    <div className="border-t pt-6 mb-6">
      <h2 className="text-2xl font-bold mb-4" style={{ color: "#1B2B5E" }}>🧾 Détail du tarif</h2>

      <div className="bg-slate-50 rounded-xl p-4 space-y-4">

        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Calculé automatiquement</span>
          <span className="font-semibold">{calcule.toFixed(2)} CHF</span>
        </div>

        <div>
          <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
            Prix du séjour retenu {!cloturee && "(modifiable)"}
          </label>
          {!editable ? (
            <p className="font-semibold">{prixRetenuInitial.toFixed(2)} CHF</p>
          ) : (
            <div className="flex gap-2">
              <input type="number" step="0.05"
                value={prixSejour}
                onChange={e => setPrixSejour(e.target.value)}
                className="flex-1 border rounded-xl p-2" />
              <button onClick={handleEnregistrerPrix} disabled={loadingPrix}
                className="px-4 py-2 rounded-xl font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#1B2B5E" }}>
                {loadingPrix ? "..." : "Enregistrer"}
              </button>
            </div>
          )}
          {ajustement !== 0 && (
            <p className="text-xs text-gray-500 mt-1">
              (ajustement manuel : {ajustement > 0 ? "+" : ""}{ajustement.toFixed(2)} CHF)
            </p>
          )}
        </div>

        <div>
          <label className="block font-semibold mb-2" style={{ color: "#1B2B5E" }}>
            Lignes supplémentaires
          </label>
          {extras.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune ligne supplémentaire.</p>
          ) : (
            <ul className="space-y-1">
              {extras.map(e => (
                <li key={e.id} className="flex justify-between items-center text-sm bg-white rounded-xl px-3 py-2">
                  <span>{e.libelle}</span>
                  <div className="flex items-center gap-3">
                    <span className={Number(e.montant) < 0 ? "text-green-600 font-semibold" : "font-semibold"}>
                      {Number(e.montant) > 0 ? "+" : ""}{Number(e.montant).toFixed(2)} CHF
                    </span>
                    {editable && (
                      <button onClick={() => handleSupprimerExtra(e.id)} disabled={suppressionId === e.id}
                        className="text-red-600 hover:underline disabled:opacity-50">
                        Supprimer
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {editable && (
            <div className="flex flex-wrap gap-2 mt-3">
              <input type="text" placeholder="Libellé"
                value={libelleExtra}
                onChange={e => setLibelleExtra(e.target.value)}
                className="flex-1 min-w-[150px] border rounded-xl p-2" />
              <input type="number" step="0.05" placeholder="Montant ± CHF"
                value={montantExtra}
                onChange={e => setMontantExtra(e.target.value)}
                className="w-36 border rounded-xl p-2" />
              <button onClick={handleAjouterExtra} disabled={loadingExtra}
                className="px-4 py-2 rounded-xl font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#4AAEA0" }}>
                {loadingExtra ? "..." : "Ajouter"}
              </button>
            </div>
          )}
        </div>

        <div className="border-t pt-3 flex justify-between items-center">
          <span className="font-semibold" style={{ color: "#1B2B5E" }}>Total dû</span>
          <span className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>
            {(Number(montant_final) || 0).toFixed(2)} CHF
          </span>
        </div>

        {ecartMsg && (
          <p className="text-sm font-semibold text-orange-600 bg-orange-50 rounded-xl px-3 py-2">
            ⚠️ {ecartMsg}
          </p>
        )}

        {cloturee && (
          <p className="text-xs text-gray-400">
            Réservation clôturée : détail en lecture seule.
          </p>
        )}

      </div>
    </div>
  );
}
