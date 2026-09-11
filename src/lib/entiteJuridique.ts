import { supabaseAdmin } from "@/src/lib/supabase-admin";
import {
  ENTITE_VIDE,
  entiteEnVigueur,
  formeJuridique,
  type EntiteJuridique,
} from "@/src/lib/entiteJuridiqueLogique";

/**
 * L'accès à l'identité juridique.
 *
 * `entiteA(date)` est la SEULE source de raison sociale, d'IDE, de numéro de
 * TVA et d'IBAN pour les factures et les avoirs (à leur date d'émission), les
 * tickets, les e-mails, les PDF, les bulletins QR, le pied de page de
 * l'application et la page publique de désinscription.
 *
 * La lecture reprend celle de `lireParametresTva` : la ligne la plus récente
 * dont la date de début est déjà passée. Rien de neuf — c'est exprès.
 */

type LigneEntite = {
  id: string;
  date_debut: string;
  date_fin: string | null;
  forme: string;
  raison_sociale: string;
  adresse_rue: string | null;
  adresse_numero: string | null;
  adresse_npa: string | null;
  adresse_ville: string | null;
  adresse_pays: string | null;
  ide: string | null;
  numero_tva: string | null;
  iban: string | null;
  qr_iban: string | null;
  email: string | null;
  telephone: string | null;
};

const COLONNES =
  "id, date_debut, date_fin, forme, raison_sociale, adresse_rue, adresse_numero, " +
  "adresse_npa, adresse_ville, adresse_pays, ide, numero_tva, iban, qr_iban, email, telephone";

export function depuisLigne(l: LigneEntite): EntiteJuridique {
  return {
    id: l.id,
    dateDebut: String(l.date_debut),
    dateFin: l.date_fin ? String(l.date_fin) : null,
    forme: formeJuridique(l.forme),
    raisonSociale: (l.raison_sociale ?? "").trim(),
    adresse: {
      rue: (l.adresse_rue ?? "").trim() || null,
      numero: (l.adresse_numero ?? "").trim() || null,
      npa: (l.adresse_npa ?? "").trim() || null,
      ville: (l.adresse_ville ?? "").trim() || null,
      pays: (l.adresse_pays ?? "").trim() || "CH",
    },
    ide: (l.ide ?? "").trim() || null,
    numeroTva: (l.numero_tva ?? "").trim() || null,
    iban: (l.iban ?? "").trim() || null,
    qrIban: (l.qr_iban ?? "").trim() || null,
    email: (l.email ?? "").trim() || null,
    telephone: (l.telephone ?? "").trim() || null,
  };
}

/**
 * L'identité en vigueur à une date. Sans date, celle d'aujourd'hui.
 *
 * Une pièce passe TOUJOURS sa date d'émission : c'est ce qui fait qu'un avoir
 * de février porte l'entité de février, et non celle de la facture qu'il
 * corrige.
 */
export async function entiteA(dateISO?: string | null): Promise<EntiteJuridique> {
  const date = (dateISO ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const { data } = await supabaseAdmin
    .from("entites_juridiques")
    .select(COLONNES)
    .lte("date_debut", date)
    .order("date_debut", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return ENTITE_VIDE;
  const entite = depuisLigne(data as unknown as LigneEntite);
  // La date de fin ferme la plage à la veille : une entité terminée ne
  // s'applique plus, même faute de successeur enregistré.
  if (entite.dateFin !== null && date >= entite.dateFin) return ENTITE_VIDE;
  return entite;
}

/** Toutes les identités, de la plus récente à la plus ancienne. */
export async function historiqueEntites(): Promise<EntiteJuridique[]> {
  const { data } = await supabaseAdmin
    .from("entites_juridiques")
    .select(COLONNES)
    .order("date_debut", { ascending: false });
  return ((data ?? []) as unknown as LigneEntite[]).map(depuisLigne);
}

/** L'entité en vigueur aujourd'hui, ou null si aucune n'est enregistrée. */
export async function entiteCourante(): Promise<EntiteJuridique | null> {
  const toutes = await historiqueEntites();
  return entiteEnVigueur(toutes, new Date().toISOString().slice(0, 10));
}

/**
 * Le nom de famille de la titulaire, pour contrôler une raison individuelle.
 *
 * Cherché à deux endroits, dans cet ordre : le profil de la personne qui
 * prépare le changement, puis sa fiche d’employée. Le profil de
 * l’administratrice ne porte pas toujours de nom — le sien n’en portait pas —
 * alors que sa fiche RH, elle, en porte un depuis toujours. Chercher au seul
 * premier endroit rendait la raison individuelle impossible à saisir.
 *
 * Rend null si aucun des deux ne le connaît : l’écran dit alors quoi compléter,
 * plutôt que de deviner un nom qui finirait au registre du commerce.
 */
export async function nomFamilleTitulaire(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const { data: profil } = await supabaseAdmin
    .from("profiles")
    .select("nom, email")
    .eq("id", userId)
    .maybeSingle();

  const duProfil = ((profil?.nom as string | null) ?? "").trim();
  if (duProfil !== "") return duProfil;

  const email = ((profil?.email as string | null) ?? "").trim();
  if (email === "") return null;

  const { data: employee } = await supabaseAdmin
    .from("employes_rh")
    .select("nom")
    .eq("email", email)
    .maybeSingle();
  return ((employee?.nom as string | null) ?? "").trim() || null;
}
