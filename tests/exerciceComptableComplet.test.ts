import { describe, it, expect } from "vitest";
import { calculerLignesEcriture } from "@/src/lib/comptaResaLogique";
import { calculerLignesAbonnement } from "@/src/lib/comptaAbonnementLogique";
import { calculerLignesCotisation } from "@/src/lib/comptaCotisationLogique";
import { construireRapport } from "@/src/lib/rapportsCompta";

// ─────────────────────────────────────────────────────────────────────────────
// Simulation d'un exercice comptable complet à travers le VRAI code compta.
// (Adapté du harness de simulation : 40 réservations aux cycles variés,
//  1 abonnement prépayé, écritures manuelles, puis clôture vers le 2979.)
// ─────────────────────────────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;
const TOL = 0.01;
const proche = (a: number, b: number) => Math.abs(a - b) < TOL;

type Ligne = { compte_numero: string; debit: number; credit: number };
type Ecriture = {
  date_ecriture: string;
  libelle: string;
  piece_type: string;
  ecritures_lignes: Ligne[];
};

// Plan comptable de test (numéro, libellé, type).
const COMPTES = [
  { numero: "1000", libelle: "Caisse", type: "actif" },
  { numero: "1020", libelle: "Banque", type: "actif" },
  { numero: "1021", libelle: "Twint / Stripe", type: "actif" },
  { numero: "1100", libelle: "Débiteurs clients", type: "actif" },
  { numero: "2030", libelle: "Acomptes reçus", type: "passif" },
  { numero: "2031", libelle: "Produits constatés d'avance (abonnements)", type: "passif" },
  { numero: "2035", libelle: "Avoirs clients", type: "passif" },
  { numero: "2800", libelle: "Capital", type: "passif" },
  { numero: "2970", libelle: "Bénéfice reporté", type: "passif" },
  { numero: "2979", libelle: "Résultat de l'exercice", type: "passif" },
  { numero: "3000", libelle: "Produits prestations", type: "produit" },
  { numero: "3005", libelle: "Produits adhésions", type: "produit" },
  { numero: "5000", libelle: "Charges de personnel", type: "charge" },
  { numero: "6000", libelle: "Loyer", type: "charge" },
  { numero: "6300", libelle: "Assurances", type: "charge" },
];

// ── Construction de l'exercice ───────────────────────────────────────────────

const ecritures: Ecriture[] = [];
const bal: Record<string, { debit: number; credit: number }> = {};

function addBal(compte: string, debit: number, credit: number) {
  if (!bal[compte]) bal[compte] = { debit: 0, credit: 0 };
  bal[compte].debit = r2(bal[compte].debit + debit);
  bal[compte].credit = r2(bal[compte].credit + credit);
}

function pushEcriture(libelle: string, pieceType: string, lignes: Ligne[]) {
  ecritures.push({ date_ecriture: "2026-06-15", libelle, piece_type: pieceType, ecritures_lignes: lignes });
  for (const l of lignes) addBal(l.compte_numero, l.debit || 0, l.credit || 0);
}

function versLignes(delta: { compte: string; debit: number; credit: number }[]): Ligne[] {
  return delta.map((l) => ({ compte_numero: l.compte, debit: r2(l.debit || 0), credit: r2(l.credit || 0) }));
}

// Poste une réservation via le moteur, en accumulant le delta à chaque événement
// (mimique synchroniserComptaResa : idempotent, chaque appel poste le delta).
function posterResa(
  base: { type_reservation: string; montant_final: number },
  events: { statut: string; mouvement?: { mode: string; montant: number }; libelle: string }[],
  montantAdhesion = 0,
) {
  const mouvements: { mode: string; montant: number }[] = [];
  const deja: { compte_numero: string; debit: number; credit: number }[] = [];
  for (const ev of events) {
    if (ev.mouvement) mouvements.push(ev.mouvement);
    const delta = calculerLignesEcriture({ ...base, statut: ev.statut }, mouvements, deja, montantAdhesion);
    if (delta.length > 0) {
      pushEcriture(ev.libelle, "reservation", versLignes(delta));
      for (const l of delta) deja.push({ compte_numero: l.compte, debit: l.debit, credit: l.credit });
    }
  }
}

