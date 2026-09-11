import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import { aujourdhuiISO } from "@/src/lib/dates";
import { listeLocataires, lireReglagesPrestations } from "@/src/lib/prestationsDb";
import { proposerFactureMois } from "@/src/lib/factureLocataire";
import { libelleMois } from "@/src/lib/factureLocataireLogique";
import Facturation, { type Proposition } from "./Facturation";

export const dynamic = "force-dynamic";

const SOUS = "rgba(27,43,94,0.6)";

/** Le mois précédent, en « AAAA-MM ». */
function moisPrecedent(mois: string): string {
  const [a, m] = mois.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * Facturer le mois.
 *
 * Une facture par locataire : une ligne pour le forfait, une ligne par type de
 * prestation à l'acte avec sa quantité, et le loyer du box refacturé sur son
 * propre compte. L'émission passe par le moteur existant — numérotation, PDF,
 * bulletin QR, e-mail. Rien de neuf côté comptable.
 */
export default async function FacturerPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  await exigerAccesAdmin("perm_factures");
  const params = await searchParams;

  const moisCourant = aujourdhuiISO().slice(0, 7);
  const reglages = await lireReglagesPrestations();
  // À terme échu, c'est le mois écoulé qu'on facture ; d'avance, le mois qui vient.
  const parDefaut = reglages.forfaitEcheance === "avance" ? moisCourant : moisPrecedent(moisCourant);
  const mois = /^\d{4}-\d{2}$/.test(params.mois ?? "") ? params.mois! : parDefaut;

  const locataires = await listeLocataires();
  const propositions: Proposition[] = [];
  for (const l of locataires) {
    const p = await proposerFactureMois(l.id, mois);
    if (!p || p.facture.lignes.length === 0) continue;
    propositions.push({
      clientId: p.clientId,
      client: p.client,
      lignes: p.facture.lignes,
      total: p.facture.total,
      notes: p.facture.notes,
      blocage: p.blocage,
    });
  }

  const total = propositions.reduce((s, p) => s + p.total, 0);

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", minWidth: 0 }}>
        <EnTete
          titre="🧾 Facturer les prestations"
          sousTitre={`${libelleMois(mois)} — ${propositions.length} locataire(s), ${total.toFixed(2)} CHF`}
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href={`/prestations/facturer?mois=${moisPrecedent(mois)}`} variante="secondaire">
                ← {libelleMois(moisPrecedent(mois))}
              </Bouton>
              {mois !== moisCourant && (
                <Bouton href={`/prestations/facturer?mois=${moisCourant}`} variante="secondaire">
                  {libelleMois(moisCourant)}
                </Bouton>
              )}
            </div>
          }
        />

        <p style={{ color: SOUS, fontSize: 13, margin: "0 0 16px" }}>
          Réglages en vigueur : forfait{" "}
          <strong>{reglages.forfaitEcheance === "avance" ? "payé d'avance" : "à terme échu"}</strong>,
          absences <strong>{reglages.absenceDeduite ? "déduites" : "non déduites"}</strong>,
          commande par le locataire{" "}
          <strong>{reglages.commandeLocataire ? "autorisée" : "fermée"}</strong>.
        </p>

        <Facturation propositions={propositions} mois={mois} />
      </div>
    </main>
  );
}
