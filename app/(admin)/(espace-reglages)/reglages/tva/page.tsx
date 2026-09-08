import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { lireParametresTva, historiqueParametresTva } from "@/src/lib/tva";
import {
  ADHESION_A_QUALIFIER,
  libelleSecteur,
  libelleTaux,
  tauxParDefautCategorie,
} from "@/src/lib/tvaLogique";
import { CATEGORIES_ARTICLE } from "@/src/lib/boutiqueLogique";
import { METHODES, libellePeriodicite, refusDecompte } from "@/src/lib/decompteTvaLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import FormulaireTva from "./FormulaireTva";
import CategoriesTva, { type LigneCategorie } from "./CategoriesTva";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.58)";
const BORDURE = "1px solid rgba(27,43,94,0.12)";

/**
 * Réglages → TVA.
 *
 * Un écran, un sujet : le régime, les taux par catégorie, et ce qui reste à
 * saisir. Réservé à l'administratrice — c'est un réglage fiscal, pas un
 * paramètre d'affichage.
 */
export default async function ReglagesTvaPage() {
  await exigerAdminPage();

  const [regime, historique, { data: articles }] = await Promise.all([
    lireParametresTva(),
    historiqueParametresTva(),
    supabaseAdmin.from("articles").select("categorie, taux_tva, secteur_tdfn").eq("actif", true),
  ]);

  // L'état réel des articles, catégorie par catégorie : ce qui est saisi, et
  // ce que la catégorie appellerait.
  const parCategorie = new Map<string, { taux: Set<number>; secteur: Set<string>; n: number }>();
  for (const a of (articles ?? []) as { categorie: string; taux_tva: number | string; secteur_tdfn: string | null }[]) {
    const e = parCategorie.get(a.categorie) ?? { taux: new Set<number>(), secteur: new Set<string>(), n: 0 };
    e.taux.add(Number(a.taux_tva));
    e.secteur.add(a.secteur_tdfn ?? "commerce");
    e.n += 1;
    parCategorie.set(a.categorie, e);
  }

  const lignes: LigneCategorie[] = CATEGORIES_ARTICLE.map((c) => {
    const e = parCategorie.get(c.valeur);
    return {
      categorie: c.valeur,
      libelle: c.libelle,
      articles: e?.n ?? 0,
      taux: e && e.taux.size === 1 ? [...e.taux][0] : e ? null : tauxParDefautCategorie(c.valeur),
      secteur: e && e.secteur.size === 1 ? [...e.secteur][0] : e ? null : "commerce",
      tauxAttendu: tauxParDefautCategorie(c.valeur),
    };
  });

  const refus = refusDecompte(regime);
  const methode = METHODES.find((m) => m.valeur === regime.methode);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto" style={{ minWidth: 0 }}>
        <EnTete
          titre="🧾 TVA"
          sousTitre="Le régime, les taux facturés et les secteurs de dette fiscale nette."
          action={<Bouton href="/reglages" variante="secondaire">← Réglages</Bouton>}
        />

        {/* Ce qui manque, dit tout de suite et sans détour. */}
        {refus && (
          <Carte>
            <p role="status" style={{
              backgroundColor: "#F4EAC9", color: "#6E5410", border: "1px solid #C9A84C",
              borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 600, margin: 0,
            }}>
              ⚠️ {refus}
            </p>
          </Carte>
        )}

        <Carte>
          <h2 style={{ color: MARINE, fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>
            Régime en vigueur
          </h2>
          <p style={{ color: SOUS, fontSize: 14.5, margin: "0 0 18px" }}>
            {regime.assujettie
              ? `Assujettie depuis le ${regime.dateAssujettissement ?? "—"} · ${methode?.libelle ?? regime.methode} · décompte ${libellePeriodicite(regime.periodicite)}`
              : "Non assujettie : aucune pièce ne mentionne de TVA."}
          </p>

          <FormulaireTva
            initial={{
              assujettie: regime.assujettie,
              dateAssujettissement: regime.dateAssujettissement ?? "",
              numero: regime.numero ?? "",
              methode: regime.methode,
              periodicite: regime.periodicite,
              tauxTdfn1: regime.tauxTdfn1 > 0 ? String(regime.tauxTdfn1) : "",
              libelleSecteur1: regime.libelleSecteur1,
              tauxTdfn2: regime.tauxTdfn2 && regime.tauxTdfn2 > 0 ? String(regime.tauxTdfn2) : "",
              libelleSecteur2: regime.libelleSecteur2 ?? "",
            }}
          />
        </Carte>

        <Carte>
          <h2 style={{ color: MARINE, fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>
            Taux par catégorie d&apos;articles
          </h2>
          <p style={{ color: SOUS, fontSize: 14.5, margin: "0 0 14px" }}>
            Ce qui se mange est au taux réduit ; le reste au taux normal. Ces
            réglages posent le taux de tous les articles d&apos;une catégorie d&apos;un
            coup — chaque fiche article garde ensuite le sien, modifiable.
            Aucune pièce déjà émise n&apos;est touchée : elle a figé son taux.
          </p>
          <CategoriesTva lignes={lignes} />
        </Carte>

        <Carte>
          <h2 style={{ color: MARINE, fontSize: 18, fontWeight: 700, margin: "0 0 10px" }}>
            Les prestations
          </h2>
          <ul style={{ margin: 0, paddingLeft: 20, color: SOUS, fontSize: 14.5, lineHeight: 1.8 }}>
            <li>
              <strong>Pension, garderie, journée d&apos;essai, frais et prestations
              annexes</strong> : {libelleTaux(8.1)}, secteur {libelleSecteur("pension").toLowerCase()}.
            </li>
            <li>
              <strong>Boutique et atelier</strong> : le taux de l&apos;article,
              secteur {libelleSecteur("commerce").toLowerCase()}.
            </li>
            <li>
              <strong>Adhésion annuelle</strong> : {ADHESION_A_QUALIFIER}
            </li>
          </ul>
        </Carte>

        {historique.length > 1 && (
          <Carte>
            <h2 style={{ color: MARINE, fontSize: 18, fontWeight: 700, margin: "0 0 10px" }}>
              Historique du régime
            </h2>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {historique.map((h) => (
                <li key={h.dateDebut} style={{ borderTop: BORDURE, paddingTop: 8, fontSize: 14.5, color: SOUS }}>
                  <strong style={{ color: MARINE }}>Depuis le {h.dateDebut}</strong> —{" "}
                  {h.assujettie ? "assujettie" : "non assujettie"}
                  {h.assujettie && `, ${h.methode === "tdfn" ? "dette fiscale nette" : "méthode effective"}, décompte ${libellePeriodicite(h.periodicite)}`}
                  {h.numero ? ` · ${h.numero}` : ""}
                </li>
              ))}
            </ul>
          </Carte>
        )}
      </div>
    </main>
  );
}