const MODES = ["cash", "virement", "twint"];
let sommeRestesDus = 0;
let sommeAvoirUtilise = 0;

// 1) 10 réservations payées au check-out (terminée, réglée en une fois).
for (let i = 0; i < 10; i++) {
  const M = 40 + i;
  posterResa({ type_reservation: "sejour", montant_final: M }, [
    { statut: "terminee", mouvement: { mode: MODES[i % 3], montant: M }, libelle: `Check-out payé #${i}` },
  ]);
}

// 2) 10 réservations acompte (virement) + solde au check-out.
for (let i = 0; i < 10; i++) {
  const M = 60 + i;
  const acompte = 20;
  posterResa({ type_reservation: "sejour", montant_final: M }, [
    { statut: "validee", mouvement: { mode: "virement", montant: acompte }, libelle: `Acompte #${i}` },
    { statut: "terminee", mouvement: { mode: MODES[i % 3], montant: r2(M - acompte) }, libelle: `Solde check-out #${i}` },
  ]);
}

// 3) 10 réservations à paiement partiel → laisse un débiteur 1100.
for (let i = 0; i < 10; i++) {
  const M = 80 + i;
  const partiel = 50;
  sommeRestesDus = r2(sommeRestesDus + (M - partiel));
  posterResa({ type_reservation: "sejour", montant_final: M }, [
    { statut: "terminee", mouvement: { mode: MODES[i % 3], montant: partiel }, libelle: `Paiement partiel #${i}` },
  ]);
}

// 4) 10 réservations réglées par avoir (2035).
for (let i = 0; i < 10; i++) {
  const M = 30 + i;
  sommeAvoirUtilise = r2(sommeAvoirUtilise + M);
  posterResa({ type_reservation: "sejour", montant_final: M }, [
    { statut: "terminee", mouvement: { mode: "avoir", montant: M }, libelle: `Paiement par avoir #${i}` },
  ]);
}

// Provision des avoirs consommés (le client les avait crédités par virement) :
// crédite 2035 du même montant → le compte 2035 se solde à 0.
pushEcriture("Provision avoirs clients", "manuel", [
  { compte_numero: "1020", debit: sommeAvoirUtilise, credit: 0 },
  { compte_numero: "2035", debit: 0, credit: sommeAvoirUtilise },
]);

// Réservation portant une adhésion EMBARQUÉE (280 = 80 séjour + 200 adhésion),
// payée cash au check-out → ventilée 3000 (80) / 3005 (200).
const M_ADH = 280;
const ADHESION_EMBARQUEE = 200;
posterResa(
  { type_reservation: "sejour", montant_final: M_ADH },
  [{ statut: "terminee", mouvement: { mode: "cash", montant: M_ADH }, libelle: "Pension + adhésion embarquée" }],
  ADHESION_EMBARQUEE,
);

// Adhésion payée DIRECTEMENT (sans réservation), virement → 3005.
const ADHESION_DIRECTE = 200;
pushEcriture(
  "Adhésion payée directement",
  "cotisation",
  versLignes(calculerLignesCotisation({ statut: "payee", mode_paiement: "virement", montant: ADHESION_DIRECTE }, [])),
);

// Abonnement prépayé (carte 11 journées, 4 consommées).
const ligAbo = calculerLignesAbonnement(
  { paye: true, mode_paiement: "virement", prix_paye: 110, jours_total: 11, jours_termines: 4, expire: false },
  [],
);
pushEcriture("Abonnement prépayé", "abonnement", versLignes(ligAbo));

