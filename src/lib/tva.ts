export type ParametresTVA = {
  assujettie: boolean;
  taux: number;
  dateDebut: string | null;
  numero: string;
};

// Pur. dateISO et dateDebut au format 'YYYY-MM-DD'. TVA INCLUSE (extraite du TTC).
export function ventilerTVA(ttc: number, dateISO: string | null, p: ParametresTVA) {
  const applicable =
    p.assujettie &&
    !!p.dateDebut &&
    !!dateISO &&
    dateISO >= p.dateDebut &&
    p.taux > 0;
  if (!applicable) return { ttc, ht: ttc, tva: 0, taux: 0, applicable: false };
  const ht = Math.round((ttc / (1 + p.taux / 100)) * 100) / 100;
  const tva = Math.round((ttc - ht) * 100) / 100; // garantit ht + tva = ttc
  return { ttc, ht, tva, taux: p.taux, applicable: true };
}

// Lit les 4 clés TVA dans la table parametres (cle/valeur) et renvoie un ParametresTVA.
export async function lireParametresTVA(client: any): Promise<ParametresTVA> {
  const { data } = await client
    .from("parametres")
    .select("cle, valeur")
    .in("cle", ["tva_assujettie", "tva_taux", "tva_date_debut", "tva_numero"]);
  const map = new Map<string, string>(
    (data ?? []).map((r: { cle: string; valeur: string }) => [r.cle, r.valeur])
  );
  const assujettie = map.get("tva_assujettie") === "true";
  const taux = parseFloat(map.get("tva_taux") ?? "0") || 0;
  const dateDebutRaw = map.get("tva_date_debut") ?? "";
  const dateDebut = dateDebutRaw.trim() !== "" ? dateDebutRaw.trim() : null;
  const numero = map.get("tva_numero") ?? "";
  return { assujettie, taux, dateDebut, numero };
}
