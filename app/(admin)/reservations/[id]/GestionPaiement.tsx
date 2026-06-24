"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Smartphone, Banknote, Landmark, CreditCard, MoreHorizontal, Wallet } from "lucide-react";
import { enregistrerPaiement, annulerPaiement, appliquerAvoir, reprendreAvoir } from "./actions";

const MODES_PAIEMENT = [
  { val: "twint", label: "Twint", Icon: Smartphone },
  { val: "cash", label: "Cash", Icon: Banknote },
  { val: "iban", label: "Virement IBAN", Icon: Landmark },
  { val: "stripe", label: "Stripe", Icon: CreditCard },
  { val: "autre", label: "Autre", Icon: MoreHorizontal },
];

const STATUT_LABELS: Record<string, string> = {
  impaye: "❌ Impayé",
  partiel: "⚠️ Partiel",
  paye: "✅ Payé",
};

export default function GestionPaiement({
  reservation_id,
  client_id,
  solde_avoir,
  avoirApplique,
  montant_final,
  statut_paiement,
  montant_paye,
  date_paiement,
  mode_paiement,
  perm_encaissements,
  statut,
}: {
  reservation_id: string;
  client_id?: string;
  solde_avoir?: number;
  avoirApplique: number;
  montant_final: number | null;
  statut_paiement: string | null;
  montant_paye: number | null;
  date_paiement: string | null;
  mode_paiement: string | null;
  perm_encaissements: boolean;
  statut: string;
}) {
  const [montantPaye, setMontantPaye] = useState(montant_paye?.toString() || "");
  const [date, setDate] = useState(date_paiement || "");
  const [mode, setMode] = useState(mode_paiement || "");
  const [loading, setLoading] = useState(false);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [annulationLoading, setAnnulationLoading] = useState(false);
  const [avoirLoading, setAvoirLoading] = useState(false);
  const [reprendreLoading, setReprendreLoading] = useState(false);
  const [montantAvoir, setMontantAvoir] = useState("");
  const [cleIdempotence, setCleIdempotence] = useState(() => crypto.randomUUID());
  const router = useRouter();

  // Synchronise les états avec les props après router.refresh()
  useEffect(() => { setMontantPaye(montant_paye?.toString() || ""); }, [montant_paye]);
  useEffect(() => { setDate(date_paiement || ""); }, [date_paiement]);
  useEffect(() => { setMode(mode_paiement || ""); }, [mode_paiement]);
  // Réinitialise le champ avoir quand le solde ou le paiement change
  useEffect(() => { setMontantAvoir(""); }, [solde_avoir, montant_paye]);

  const total = Number(montant_final ?? 0);
  const statutPay = statut_paiement || "impaye";
  const dejaPaye = Number(montant_paye) || 0;
  const estPaye = statutPay === "paye";
  const montantSaisi = parseFloat(montantPaye || "0");
  const resteDu = total - dejaPaye;
  const maxAvoir = Math.min(solde_avoir ?? 0, resteDu > 0 ? resteDu : 0);
  const montantAvoirValue = montantAvoir !== "" ? montantAvoir : (maxAvoir > 0 ? maxAvoir.toFixed(2) : "");
  const estAnnulee = statut === "annulee";

  const handleSauvegarder = async () => {
    if (montantSaisi > 0 && !mode) { alert("Choisis un mode de paiement."); return; }
    setLoading(true);

    const formData = new FormData();
    formData.set("reservation_id", reservation_id);
    formData.set("client_id", client_id || "");
    formData.set("montant_paye", montantPaye ? montantPaye : "0");
    formData.set("date_paiement", date || "");
    formData.set("mode_paiement", mode || "");

    const res = await enregistrerPaiement(formData, cleIdempotence);
    if (res?.error) {
      alert(res.error);
      setLoading(false);
      return;
    }
    setCleIdempotence(crypto.randomUUID());
    setSauvegarde(true);
    setTimeout(() => setSauvegarde(false), 3000);
    router.refresh();
    setLoading(false);
  };

  const handleAnnulerPaiement = async () => {
    if (!confirm(`Annuler le paiement de CHF ${dejaPaye.toFixed(2)} ?`)) return;

    if (avoirApplique > 0) {
      alert(
        `L'avoir utilisé (CHF ${avoirApplique.toFixed(2)}) sera automatiquement restitué au client.`
      );
    }

    const cashPaye = Math.max(0, dejaPaye - avoirApplique);
    let mettreEnAvoir = false;
    if (cashPaye > 0) {
      mettreEnAvoir = confirm(
        `Mettre le montant payé hors-avoir (CHF ${cashPaye.toFixed(2)}) en avoir ?\n\nOK = oui / Annuler = non`
      );
    }

    setAnnulationLoading(true);
    const formData = new FormData();
    formData.set("reservation_id", reservation_id);
    formData.set("client_id", client_id || "");
    formData.set("mettre_en_avoir", mettreEnAvoir ? "true" : "false");
    const res = await annulerPaiement(formData);
    if (res?.error) {
      alert(res.error);
      setAnnulationLoading(false);
      return;
    }
    router.refresh();
    setAnnulationLoading(false);
  };

  const handleAppliquerAvoir = async () => {
    const montant = parseFloat(montantAvoirValue);
    if (isNaN(montant) || montant <= 0 || montant > maxAvoir) {
      alert(`Montant invalide (max CHF ${maxAvoir.toFixed(2)}).`);
      return;
    }
    setAvoirLoading(true);
    const formData = new FormData();
    formData.set("reservation_id", reservation_id);
    formData.set("client_id", client_id || "");
    formData.set("montant_avoir", montant.toString());
    const res = await appliquerAvoir(formData);
    if (res?.error) {
      alert(res.error);
      setAvoirLoading(false);
      return;
    }
    router.refresh();
    setAvoirLoading(false);
  };

  const handleReprendreAvoir = async () => {
    if (!confirm(
      `Reprendre l'avoir utilisé (CHF ${avoirApplique.toFixed(2)}) ? Le crédit sera restitué au client et le paiement de la réservation ajusté.`
    )) return;

    setReprendreLoading(true);
    const formData = new FormData();
    formData.set("reservation_id", reservation_id);
    formData.set("client_id", client_id || "");
    const res = await reprendreAvoir(formData);
    if (res?.error) {
      alert(res.error);
      setReprendreLoading(false);
      return;
    }
    router.refresh();
    setReprendreLoading(false);
  };

  if (!perm_encaissements) {
    return (
      <div className="border-t pt-6 mb-6">
        <h2 className="text-2xl font-bold mb-4" style={{ color: "#1B2B5E" }}>💳 Paiement</h2>
        <div className="bg-slate-50 rounded-xl p-4 space-y-2">
          <span className="inline-block px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: statutPay === "paye" ? "#4AAEA0" : statutPay === "partiel" ? "#E0A23B" : "#E8847A" }}>
            {STATUT_LABELS[statutPay] || statutPay}
          </span>
          {dejaPaye > 0 && (
            <p className="text-sm text-gray-600">Montant payé : <strong>CHF {dejaPaye.toFixed(2)}</strong></p>
          )}
          {avoirApplique > 0 && (
            <p className="text-sm text-gray-600">Dont avoir utilisé : <strong>CHF {avoirApplique.toFixed(2)}</strong></p>
          )}
          {mode_paiement && (
            <p className="text-sm text-gray-600">Mode : {mode_paiement}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border-t pt-6 mb-6">
      <h2 className="text-2xl font-bold mb-4" style={{ color: "#1B2B5E" }}>💳 Paiement</h2>

      <div className="bg-slate-50 rounded-xl p-4 space-y-4">

        {/* Statut — automatique, lecture seule */}
        <div>
          <label className="block font-semibold mb-2" style={{ color: "#1B2B5E" }}>Statut du paiement</label>
          <span className="inline-block px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: estPaye ? "#4AAEA0" : statutPay === "partiel" ? "#E0A23B" : "#E8847A" }}>
            {STATUT_LABELS[statutPay] || statutPay}
          </span>
          {!estAnnulee && (
            <p className="text-xs text-gray-500 mt-1">
              Le statut se met à jour automatiquement selon le montant payé.
            </p>
          )}
        </div>

        {/* Encart info — réservation annulée */}
        {estAnnulee && (
          <div className="rounded-xl px-4 py-3 text-sm font-medium"
            style={{ backgroundColor: "#F3F4F6", color: "#6B7280", border: "1px solid #E5E7EB" }}>
            Réservation annulée — seul l'ajustement du paiement (remboursement / mise en avoir) est possible.
          </div>
        )}

        {/* Formulaire montant + mode — masqué si annulée */}
        {!estAnnulee && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                Montant payé — total reçu (CHF)
              </label>
              <input type="number" step="0.05" min="0"
                value={montantPaye}
                onChange={e => setMontantPaye(e.target.value)}
                placeholder={montant_final?.toString() || "0"}
                className="w-full border rounded-xl p-3" />
              {total > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Maximum : {total.toFixed(2)} CHF (total de la réservation).
                </p>
              )}
            </div>
            <div>
              <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                Mode de paiement
              </label>
              <div className="flex flex-wrap gap-2">
                {MODES_PAIEMENT.map(m => (
                  <button key={m.val} type="button" onClick={() => setMode(m.val)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border-2 transition"
                    style={{
                      borderColor: mode === m.val ? "#4AAEA0" : "#E2E8F0",
                      backgroundColor: mode === m.val ? "#4AAEA0" : "white",
                      color: mode === m.val ? "white" : "#1B2B5E",
                    }}>
                    <m.Icon size={16} />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Section avoir — info toujours visible, boutons masqués si annulée */}
        {(typeof solde_avoir === "number" || avoirApplique > 0) && (
          <div className="rounded-xl border p-4 space-y-3"
            style={{ borderColor: "#D1FAE5", backgroundColor: "#F0FDF4" }}>
            <p className="text-sm font-semibold flex items-center gap-2" style={{ color: "#1B2B5E" }}><Wallet size={16} style={{ color: "#4AAEA0" }} />Avoir client</p>

            {avoirApplique > 0 && (
              <p className="text-sm" style={{ color: "#1B2B5E" }}>
                Dont avoir utilisé sur cette réservation : <strong>CHF {avoirApplique.toFixed(2)}</strong>
              </p>
            )}

            {typeof solde_avoir === "number" && (
              <p className="text-sm text-gray-600">
                Solde disponible : <strong>CHF {solde_avoir.toFixed(2)}</strong>
              </p>
            )}

            {/* Bouton Utiliser l'avoir — masqué si annulée */}
            {!estAnnulee && typeof solde_avoir === "number" && solde_avoir > 0 && resteDu > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                      Montant à utiliser sur l'avoir (CHF)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max={maxAvoir}
                      value={montantAvoirValue}
                      onChange={e => setMontantAvoir(e.target.value)}
                      className="border rounded-xl p-2 text-sm w-36"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setMontantAvoir(maxAvoir.toFixed(2))}
                    className="mt-5 text-xs px-2 py-1 rounded-lg border"
                    style={{ borderColor: "#4AAEA0", color: "#4AAEA0", backgroundColor: "white" }}>
                    Tout (CHF {maxAvoir.toFixed(2)})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleAppliquerAvoir}
                  disabled={avoirLoading}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: "#4AAEA0" }}>
                  {avoirLoading ? "…" : <span className="flex items-center justify-center gap-1.5"><Wallet size={15} />Utiliser l'avoir</span>}
                </button>
              </div>
            )}

            {/* Bouton Reprendre l'avoir — masqué si annulée */}
            {!estAnnulee && avoirApplique > 0 && (
              <button
                type="button"
                onClick={handleReprendreAvoir}
                disabled={reprendreLoading}
                className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}>
                {reprendreLoading ? "…" : `↩️ Reprendre l'avoir utilisé (CHF ${avoirApplique.toFixed(2)})`}
              </button>
            )}
          </div>
        )}

        {/* Date + résumé + enregistrer — masqués si annulée */}
        {!estAnnulee && (
          <>
            <div>
              <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                Date de paiement
              </label>
              <input type="date" value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border rounded-xl p-3" />
            </div>

            {/* Résumé — utilise dejaPaye (prop) pour le montant déjà réglé */}
            {total > 0 && (
              <div className="space-y-1 pt-2 border-t">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-gray-500">Total facturé</p>
                  <p className="text-lg font-bold" style={{ color: "#1B2B5E" }}>{total.toFixed(2)} CHF</p>
                </div>
                {dejaPaye > 0 && (
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-500">Déjà payé</p>
                    <p className="text-lg font-semibold" style={{ color: "#4AAEA0" }}>{dejaPaye.toFixed(2)} CHF</p>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <p className="text-sm text-gray-500">Reste à payer</p>
                  <p className="text-xl font-bold" style={{ color: resteDu > 0 ? "#E0A23B" : "#4AAEA0" }}>
                    {(resteDu > 0 ? resteDu : 0).toFixed(2)} CHF
                  </p>
                </div>
                {!isNaN(montantSaisi) && montantSaisi !== dejaPaye && montantSaisi >= 0 && (
                  <p className="text-xs text-gray-400 text-right">
                    Après saisie : {Math.max(0, total - montantSaisi).toFixed(2)} CHF restant
                  </p>
                )}
              </div>
            )}

            {/* Enregistrer / Modifier */}
            <button onClick={handleSauvegarder} disabled={loading}
              className="w-full py-2 rounded-xl font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "#1B2B5E" }}>
              {sauvegarde ? "✅ Sauvegardé !" : loading ? "..." : estPaye ? "✏️ Modifier le paiement" : "💾 Enregistrer le paiement"}
            </button>
          </>
        )}

        {/* Annuler le paiement — toujours visible si un montant est encore payé */}
        {dejaPaye > 0 && (
          <button onClick={handleAnnulerPaiement} disabled={annulationLoading}
            className="w-full py-2 rounded-xl font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "#E8847A" }}>
            {annulationLoading ? "..." : "🗑️ Annuler le paiement"}
          </button>
        )}

      </div>
    </div>
  );
}
