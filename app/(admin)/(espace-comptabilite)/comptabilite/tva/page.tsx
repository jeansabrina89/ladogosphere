import Link from "next/link";
import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { lireParametresTva, caDouzeMoisGlissants } from "@/src/lib/tva";
import { apercuDecompte, periodesAvecEtat, soldeTvaDue } from "@/src/lib/decompteTva";
import {
  seuilSecondTaux,
  avertissementBaseDecompte,
  METHODES,
  libellePeriodicite,
  COMPTE_DECOMPTE_TDFN,
  COMPTE_TVA_DUE,
} from "@/src/lib/decompteTvaLogique";
import { anneesExercices } from "@/src/lib/exercices";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import PeriodeDecompte, { type PeriodeAffichee } from "./PeriodeDecompte";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.58)";
const BORDURE = "1px solid rgba(27,43,94,0.12)";

const chf = (n: number) => `${n.toFixed(2)} CHF`;

/**
 * Décompte TVA, réservé à l'administratrice.
 *
 * Une période par bloc, avec son chiffre d'affaires par secteur, le taux
 * appliqué et le montant dû. Un clic déclare, passe l'écriture et ferme la
 * période — elle ne se recalcule plus.
 */
export default async function DecompteTvaPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  await exigerAdminPage();

  const params = await searchParams;
  const annee = parseInt(params.annee || String(new Date().getFullYear()), 10);
  const annees = await anneesExercices();
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const [regime, periodes, solde, caGlissant] = await Promise.all([
    lireParametresTva(`${annee}-12-31`),
    periodesAvecEtat(annee),
    soldeTvaDue(),
    caDouzeMoisGlissants(),
  ]);

  const apercus = await Promise.all(periodes.map((p) => apercuDecompte(p)));

  const affichees: PeriodeAffichee[] = periodes.map((p, i) => {
    const a = apercus[i];
    const lignes = a.decompte
      ? a.decompte.lignes.map((l) => ({ libelle: l.libelle, ca: l.ca, taux: l.taux, du: l.du }))
      : a.effectif
        ? [
            { libelle: "TVA facturée", ca: a.effectif.tvaFacturee, taux: 0, du: a.effectif.tvaFacturee },
            { libelle: "Impôt préalable déductible", ca: 0, taux: 0, du: -a.effectif.impotPrealable },
          ]
        : [];
    return {
      code: p.code,
      libelle: p.libelle,
      debut: p.debut,
      fin: p.fin,
      refus: a.refus,
      lignes,
      caTotal: a.decompte?.caTotal ?? 0,
      totalDu: a.decompte?.totalDu ?? a.effectif?.totalDu ?? 0,
      declare: p.declare
        ? {
            code: p.declare.code,
            totalDu: Number(p.declare.total_du),
            declareLe: p.declare.declare_le,
            statut: p.declare.statut,
            payeLe: p.declare.paye_le,
          }
        : null,
      terminee: p.fin < aujourdhui,
    };
  });

  const seuil = seuilSecondTaux({
    caParSecteur: caGlissant,
    secondTauxDejaSaisi: (regime.tauxTdfn2 ?? 0) > 0,
  });
  const methode = METHODES.find((m) => m.valeur === regime.methode);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto" style={{ minWidth: 0 }}>
        <EnTete
          titre="🧾 Décompte TVA"
          sousTitre={`${methode?.libelle ?? regime.methode} · décompte ${libellePeriodicite(regime.periodicite)}`}
          action={<Bouton href="/comptabilite" variante="secondaire">← Comptabilité</Bouton>}
        />

        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: MARINE }}>Exercice :</span>
          {(annees.length > 0 ? annees : [annee]).map((a) => (
            <Link key={a} href={`/comptabilite/tva?annee=${a}`}
              className="px-3 py-1 rounded-lg text-sm font-semibold"
              style={{
                backgroundColor: a === annee ? MARINE : "white",
                color: a === annee ? "white" : MARINE,
                border: BORDURE, textDecoration: "none",
              }}>
              {a}
            </Link>
          ))}
        </div>

        {/* En TÊTE du décompte : un chiffre ne doit jamais pouvoir être lu
            comme reposant sur une base qu'il n'applique pas. */}
        {avertissementBaseDecompte(regime.baseDecompte) && (
          <Carte>
            <p role="status" style={{
              backgroundColor: "#F4EAC9", color: "#6E5410", border: "1px solid #C9A84C",
              borderRadius: 12, padding: "12px 14px", fontSize: 15, fontWeight: 600, margin: 0,
            }}>
              ⚠️ {avertissementBaseDecompte(regime.baseDecompte)}
            </p>
          </Carte>
        )}

        {seuil?.message && (
          <Carte>
            <p role="status" style={{
              backgroundColor: "#F4EAC9", color: "#6E5410", border: "1px solid #C9A84C",
              borderRadius: 12, padding: "12px 14px", fontSize: 15, fontWeight: 600, margin: 0,
            }}>
              ⚠️ {seuil.message}
            </p>
            <p style={{ color: SOUS, fontSize: 13.5, margin: "8px 0 0" }}>
              Douze mois glissants. Tant qu&apos;aucun second taux n&apos;est accordé, tout
              le chiffre d&apos;affaires est décompté au taux du secteur 1 — c&apos;est ce
              que l&apos;AFC demande, et c&apos;est ce que fait cet écran.
            </p>
          </Carte>
        )}

        <Carte>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>
              <span style={{ display: "block", color: SOUS, fontSize: 13 }}>
                Compte {COMPTE_TVA_DUE} — TVA due à l&apos;AFC
              </span>
              <span style={{ display: "block", color: MARINE, fontSize: 24, fontWeight: 700 }}>
                {chf(solde)}
              </span>
            </span>
            <span style={{ maxWidth: 380, color: SOUS, fontSize: 13.5 }}>
              {regime.methode === "tdfn"
                ? `En dette fiscale nette, rien n'est comptabilisé au fil des factures : les produits restent TTC. C'est le décompte qui passe l'écriture — débit ${COMPTE_DECOMPTE_TDFN}, crédit ${COMPTE_TVA_DUE} — une fois par période.`
                : `En méthode effective, la TVA facturée se crédite en ${COMPTE_TVA_DUE} pièce par pièce, et l'impôt préalable se débite en 1170.`}
            </span>
          </div>
        </Carte>

        <div style={{ display: "grid", gap: 14 }}>
          {affichees.map((p) => (
            <PeriodeDecompte key={p.code} periode={p} />
          ))}
        </div>

        <Carte>
          <p style={{ color: SOUS, fontSize: 13.5, margin: 0 }}>
            Le taux de dette fiscale nette est un chiffre <strong>sans rapport</strong>
            {" "}avec les taux facturés aux clients : il ne figure sur aucune facture,
            et les taux légaux (8,1 % · 2,6 % · 0 %) ne servent jamais au décompte.
            Les deux se règlent dans{" "}
            <Link href="/reglages/tva" style={{ color: "#1F6E5B", fontWeight: 700 }}>
              Réglages → TVA
            </Link>.
          </p>
        </Carte>
      </div>
    </main>
  );
}