// Écritures manuelles.
pushEcriture("Apport de capital", "manuel", [
  { compte_numero: "1020", debit: 5000, credit: 0 },
  { compte_numero: "2800", debit: 0, credit: 5000 },
]);
pushEcriture("Loyer", "manuel", [
  { compte_numero: "6000", debit: 400, credit: 0 },
  { compte_numero: "1020", debit: 0, credit: 400 },
]);
pushEcriture("Salaires", "manuel", [
  { compte_numero: "5000", debit: 1000, credit: 0 },
  { compte_numero: "1020", debit: 0, credit: 1000 },
]);
pushEcriture("Assurance", "manuel", [
  { compte_numero: "6300", debit: 100, credit: 0 },
  { compte_numero: "1020", debit: 0, credit: 100 },
]);
pushEcriture("Produit divers", "manuel", [
  { compte_numero: "1020", debit: 250, credit: 0 },
  { compte_numero: "3000", debit: 0, credit: 250 },
]);

// ── Écriture de clôture : solde P&L → 2979 ───────────────────────────────────
const PRODUITS = ["3000", "3005"];
const CHARGES = ["5000", "6000", "6300"];
const closingLignes: Ligne[] = [];
let totalProduitsCloture = 0;
let totalChargesCloture = 0;
for (const p of PRODUITS) {
  const b = bal[p] ?? { debit: 0, credit: 0 };
  const soldeCredit = r2(b.credit - b.debit);
  if (Math.abs(soldeCredit) > 0.005) {
    closingLignes.push({ compte_numero: p, debit: soldeCredit, credit: 0 });
    totalProduitsCloture = r2(totalProduitsCloture + soldeCredit);
  }
}
for (const c of CHARGES) {
  const b = bal[c] ?? { debit: 0, credit: 0 };
  const soldeDebit = r2(b.debit - b.credit);
  if (Math.abs(soldeDebit) > 0.005) {
    closingLignes.push({ compte_numero: c, debit: 0, credit: soldeDebit });
    totalChargesCloture = r2(totalChargesCloture + soldeDebit);
  }
}
const resultatCloture = r2(totalProduitsCloture - totalChargesCloture);
if (resultatCloture >= 0) closingLignes.push({ compte_numero: "2979", debit: 0, credit: resultatCloture });
else closingLignes.push({ compte_numero: "2979", debit: r2(-resultatCloture), credit: 0 });

const ecritureCloture: Ecriture = {
  date_ecriture: "2026-12-31",
  libelle: "Clôture de l'exercice",
  piece_type: "cloture",
  ecritures_lignes: closingLignes,
};

// ── Rapports ─────────────────────────────────────────────────────────────────
const ecrituresAvecCloture = [...ecritures, ecritureCloture];

const rapportAvant = construireRapport({
  comptes: COMPTES, ecrituresAnnee: ecritures, ecrituresAnterieures: [], exerciceCloture: false,
});
const rapportApres = construireRapport({
  comptes: COMPTES, ecrituresAnnee: ecrituresAvecCloture, ecrituresAnterieures: [], exerciceCloture: true,
});
const rapportAn2 = construireRapport({
  comptes: COMPTES, ecrituresAnnee: [], ecrituresAnterieures: ecrituresAvecCloture, exerciceCloture: false,
});

const montantActif = (rap: ReturnType<typeof construireRapport>, num: string) =>
  rap.actifs.find((a) => a.numero === num)?.montant ?? 0;
const montantPassif = (rap: ReturnType<typeof construireRapport>, num: string) =>
  rap.passifs.find((p) => p.numero === num)?.montant ?? 0;

// ─────────────────────────────────────────────────────────────────────────────

