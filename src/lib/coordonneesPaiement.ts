const TITULAIRE_DEFAUT = "La Dogosphère";

export type AdresseCreancier = {
  rue: string;
  numero: string;
  npa: string;
  ville: string;
  pays: string;
};

export type CoordonneesPaiement = {
  iban: string;
  titulaire: string;
  ibanConfigure: boolean;
  adresse: AdresseCreancier;
};

export async function getCoordonneesPaiement(supabaseAdmin: any): Promise<CoordonneesPaiement> {
  const { data } = await supabaseAdmin
    .from("parametres")
    .select("cle, valeur")
    .in("cle", ["iban", "titulaire", "adresse_rue", "adresse_numero", "adresse_npa", "adresse_ville", "adresse_pays"]);
  const map = new Map((data ?? []).map((r: any) => [r.cle, r.valeur]));
  const get = (k: string) => String(map.get(k) ?? "").trim();
  const iban = get("iban");
  const titulaire = get("titulaire") || TITULAIRE_DEFAUT;
  return {
    iban,
    titulaire,
    ibanConfigure: iban !== "",
    adresse: {
      rue: get("adresse_rue"),
      numero: get("adresse_numero"),
      npa: get("adresse_npa"),
      ville: get("adresse_ville"),
      pays: get("adresse_pays") || "CH",
    },
  };
}
