import { exigerPersonnelPage } from "@/src/lib/exigerPersonnelPage";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatDateFR, formatHeure } from "@/src/lib/dates";
import { formatBoxLabel } from "@/src/lib/boxes";
import { getCoordonneesPaiement } from "@/src/lib/coordonneesPaiement";
import BoutonImprimer from "./BoutonImprimer";

export default async function FacturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerPersonnelPage();
  const supabase = supabaseAdmin;
  const { id } = await params;

  const { data: res } = await supabase
    .from("reservations")
    .select(`
      *,
      clients (id, prenom, nom, membre, telephone, email, adresse),
      boxes (numero, nom),
      reservation_chiens (
        chiens (id, nom, race, poids, categorie_poids)
      )
    `)
    .eq("id", id)
    .single();

  if (!res) return <div>Réservation introuvable</div>;

  const coords = await getCoordonneesPaiement(supabaseAdmin);

  const chiens = res.reservation_chiens?.map((rc: any) => rc.chiens).filter(Boolean) ?? [];

  // Calculer le nombre de jours
  const dateDebut = new Date(res.date_debut);
  const dateFin = new Date(res.date_fin);
  const nbJours = Math.max(1, Math.round((dateFin.getTime() - dateDebut.getTime()) / (1000 * 60 * 60 * 24)) + (res.type_reservation === "sejour" ? 0 : 1));

  // Numéro de facture
  const numeroFacture = `FAC-${res.id.substring(0, 8).toUpperCase()}`;
  const dateFacture = formatDateFR(new Date());

  return (
    <>
      {/* Styles d'impression */}
      <style dangerouslySetInnerHTML={{ __html: `
  @media print {
    .no-print { display: none !important; }
    nav { display: none !important; }
    header { display: none !important; }
    body { background: white !important; }
    .facture { box-shadow: none !important; border: none !important; }
  }
  @page { 
    margin: 1cm;
    size: A4;
  }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
`}} />

      {/* Bouton imprimer */}
      <div className="no-print p-4 flex gap-3">
        <BoutonImprimer />
        <a href={`/reservations/${id}`}
          className="px-4 py-2 rounded-xl font-semibold text-sm"
          style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
          ← Retour
        </a>
      </div>

      {/* Facture */}
      <div className="facture max-w-3xl mx-auto bg-white p-10 shadow-sm mb-8">

        {/* En-tête */}
<div className="flex justify-between items-start mb-10">
  <div>
    <img src="/Logo.png" alt="La Dogosphère" style={{ height: "80px", marginBottom: "8px" }} />
    <p className="text-sm text-gray-500">Pension canine</p>
    <p className="text-sm text-gray-500">Sion, Valais</p>
    <p className="text-sm text-gray-500">ladogosphere@gmail.com</p>
  </div>
  <div className="text-right">
    <h2 className="text-2xl font-bold mb-2" style={{ color: "#1B2B5E" }}>FACTURE</h2>
    <p className="text-sm"><strong>N° :</strong> {numeroFacture}</p>
    <p className="text-sm"><strong>Date :</strong> {dateFacture}</p>
    <p className="text-sm">
      <strong>Statut paiement :</strong>{" "}
      <span className={
        res.statut_paiement === "paye" ? "text-green-600 font-semibold" :
        res.statut_paiement === "partiel" ? "text-orange-600 font-semibold" :
        "text-red-600 font-semibold"
      }>
        {res.statut_paiement === "paye" ? "✅ Payé" :
         res.statut_paiement === "partiel" ? "⚠️ Partiellement payé" :
         "❌ Impayé"}
      </span>
    </p>
  </div>
</div>

        {/* Ligne séparatrice */}
        <div className="border-t-2 mb-8" style={{ borderColor: "#1B2B5E" }} />

        {/* Client */}
        <div className="mb-8">
          <h3 className="font-bold text-sm uppercase tracking-wide text-gray-400 mb-2">Facturé à</h3>
          <p className="font-bold text-lg" style={{ color: "#1B2B5E" }}>
            {res.clients?.prenom} {res.clients?.nom}
            {res.clients?.membre && <span className="ml-2 text-sm text-green-600">⭐ Membre</span>}
          </p>
          {res.clients?.adresse && <p className="text-sm text-gray-600">{res.clients.adresse}</p>}
          {res.clients?.email && <p className="text-sm text-gray-600">{res.clients.email}</p>}
          {res.clients?.telephone && <p className="text-sm text-gray-600">{res.clients.telephone}</p>}
        </div>

        {/* Détails séjour */}
        <div className="mb-8">
          <h3 className="font-bold text-sm uppercase tracking-wide text-gray-400 mb-3">Détails du séjour</h3>
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Type</span>
              <span className="font-semibold">
                {res.type_reservation === "journee" ? "Journée" :
                 res.type_reservation === "sejour" ? "Séjour" :
                 res.type_reservation === "essai" ? "Journée d'essai" : res.type_reservation}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Box</span>
              <span className="font-semibold">{formatBoxLabel(res.boxes)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Date d'arrivée</span>
              <span className="font-semibold">{formatDateFR(res.date_debut)}{res.heure_arrivee ? ` à ${formatHeure(res.heure_arrivee)}` : ""}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Date de départ</span>
              <span className="font-semibold">{formatDateFR(res.date_fin)}{res.heure_depart ? ` à ${formatHeure(res.heure_depart)}` : ""}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Chien(s)</span>
              <span className="font-semibold">{chiens.map((c: any) => c.nom).join(", ") || "—"}</span>
            </div>
            {res.urgence && (
              <div className="flex justify-between">
                <span className="text-gray-600">Tarif</span>
                <span className="font-semibold text-orange-600">🚨 Urgence</span>
              </div>
            )}
          </div>
        </div>

        {/* Tableau montants */}
        <table className="w-full mb-8 text-sm">
          <thead>
            <tr style={{ backgroundColor: "#1B2B5E", color: "white" }}>
              <th className="px-4 py-3 text-left rounded-tl-lg">Description</th>
              <th className="px-4 py-3 text-center">Qté</th>
              <th className="px-4 py-3 text-right rounded-tr-lg">Montant</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="px-4 py-3">
                {res.type_reservation === "journee" ? "Journée" :
                 res.type_reservation === "sejour" ? "Séjour" : "Journée d'essai"} —{" "}
                {chiens.length} chien{chiens.length > 1 ? "s" : ""}
                {res.clients?.membre ? " (tarif membre)" : " (tarif non-membre)"}
              </td>
              <td className="px-4 py-3 text-center">{nbJours} j.</td>
              <td className="px-4 py-3 text-right font-semibold">
                {res.montant_final ? `CHF ${Number(res.montant_final).toFixed(2)}` : "—"}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: "#F5F0E8" }}>
              <td colSpan={2} className="px-4 py-3 font-bold text-right">Total</td>
              <td className="px-4 py-3 font-bold text-right text-lg" style={{ color: "#1B2B5E" }}>
                CHF {res.montant_final ? Number(res.montant_final).toFixed(2) : "—"}
              </td>
            </tr>
            {res.montant_paye > 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-2 text-right text-sm text-gray-500">Montant payé</td>
                <td className="px-4 py-2 text-right text-sm text-green-600 font-semibold">
                  CHF {Number(res.montant_paye).toFixed(2)}
                </td>
              </tr>
            )}
            {res.montant_paye > 0 && res.montant_final && res.montant_paye < res.montant_final && (
              <tr>
                <td colSpan={2} className="px-4 py-2 text-right text-sm text-gray-500">Solde restant</td>
                <td className="px-4 py-2 text-right text-sm text-red-600 font-semibold">
                  CHF {(Number(res.montant_final) - Number(res.montant_paye)).toFixed(2)}
                </td>
              </tr>
            )}
          </tfoot>
        </table>

        {/* Coordonnées paiement */}
        {res.statut_paiement !== "paye" && (
          <div className="border rounded-xl p-4 mb-8 text-sm" style={{ borderColor: "#C9A84C", backgroundColor: "#FFFBF0" }}>
            <p className="font-bold mb-2" style={{ color: "#1B2B5E" }}>💳 Coordonnées de paiement</p>
            {coords.ibanConfigure ? (
              <>
                <p><strong>Virement bancaire :</strong> IBAN {coords.iban}</p>
                <p><strong>Titulaire :</strong> {coords.titulaire}</p>
                <p className="text-gray-500 mt-1">Merci d'indiquer votre nom et le numéro de facture en référence.</p>
              </>
            ) : (
              <p>Coordonnées de paiement communiquées prochainement.</p>
            )}
          </div>
        )}

        {/* Pied de page */}
        <div className="border-t pt-6 text-center text-xs text-gray-400">
          <p>La Dogosphère Sàrl — Pension canine — Sion, Valais</p>
          <p>Merci de votre confiance ! 🐾</p>
        </div>

      </div>
    </>
  );
}