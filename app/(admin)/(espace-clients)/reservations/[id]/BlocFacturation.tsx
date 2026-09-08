import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatDateFR } from "@/src/lib/dates";
import { montantDuReservation } from "@/src/lib/montants";
import { getSoldeAvoir } from "@/src/lib/avoirs";
import { libelleMode, etatFacture, libelleEtatFacture, couleursEtatFacture } from "@/src/lib/factureStatut";
import Encaisser from "@/app/(admin)/(espace-comptabilite)/factures/Encaisser";
import AnnulerPaiement from "./AnnulerPaiement";
import DemanderAcompte from "./DemanderAcompte";

// Un seul bloc « Facturation » : où en est la facture, ce qu'il reste à payer,
// et par où encaisser. Le montant payé n'est plus saisi nulle part — il est la
// somme des versements du journal.

const MARINE = "#1B2B5E";
const GRIS = "rgba(27,43,94,0.6)";
const chf = (n: number) => `CHF ${(Number(n) || 0).toFixed(2)}`;

type Reservation = {
  id: string;
  numero?: number | null;
  statut: string;
  client_id?: string | null;
  montant_final?: number | string | null;
  montant_calcule?: number | string | null;
  ajustement_manuel?: number | string | null;
  montant_paye?: number | string | null;
};

