import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { estMembreActif } from "@/src/lib/membre";
import BadgeMembre from "@/app/components/BadgeMembre";
import { formatDateFR } from "@/src/lib/dates";
import { getCoordonneesPaiement } from "@/src/lib/coordonneesPaiement";
import { lireParametresTVA, ventilerTVA } from "@/src/lib/tva";
import BoutonImprimer from "./BoutonImprimer";
import BoutonReglement from "./BoutonReglement";
import BoutonAnnulerFacture from "./BoutonAnnulerFacture";

function libelleType(t: string): string {
  if (t === "journee") return "Journée";
  if (t === "sejour") return "Séjour";
  if (t === "essai") return "Journée d'essai";
  return t || "—";
}

export default async function FactureGroupeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Garde : admin ou perm_encaissements
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, perm_encaissements")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin" && !profile?.perm_encaissements) redirect("/");

  const peutRegler = profile?.role === "admin" || !!profile?.perm_encaissements;

  const { id } = await params;

  const { data: facture } = await supabaseAdmin
    .from("factures")
    .select(`
      *,
      clients (id, prenom, nom, adresse, email, telephone, membre),
      facture_reservations (
        id, montant,
        reservations (numero, type_reservation, date_debut, date_fin)
      ),
      paiements (date_paiement, mode_paiement)
    `)
    .eq("id", id)
    .single();

  if (!facture) return <div className="p-8">Facture introuvable.</div>;

  const coords = await getCoordonneesPaiement(supabaseAdmin);
  const paramsTV = await lireParametresTVA(supabaseAdmin);
  const dateFactureISO = facture.date_facture
    ? String(facture.date_facture).split("T")[0]
    : null;
  const tvaData = ventilerTVA(Number(facture.montant_total), dateFactureISO, paramsTV);

  const lignes: any[] = facture.facture_reservations ?? [];
  const paiements: any[] = facture.paiements ?? [];
  const dernierPaiement = paiements[paiements.length - 1] ?? null;
  const client = facture.clients as any;
  const membre_a_jour = client?.id ? await estMembreActif(supabaseAdmin, client.id, dateFactureISO ?? undefined) : false;

  const estAcquittee = facture.statut === "acquittee";
  const estAnnulee = facture.statut === "annulee";

  return (
    <>
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
` }} />

      {/* Contrôles impression */}
      <div className="no-print p-4 flex gap-3">
        <BoutonImprimer />
        <a
          href="/reservations"
          className="px-4 py-2 rounded-xl font-semibold text-sm"
          style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}
        >
          ← Réservations
        </a>
      </div>

      {/* Document A4 */}
      <div className="facture max-w-3xl mx-auto bg-white p-10 shadow-sm mb-8">

        {/* En-tête */}
        <div className="flex justify-between items-start mb-10">
          <div>
            <img src="/Logo.png" alt="La Dogosphère" style={{ height: "80px", marginBottom: "8px" }} />
            <p className="text-sm text-gray-500">Pension canine</p>
            <p className="text-sm text-gray-500">Sion, Valais</p>
            <p className="text-sm text-gray-500">ladogosphere@gmail.com</p>
            {tvaData.applicable && paramsTV.numero && (
              <p className="text-sm text-gray-500">N° TVA : {paramsTV.numero}</p>
            )}
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-bold mb-2" style={{ color: "#1B2B5E" }}>FACTURE GROUPÉE</h2>
            <p className="text-sm"><strong>N° :</strong> {facture.numero}</p>
            <p className="text-sm"><strong>Date :</strong> {formatDateFR(facture.date_facture)}</p>
            <p className="text-sm">
              <strong>Statut :</strong>{" "}
              <span className={
                estAcquittee ? "text-green-600 font-semibold" :
                estAnnulee ? "text-gray-500 font-semibold" :
                "text-red-600 font-semibold"
              }>
                {estAcquittee ? "✅ Réglée" : estAnnulee ? "Annulée" : "❌ En attente"}
              </span>
            </p>
            {estAcquittee && dernierPaiement?.date_paiement && (
              <p className="text-xs text-gray-500 mt-1">
                Réglée le {formatDateFR(dernierPaiement.date_paiement)}
                {dernierPaiement.mode_paiement ? ` — ${dernierPaiement.mode_paiement}` : ""}
              </p>
            )}
          </div>
        </div>

        <div className="border-t-2 mb-8" style={{ borderColor: "#1B2B5E" }} />

        {/* Bloc client */}
        <div className="mb-8">
          <h3 className="font-bold text-sm uppercase tracking-wide text-gray-400 mb-2">Facturé à</h3>
          <p className="font-bold text-lg" style={{ color: "#1B2B5E" }}>
            {client?.prenom} {client?.nom}{" "}
            <BadgeMembre membre={!!client?.membre} aJour={membre_a_jour} />
          </p>
          {client?.adresse && <p className="text-sm text-gray-600">{client.adresse}</p>}
          {client?.email && <p className="text-sm text-gray-600">{client.email}</p>}
          {client?.telephone && <p className="text-sm text-gray-600">{client.telephone}</p>}
        </div>

        {/* Tableau des réservations */}
        <table className="w-full mb-8 text-sm">
          <thead>
            <tr style={{ backgroundColor: "#1B2B5E", color: "white" }}>
              <th className="px-4 py-3 text-left rounded-tl-lg">Réservation</th>
              <th className="px-4 py-3 text-left">Période</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-right rounded-tr-lg">Montant</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne: any) => {
              const r = ligne.reservations;
              return (
                <tr key={ligne.id} className="border-b">
                  <td className="px-4 py-3 font-semibold" style={{ color: "#1B2B5E" }}>
                    #{r?.numero ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {r?.date_debut ? formatDateFR(r.date_debut) : "—"}
                    {" → "}
                    {r?.date_fin ? formatDateFR(r.date_fin) : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {r?.type_reservation ? libelleType(r.type_reservation) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    CHF {Number(ligne.montant).toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            {tvaData.applicable ? (
              <>
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-right text-sm text-gray-500">Total HT</td>
                  <td className="px-4 py-2 text-right text-sm font-semibold">
                    CHF {tvaData.ht.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-right text-sm text-gray-500">
                    TVA {tvaData.taux} %
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-semibold">
                    CHF {tvaData.tva.toFixed(2)}
                  </td>
                </tr>
                <tr style={{ backgroundColor: "#F5F0E8" }}>
                  <td colSpan={3} className="px-4 py-3 font-bold text-right">Total TTC</td>
                  <td className="px-4 py-3 font-bold text-right text-lg" style={{ color: "#1B2B5E" }}>
                    CHF {Number(facture.montant_total).toFixed(2)}
                  </td>
                </tr>
              </>
            ) : (
              <tr style={{ backgroundColor: "#F5F0E8" }}>
                <td colSpan={3} className="px-4 py-3 font-bold text-right">Total</td>
                <td className="px-4 py-3 font-bold text-right text-lg" style={{ color: "#1B2B5E" }}>
                  CHF {Number(facture.montant_total).toFixed(2)}
                </td>
              </tr>
            )}
            {Number(facture.montant_paye) > 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right text-sm text-gray-500">Montant réglé</td>
                <td className="px-4 py-2 text-right text-sm text-green-600 font-semibold">
                  CHF {Number(facture.montant_paye).toFixed(2)}
                </td>
              </tr>
            )}
            {Number(facture.montant_restant) > 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right text-sm text-gray-500">Reste à régler</td>
                <td className="px-4 py-2 text-right text-sm text-red-600 font-semibold">
                  CHF {Number(facture.montant_restant).toFixed(2)}
                </td>
              </tr>
            )}
          </tfoot>
        </table>

        {/* Coordonnées paiement si non réglée */}
        {!estAcquittee && !estAnnulee && (
          <div
            className="border rounded-xl p-4 mb-8 text-sm"
            style={{ borderColor: "#C9A84C", backgroundColor: "#FFFBF0" }}
          >
            <p className="font-bold mb-2" style={{ color: "#1B2B5E" }}>💳 Coordonnées de paiement</p>
            {coords.ibanConfigure ? (
              <>
                <p><strong>Virement bancaire :</strong> IBAN {coords.iban}</p>
                <p><strong>Titulaire :</strong> {coords.titulaire}</p>
                <p className="text-gray-500 mt-1">
                  Merci d'indiquer votre nom et le numéro de facture {facture.numero} en référence.
                </p>
              </>
            ) : (
              <p>Coordonnées de paiement communiquées prochainement.</p>
            )}
          </div>
        )}

        {/* Badge annulée */}
        {estAnnulee && (
          <div
            className="border rounded-xl p-4 mb-8 text-center"
            style={{ borderColor: "#9CA3AF", backgroundColor: "#F9FAFB" }}
          >
            <p className="font-bold text-gray-500 text-lg">🚫 Facture annulée</p>
            <p className="text-sm text-gray-400 mt-1">
              Les réservations liées restent impayées et peuvent être refacturées.
            </p>
          </div>
        )}

        {/* Badge acquittement */}
        {estAcquittee && (
          <div
            className="border rounded-xl p-4 mb-8 text-center"
            style={{ borderColor: "#16A34A", backgroundColor: "#F0FDF4" }}
          >
            <p className="font-bold text-green-700 text-lg">✅ Facture réglée</p>
            {dernierPaiement?.date_paiement && (
              <p className="text-sm text-green-600 mt-1">
                Le {formatDateFR(dernierPaiement.date_paiement)}
                {dernierPaiement.mode_paiement
                  ? ` par ${dernierPaiement.mode_paiement === "cash" ? "espèces" : dernierPaiement.mode_paiement}`
                  : ""}
              </p>
            )}
          </div>
        )}

        {/* Contrôles admin — no-print */}
        {peutRegler && !estAcquittee && !estAnnulee && (
          <div className="no-print space-y-3 mb-8">
            <div
              className="border rounded-xl p-4"
              style={{ borderColor: "#4AAEA0", backgroundColor: "#F0FAFA" }}
            >
              <BoutonReglement facture_id={facture.id} />
            </div>
            <div
              className="border rounded-xl p-4"
              style={{ borderColor: "#FCA5A5", backgroundColor: "#FFF5F5" }}
            >
              <BoutonAnnulerFacture facture_id={facture.id} />
            </div>
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