describe("Exercice comptable complet — équilibre des livres via le vrai moteur", () => {
  it("1. chaque écriture est équilibrée (Σ débit = Σ crédit)", () => {
    for (const e of ecrituresAvecCloture) {
      const d = r2(e.ecritures_lignes.reduce((s, l) => s + (l.debit || 0), 0));
      const c = r2(e.ecritures_lignes.reduce((s, l) => s + (l.credit || 0), 0));
      expect(proche(d, c), `écriture "${e.libelle}" : ${d} ≠ ${c}`).toBe(true);
    }
  });

  it("2. la balance générale est équilibrée (tous les débits = tous les crédits)", () => {
    let d = 0, c = 0;
    for (const e of ecrituresAvecCloture) for (const l of e.ecritures_lignes) { d = r2(d + (l.debit || 0)); c = r2(c + (l.credit || 0)); }
    expect(proche(d, c)).toBe(true);
  });

  it("3. le rapport a totalDebit = totalCredit", () => {
    expect(proche(rapportAvant.totalDebit, rapportAvant.totalCredit)).toBe(true);
  });

  it("4. le bilan est équilibré (totalActif = totalPassif)", () => {
    expect(proche(rapportAvant.totalActif, rapportAvant.totalPassif)).toBe(true);
  });

  it("5. résultat = produits − charges", () => {
    expect(proche(rapportAvant.resultat, r2(rapportAvant.totalProduits - rapportAvant.totalCharges))).toBe(true);
  });

  it("6. le résultat est reporté au bilan (avant clôture)", () => {
    expect(proche(rapportAvant.resultatAuBilan, rapportAvant.resultat)).toBe(true);
  });

  it("7. débiteurs 1100 = somme des restes dus", () => {
    expect(sommeRestesDus).toBeGreaterThan(0);
    expect(proche(montantActif(rapportAvant, "1100"), sommeRestesDus)).toBe(true);
  });

  it("8. acomptes 2030 soldés à 0 après les check-out", () => {
    expect(proche(montantPassif(rapportAvant, "2030"), 0)).toBe(true);
  });

  it("9. l'écriture de clôture est équilibrée", () => {
    const d = r2(closingLignes.reduce((s, l) => s + (l.debit || 0), 0));
    const c = r2(closingLignes.reduce((s, l) => s + (l.credit || 0), 0));
    expect(proche(d, c)).toBe(true);
  });

  it("10. après clôture : bilan équilibré et 2979 = résultat", () => {
    expect(rapportApres.exerciceCloture).toBe(true);
    expect(proche(rapportApres.totalActif, rapportApres.totalPassif)).toBe(true);
    expect(proche(rapportApres.resultatAuBilan, 0)).toBe(true);
    expect(proche(montantPassif(rapportApres, "2979"), rapportApres.resultat)).toBe(true);
  });

  it("11. année 2 : bilan d'ouverture équilibré (report à nouveau)", () => {
    expect(proche(rapportAn2.totalActif, rapportAn2.totalPassif)).toBe(true);
    // Aucun mouvement en année 2 → résultat d'ouverture nul.
    expect(proche(rapportAn2.resultat, 0)).toBe(true);
    // Le résultat de l'an 1 est reporté (2979 en ouverture au passif).
    expect(proche(montantPassif(rapportAn2, "2979"), rapportApres.resultat)).toBe(true);
  });

  it("12. ventilation adhésion : la réservation porteuse crédite 3000 (séjour) + 3005 (adhésion)", () => {
    const ecr = ecritures.find((e) => e.libelle === "Pension + adhésion embarquée");
    expect(ecr).toBeTruthy();
    const m = Object.fromEntries(ecr!.ecritures_lignes.map((l) => [l.compte_numero, l]));
    expect(m["3000"].credit).toBe(r2(M_ADH - ADHESION_EMBARQUEE)); // 80 séjour
    expect(m["3005"].credit).toBe(ADHESION_EMBARQUEE); // 200 adhésion
    expect(m["1000"].debit).toBe(M_ADH);
  });

  it("13. total 3005 = adhésion embarquée + adhésion directe", () => {
    const net3005 = r2((bal["3005"]?.credit ?? 0) - (bal["3005"]?.debit ?? 0));
    expect(proche(net3005, r2(ADHESION_EMBARQUEE + ADHESION_DIRECTE))).toBe(true);
  });
});