export default async function BlocFacturation({
  reservation,
  permEncaissements,
  enfants,
}: {
  reservation: Reservation;
  permEncaissements: boolean;
  /** Les outils de tarif (calcul et prix retenu) vivent dans ce même bloc. */
  enfants?: React.ReactNode;
}) {
  const total = montantDuReservation(reservation);
  const paye = Number(reservation.montant_paye ?? 0);
  const reste = Math.max(0, Math.round((total - paye) * 100) / 100);
  const aujourdhui = new Date().toISOString().split("T")[0];

  // Factures qui portent cette réservation (définitive et acomptes).
  const { data: liens } = await supabaseAdmin
    .from("facture_lignes")
    .select("factures!inner(id, numero, type, statut, date_facture, date_echeance, montant_total, montant_restant)")
    .eq("reservation_id", reservation.id);

  const factures = [...new Map(
    (liens ?? [])
      .map((l: { factures: unknown }) => (Array.isArray(l.factures) ? l.factures[0] : l.factures))
      .filter(Boolean)
      .map((f) => [(f as { id: string }).id, f as Record<string, unknown>]),
  ).values()];

  const definitive = factures.find((f) => f.type !== "acompte" && f.numero);
  const acomptes = factures.filter((f) => f.type === "acompte" && f.numero);
  const brouillon = factures.find((f) => !f.numero);

  const { data: paiements } = await supabaseAdmin
    .from("paiements_resa")
    .select("id, date_paiement, mode, montant, arrondi, motif")
    .eq("reservation_id", reservation.id)
    .order("date_paiement");

  const soldeAvoir = reservation.client_id
    ? await getSoldeAvoir(supabaseAdmin, reservation.client_id)
    : 0;

  const peutAcompte = permEncaissements && reservation.statut === "validee" && !definitive;

  return (
    <div className="bg-white rounded-2xl p-6 mb-6 border" style={{ borderColor: "rgba(27,43,94,0.12)" }}>
      <h2 className="text-2xl font-bold mb-4" style={{ color: MARINE }}>🧾 Facturation</h2>

      <div className="flex flex-wrap gap-6 mb-5">
        <Chiffre etiquette="Total dû" valeur={chf(total)} />
        <Chiffre etiquette="Déjà payé" valeur={chf(paye)} couleur="#1F6E5B" />
        <Chiffre etiquette="Reste à payer" valeur={chf(reste)} couleur={reste > 0 ? "#A8453A" : GRIS} />
        {soldeAvoir > 0 && <Chiffre etiquette="Avoir du client" valeur={chf(soldeAvoir)} couleur="#0369A1" />}
      </div>

      {/* La facture */}
      <div className="mb-5">
        {definitive ? (
          <LigneFacture facture={definitive} aujourdhui={aujourdhui} />
        ) : brouillon ? (
          <p className="text-sm" style={{ color: GRIS }}>
            Facture en brouillon —{" "}
            <a href={`/factures/${brouillon.id}`} className="font-semibold" style={{ color: MARINE }}>
              la voir
            </a>
            . Elle sera émise au départ du chien.
          </p>
        ) : (
          <p className="text-sm" style={{ color: GRIS }}>
            Aucune facture pour l&apos;instant : elle est émise au check-out.
          </p>
        )}
        {acomptes.map((a) => (
          <div key={String(a.id)} className="mt-2">
            <LigneFacture facture={a} aujourdhui={aujourdhui} />
          </div>
        ))}
      </div>

      {/* Encaisser */}
      {permEncaissements && reste > 0 && reservation.statut !== "annulee" && (
        <div className="flex gap-3 flex-wrap mb-5">
          <Encaisser
            factureId={definitive ? (definitive.id as string) : null}
            reservationId={definitive ? null : reservation.id}
            resteDu={definitive ? Number(definitive.montant_restant ?? reste) : reste}
            libellePiece={definitive ? `Facture ${definitive.numero}` : `Réservation #${reservation.numero ?? ""}`.trim()}
          />
          {peutAcompte && <DemanderAcompte reservationId={reservation.id} maximum={reste} />}
        </div>
      )}

      {/* Versements */}
      {(paiements ?? []).length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "rgba(27,43,94,0.5)" }}>
            Versements
          </p>
          {(paiements ?? []).map((p: Record<string, unknown>) => (
            <div key={String(p.id)}
                 className="flex items-center justify-between gap-3 py-2 border-b last:border-0 flex-wrap"
                 style={{ borderColor: "rgba(27,43,94,0.08)" }}>
              <div>
                <span className="font-semibold" style={{ color: Number(p.montant) < 0 ? "#A8453A" : MARINE }}>
                  {chf(Number(p.montant))}
                </span>
                <span className="text-sm ml-2" style={{ color: GRIS }}>{libelleMode(p.mode as string)}</span>
                <span className="text-sm ml-2" style={{ color: GRIS }}>
                  {formatDateFR(p.date_paiement as string)}
                </span>
                {Number(p.arrondi ?? 0) !== 0 && (
                  <span className="text-xs ml-2" style={{ color: "#6E5410" }}>
                    arrondi {Number(p.arrondi) > 0 ? "+" : ""}{Number(p.arrondi).toFixed(2)}
                  </span>
                )}
                {p.motif ? <span className="text-xs ml-2 italic" style={{ color: GRIS }}>{String(p.motif)}</span> : null}
              </div>
              {permEncaissements && Number(p.montant) > 0 && (
                <AnnulerPaiement paiementId={String(p.id)} montant={Number(p.montant)} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Outils de tarif */}
      {enfants}
    </div>
  );
}

function Chiffre({ etiquette, valeur, couleur }: { etiquette: string; valeur: string; couleur?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(27,43,94,0.5)" }}>
        {etiquette}
      </p>
      <p className="text-xl font-bold" style={{ color: couleur ?? MARINE }}>{valeur}</p>
    </div>
  );
}

function LigneFacture({ facture, aujourdhui }: { facture: Record<string, unknown>; aujourdhui: string }) {
  const etat = etatFacture(facture, aujourdhui);
  const couleurs = couleursEtatFacture(etat);
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <a href={`/factures/${facture.id}`} className="font-semibold" style={{ color: MARINE }}>
        {facture.type === "acompte" ? "Acompte " : "Facture "}{String(facture.numero)}
      </a>
      <span style={{
        backgroundColor: couleurs.fond, color: couleurs.texte,
        borderRadius: 999, padding: "2px 10px", fontSize: 13, fontWeight: 500,
      }}>
        {libelleEtatFacture(etat)}
      </span>
      {facture.date_echeance ? (
        <span className="text-sm" style={{ color: GRIS }}>
          échéance {formatDateFR(facture.date_echeance as string)}
        </span>
      ) : null}
      <span className="text-sm" style={{ color: GRIS }}>{chf(Number(facture.montant_total))}</span>
    </div>
  );
}
