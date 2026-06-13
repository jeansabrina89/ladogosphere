const TITULAIRE_DEFAUT = "La Dogosphère";

export type CoordonneesPaiement = {
  iban: string;
  titulaire: string;
  ibanConfigure: boolean;
};

export async function getCoordonneesPaiement(supabaseAdmin: any): Promise<CoordonneesPaiement> {
  const { data } = await supabaseAdmin
    .from("parametres")
    .select("cle, valeur")
    .in("cle", ["iban", "titulaire"]);
  const map = new Map((data ?? []).map((r: any) => [r.cle, r.valeur]));
  const iban = String(map.get("iban") ?? "").trim();
  const titulaire = String(map.get("titulaire") ?? "").trim() || TITULAIRE_DEFAUT;
  return { iban, titulaire, ibanConfigure: iban !== "" };
}
