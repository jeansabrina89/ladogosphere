// Construction des rapports comptables d un exercice, avec report a nouveau
// (soldes d ouverture des comptes de bilan) et prise en compte de la cloture.

const r2 = (n: number) => Math.round(n * 100) / 100;

export type CompteMeta = { numero: string; libelle: string; type: string };

export type EcritureBrute = {
  date_ecriture: string;
  libelle: string;
  piece_type?: string | null;
  ecritures_lignes:
    | { compte_numero: string; debit: number | string | null; credit: number | string | null }[]
    | null;
};

export type MvtGL = { date: string; libelle: string; debit: number; credit: number; solde: number };

export function construireRapport(params: {
  comptes: CompteMeta[];
  ecrituresAnnee: EcritureBrute[];
  ecrituresAnterieures: EcritureBrute[];
  exerciceCloture: boolean;
}) {
  const { comptes, ecrituresAnnee, ecrituresAnterieures, exerciceCloture } = params;

  const meta = new Map(comptes.map((c) => [c.numero, { libelle: c.libelle, type: c.type }]));
  const typeDe = (numero: string) => meta.get(numero)?.type ?? "";
  const libelleDe = (numero: string) => meta.get(numero)?.libelle ?? "";

  // 1) Report a nouveau : solde (debit - credit) des comptes de BILAN, cumule sur les exercices anterieurs
  const ouvertureDC = new Map<string, number>();
  for (const e of ecrituresAnterieures) {
    for (const l of e.ecritures_lignes ?? []) {
      const t = typeDe(l.compte_numero);
      if (t !== "actif" && t !== "passif") continue;
      const d = Number(l.debit) || 0;
      const c = Number(l.credit) || 0;
      ouvertureDC.set(l.compte_numero, r2((ouvertureDC.get(l.compte_numero) ?? 0) + d - c));
    }
  }

  // 2) Mouvements de l exercice
  type Ligne = { compte: string; date: string; libelle: string; debit: number; credit: number; pieceType: string | null };
  const lignes: Ligne[] = [];
  for (const e of ecrituresAnnee) {
    for (const l of e.ecritures_lignes ?? []) {
      lignes.push({
        compte: l.compte_numero,
        date: e.date_ecriture,
        libelle: e.libelle,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        pieceType: e.piece_type ?? null,
      });
    }
  }
  const parCompte = new Map<string, { debit: number; credit: number; lignes: Ligne[] }>();
  for (const l of lignes) {
    if (!parCompte.has(l.compte)) parCompte.set(l.compte, { debit: 0, credit: 0, lignes: [] });
    const acc = parCompte.get(l.compte)!;
    acc.debit += l.debit;
    acc.credit += l.credit;
    acc.lignes.push(l);
  }

  // 3) Balance des mouvements de l exercice
  const balance = [...parCompte.entries()]
    .map(([numero, v]) => ({
      numero,
      libelle: libelleDe(numero),
      type: typeDe(numero),
      debit: r2(v.debit),
      credit: r2(v.credit),
      solde: r2(v.debit - v.credit),
    }))
    .sort((a, b) => a.numero.localeCompare(b.numero));
  const totalDebit = r2(balance.reduce((s, b) => s + b.debit, 0));
  const totalCredit = r2(balance.reduce((s, b) => s + b.credit, 0));

  // 4) Compte de resultat : produits / charges de l exercice, HORS ecriture de cloture
  const plParCompte = new Map<string, { debit: number; credit: number }>();
  for (const l of lignes) {
    const t = typeDe(l.compte);
    if (t !== "produit" && t !== "charge") continue;
    if (l.pieceType === "cloture") continue;
    if (!plParCompte.has(l.compte)) plParCompte.set(l.compte, { debit: 0, credit: 0 });
    const a = plParCompte.get(l.compte)!;
    a.debit += l.debit;
    a.credit += l.credit;
  }
  const produits = [...plParCompte.entries()]
    .filter(([n]) => typeDe(n) === "produit")
    .map(([numero, v]) => ({ numero, libelle: libelleDe(numero), montant: r2(v.credit - v.debit) }))
    .sort((a, b) => a.numero.localeCompare(b.numero));
  const charges = [...plParCompte.entries()]
    .filter(([n]) => typeDe(n) === "charge")
    .map(([numero, v]) => ({ numero, libelle: libelleDe(numero), montant: r2(v.debit - v.credit) }))
    .sort((a, b) => a.numero.localeCompare(b.numero));
  const totalProduits = r2(produits.reduce((s, p) => s + p.montant, 0));
  const totalCharges = r2(charges.reduce((s, c) => s + c.montant, 0));
  const resultat = r2(totalProduits - totalCharges);

  // 5) Bilan : ouverture (report a nouveau) + mouvements de l exercice
  const comptesBilan = new Set<string>([
    ...ouvertureDC.keys(),
    ...balance.filter((b) => b.type === "actif" || b.type === "passif").map((b) => b.numero),
  ]);
  const soldeBilanDC = (numero: string) => {
    const ouv = ouvertureDC.get(numero) ?? 0;
    const v = parCompte.get(numero);
    const mvt = v ? v.debit - v.credit : 0;
    return r2(ouv + mvt);
  };
  const actifs = [...comptesBilan]
    .filter((n) => typeDe(n) === "actif")
    .map((numero) => ({ numero, libelle: libelleDe(numero), montant: soldeBilanDC(numero) }))
    .sort((a, b) => a.numero.localeCompare(b.numero));
  const passifs = [...comptesBilan]
    .filter((n) => typeDe(n) === "passif")
    .map((numero) => ({ numero, libelle: libelleDe(numero), montant: r2(-soldeBilanDC(numero)) }))
    .sort((a, b) => a.numero.localeCompare(b.numero));
  const totalActif = r2(actifs.reduce((s, a) => s + a.montant, 0));
  const totalPassifHorsResultat = r2(passifs.reduce((s, p) => s + p.montant, 0));
  const resultatAuBilan = exerciceCloture ? 0 : resultat;
  const totalPassif = r2(totalPassifHorsResultat + resultatAuBilan);

  // 6) Grand-livre : solde de depart = report a nouveau (comptes de bilan)
  const numerosGL = [...new Set<string>([...comptesBilan, ...balance.map((b) => b.numero)])].sort((a, b) =>
    a.localeCompare(b)
  );
  const grandLivre = numerosGL
    .map((numero) => {
      const t = typeDe(numero);
      const ouverture = t === "actif" || t === "passif" ? r2(ouvertureDC.get(numero) ?? 0) : 0;
      let solde = ouverture;
      const mvts: MvtGL[] = (parCompte.get(numero)?.lignes ?? []).map((l) => {
        solde = r2(solde + l.debit - l.credit);
        return { date: l.date, libelle: l.libelle, debit: l.debit, credit: l.credit, solde };
      });
      return { numero, libelle: libelleDe(numero), ouverture, mvts };
    })
    .filter((g) => g.ouverture !== 0 || g.mvts.length > 0);

  return {
    balance, totalDebit, totalCredit,
    produits, charges, totalProduits, totalCharges, resultat,
    actifs, passifs, totalActif, totalPassif, resultatAuBilan, exerciceCloture,
    grandLivre,
  };
}
