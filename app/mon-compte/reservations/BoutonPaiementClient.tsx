"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Smartphone, Landmark, Wallet } from "lucide-react";

export default function BoutonPaiementClient({
  reservation_id,
  numero,
  iban,
  titulaire,
  montant_final,
  montant_paye,
  statut_paiement,
  soldeAvoir,
}: {
  reservation_id: string;
  numero: number;
  iban: string;
  titulaire: string;
  montant_final: number;
  montant_paye: number;
  statut_paiement: string;
  soldeAvoir: number;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [methode, setMethode] = useState<"" | "iban" | "stripe" | "twint" | "avoir">("");
  const resteInitial = Math.max(0, montant_final - (montant_paye || 0));
  const [montantASaisir, setMontantASaisir] = useState(resteInitial.toFixed(2));
  const [avoirLoading, setAvoirLoading] = useState(false);
  const [avoirErreur, setAvoirErreur] = useState<string | null>(null);

  const montantNum = parseFloat(montantASaisir) || 0;

  const reset = () => {
    setMethode("");
    setMontantASaisir(resteInitial.toFixed(2));
    setAvoirErreur(null);
    setOuvert(false);
  };

  const payerAvecAvoir = async () => {
    setAvoirLoading(true);
    setAvoirErreur(null);
    const res = await fetch(`/api/reservations/${reservation_id}/payer-avoir`, {
      method: "POST",
    });
    if (res.ok) {
      router.refresh();
      reset();
    } else {
      const data = await res.json().catch(() => ({}));
      setAvoirErreur(data.error || "Erreur lors du paiement.");
    }
    setAvoirLoading(false);
  };

  return (
    <>
      <button onClick={() => setOuvert(true)}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
        style={{ backgroundColor: "#C9A84C" }}>
        💳 {resteInitial > 0 ? `Payer ${resteInitial.toFixed(2)} CHF` : "Payer"}
      </button>

      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="bg-white rounded-xl p-6 shadow-xl w-full max-w-md">

            <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
              💳 Payer ma réservation
            </h2>

            {!methode && (
              <>
                <div className="mb-5">
                  <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                    Montant à payer (CHF)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.05"
                    max={resteInitial > 0 ? resteInitial : undefined}
                    value={montantASaisir}
                    onChange={e => setMontantASaisir(e.target.value)}
                    className="w-full border-2 rounded-xl p-3 text-2xl font-bold text-center"
                    style={{ color: "#4AAEA0", borderColor: "#4AAEA0" }}
                  />
                  {resteInitial > 0 && parseFloat(montantASaisir) < resteInitial && (
                    <p className="text-xs text-orange-500 mt-1 text-center">
                      ⚠️ Paiement partiel — reste : {(resteInitial - parseFloat(montantASaisir)).toFixed(2)} CHF
                    </p>
                  )}
                  {montant_final > 0 && (
                    <p className="text-xs text-gray-400 mt-1 text-center">
                      Total facturé : {montant_final} CHF · Déjà payé : {montant_paye} CHF
                    </p>
                  )}
                </div>

                <p className="text-sm font-semibold text-gray-500 mb-3">
                  Choisissez votre mode de paiement :
                </p>

                <div className="space-y-3">
                  <button onClick={() => setMethode("stripe")}
                    className="w-full border-2 rounded-xl p-4 flex items-center gap-3 hover:bg-slate-50 transition"
                    style={{ borderColor: "#E2E8F0" }}>
                    <CreditCard size={24} style={{ color: "#1B2B5E" }} />
                    <div className="text-left">
                      <p className="font-semibold" style={{ color: "#1B2B5E" }}>Carte bancaire</p>
                      <p className="text-xs text-gray-400">Visa, Mastercard — via Stripe</p>
                    </div>
                  </button>

                  <button onClick={() => setMethode("twint")}
                    className="w-full border-2 rounded-xl p-4 flex items-center gap-3 hover:bg-slate-50 transition"
                    style={{ borderColor: "#E2E8F0" }}>
                    <Smartphone size={24} style={{ color: "#1B2B5E" }} />
                    <div className="text-left">
                      <p className="font-semibold" style={{ color: "#1B2B5E" }}>Twint</p>
                      <p className="text-xs text-gray-400">Paiement mobile suisse</p>
                    </div>
                  </button>

                  <button onClick={() => setMethode("iban")}
                    className="w-full border-2 rounded-xl p-4 flex items-center gap-3 hover:bg-slate-50 transition"
                    style={{ borderColor: "#E2E8F0" }}>
                    <Landmark size={24} style={{ color: "#1B2B5E" }} />
                    <div className="text-left">
                      <p className="font-semibold" style={{ color: "#1B2B5E" }}>Virement bancaire (IBAN)</p>
                      <p className="text-xs text-gray-400">Confirmation manuelle par notre équipe</p>
                    </div>
                  </button>

                  {soldeAvoir > 0 && (
                    <button
                      onClick={() => { setAvoirErreur(null); setMethode("avoir"); }}
                      disabled={soldeAvoir < resteInitial}
                      className="w-full border-2 rounded-xl p-4 flex items-center gap-3 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ borderColor: "#E2E8F0" }}>
                      <Wallet size={24} style={{ color: "#4AAEA0" }} />
                      <div className="text-left">
                        <p className="font-semibold" style={{ color: "#1B2B5E" }}>Mon avoir</p>
                        <p className="text-xs" style={{ color: soldeAvoir >= resteInitial ? "#6B7280" : "#DC2626" }}>
                          {soldeAvoir >= resteInitial
                            ? `Solde disponible : ${soldeAvoir.toFixed(2)} CHF`
                            : `Solde insuffisant — ${soldeAvoir.toFixed(2)} CHF disponibles`}
                        </p>
                      </div>
                    </button>
                  )}

                  <button onClick={reset}
                    className="w-full py-2 rounded-xl text-sm font-semibold"
                    style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
                    ✖ Annuler
                  </button>
                </div>
              </>
            )}

            {methode === "avoir" && (
              <div className="space-y-4">
                <div className="rounded-xl p-4" style={{ backgroundColor: "#E8F5F4" }}>
                  <p className="font-bold mb-3" style={{ color: "#1B2B5E" }}>👛 Paiement par avoir</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Mon avoir disponible</span>
                      <span className="font-semibold" style={{ color: "#4AAEA0" }}>
                        {soldeAvoir.toFixed(2)} CHF
                      </span>
                    </div>
                    <div className="flex justify-between border-t pt-2 mt-2">
                      <span className="text-gray-500">Montant à payer</span>
                      <span className="font-bold text-lg" style={{ color: "#1B2B5E" }}>
                        {resteInitial.toFixed(2)} CHF
                      </span>
                    </div>
                  </div>
                </div>
                {avoirErreur && <p className="text-xs text-red-600">{avoirErreur}</p>}
                <div className="flex gap-3">
                  <button onClick={() => setMethode("")}
                    className="flex-1 py-2 rounded-xl font-semibold text-sm"
                    style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
                    ← Retour
                  </button>
                  <button
                    onClick={payerAvecAvoir}
                    disabled={avoirLoading}
                    className="flex-1 py-2 rounded-xl font-semibold text-sm text-white disabled:opacity-50"
                    style={{ backgroundColor: "#4AAEA0" }}>
                    {avoirLoading ? "…" : `✅ Confirmer ${resteInitial.toFixed(2)} CHF`}
                  </button>
                </div>
              </div>
            )}

            {methode === "iban" && (
              <div className="space-y-4">
                {iban ? (
                  <div className="rounded-xl p-4" style={{ backgroundColor: "#E8F5F4" }}>
                    <p className="font-bold mb-3" style={{ color: "#1B2B5E" }}>
                      🏦 Coordonnées bancaires
                    </p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Titulaire</span>
                        <span className="font-semibold" style={{ color: "#1B2B5E" }}>{titulaire}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">IBAN</span>
                        <span className="font-semibold font-mono" style={{ color: "#1B2B5E" }}>
                          {iban}
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-2 mt-2">
                        <span className="text-gray-500">Montant à virer</span>
                        <span className="font-bold text-lg" style={{ color: "#4AAEA0" }}>
                          {montantNum.toFixed(2)} CHF
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Référence</span>
                        <span className="font-semibold font-mono text-xs" style={{ color: "#1B2B5E" }}>
                          Réservation N°{numero}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl p-4 bg-amber-50 border border-amber-200 text-sm text-amber-700">
                    Coordonnées de paiement bientôt disponibles.
                  </div>
                )}
                {iban && (
                  <div className="rounded-xl p-3 bg-amber-50 border border-amber-200 text-xs text-amber-700">
                    ⚠️ Votre paiement sera confirmé manuellement par notre équipe après réception du virement. Merci d'indiquer la référence dans le motif du virement.
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setMethode("")}
                    className="flex-1 py-2 rounded-xl font-semibold text-sm"
                    style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
                    ← Retour
                  </button>
                  <button onClick={reset}
                    className="flex-1 py-2 rounded-xl font-semibold text-sm text-white"
                    style={{ backgroundColor: "#4AAEA0" }}>
                    ✅ J'ai noté
                  </button>
                </div>
              </div>
            )}

            {methode === "stripe" && (
              <div className="space-y-4">
                <div className="rounded-xl p-4 bg-blue-50 border border-blue-200 text-center">
                  <p className="text-2xl mb-2">💳</p>
                  <p className="font-semibold" style={{ color: "#1B2B5E" }}>Paiement par carte</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Cette fonctionnalité sera disponible prochainement.
                  </p>
                </div>
                <button onClick={() => setMethode("")}
                  className="w-full py-2 rounded-xl font-semibold text-sm"
                  style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
                  ← Retour
                </button>
              </div>
            )}

            {methode === "twint" && (
              <div className="space-y-4">
                <div className="rounded-xl p-4 bg-blue-50 border border-blue-200 text-center">
                  <p className="text-2xl mb-2">📱</p>
                  <p className="font-semibold" style={{ color: "#1B2B5E" }}>Paiement Twint</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Cette fonctionnalité sera disponible prochainement.
                  </p>
                </div>
                <button onClick={() => setMethode("")}
                  className="w-full py-2 rounded-xl font-semibold text-sm"
                  style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
                  ← Retour
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </>
  );
}
