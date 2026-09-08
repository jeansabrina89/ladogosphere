import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { listerArticles } from "@/src/lib/boutique";
import { sousLeSeuil, valeurStock, formatQuantite } from "@/src/lib/boutiqueLogique";
import { estEnRetard } from "@/src/lib/personnalisationLogique";
import { aujourdhuiISO, formatDateFR } from "@/src/lib/dates";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import { Tuile, Raccourci, GrilleTuiles } from "@/app/components/ui/TuileChiffre";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.58)";

const chf = (n: number) => `${n.toFixed(2)} CHF`;

/**
 * Accueil de l'atelier : ce qui déclenche une commande fournisseur.
 *
 * Manquer de rivets arrête une fabrication aussi sûrement que manquer de
 * sangle. Les chiffres d'ici sont donc ceux de l'approvisionnement, pas ceux
 * de la vente — le magasin a son propre tableau.
 */
export default async function AtelierPage() {
  await exigerAccesAdmin("perm_atelier");

  const jour = aujourdhuiISO();

  const [fournitures, { data: commandes }] = await Promise.all([
    listerArticles({ actifsSeulement: true, perimetre: "atelier" }),
    supabaseAdmin
      .from("commandes_personnalisees")
      .select("id, statut, date_promise")
      .in("statut", ["a_faire", "en_cours"]),
  ]);

  const sousSeuil = fournitures.filter(sousLeSeuil);
  const valeur = valeurStock(fournitures);

  const aFabriquer = (commandes ?? []).length;
  const enRetard = (commandes ?? []).filter((c) =>
    estEnRetard(c.date_promise as string | null, c.statut as string, jour)
  ).length;

  // Les dernières entrées : ce qui est arrivé récemment, pour ne pas
  // recommander ce qu'on vient de recevoir.
  const idsFournitures = fournitures.map((f) => f.id);
  const { data: dernieres } = idsFournitures.length > 0
    ? await supabaseAdmin
        .from("mouvements_stock")
        .select("id, article_id, quantite, created_at")
        .in("article_id", idsFournitures)
        .eq("type", "entree")
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] as Record<string, unknown>[] };

  const entrees = (dernieres ?? []) as unknown as {
    id: string; article_id: string; quantite: number | string; created_at: string;
  }[];
  const nomFourniture = new Map(fournitures.map((f) => [f.id, { nom: f.nom, unite: f.unite }]));

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto" style={{ minWidth: 0 }}>
        <EnTete
          titre="🧰 Atelier"
          sousTitre={`Les fournitures de fabrication au ${formatDateFR(jour)}`}
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href="/atelier/fournitures/nouvelle" variante="principal">+ Fourniture</Bouton>
              <Bouton href="/comptabilite/depenses/nouvelle" variante="secondaire">+ Dépense</Bouton>
            </div>
          }
        />

        <GrilleTuiles etiquette="Les chiffres de l'atelier">
          <Tuile
            href="/atelier/fournitures?seuil=1"
            titre="Fournitures sous le seuil"
            valeur={String(sousSeuil.length)}
            detail={sousSeuil.length > 0
              ? `À recommander : ${sousSeuil.slice(0, 2).map((f) => f.nom).join(", ")}${sousSeuil.length > 2 ? "…" : ""}`
              : "Rien à recommander"}
            couleur={sousSeuil.length > 0 ? "#A8453A" : "#1F6E5B"}
            alerte={sousSeuil.length > 0}
          />

          <Tuile
            href="/atelier/fournitures"
            titre="Valeur du stock au prix d'achat"
            valeur={chf(valeur)}
            detail={`${fournitures.length} fourniture${fournitures.length > 1 ? "s" : ""} en réserve`}
          />

          <Tuile
            href="/boutique/commandes"
            titre="Commandes en attente de fabrication"
            valeur={String(aFabriquer)}
            detail={enRetard > 0 ? `${enRetard} en retard` : "Aucune en retard"}
            couleur={enRetard > 0 ? "#A8453A" : MARINE}
            alerte={enRetard > 0}
          />

          <Tuile
            href="/atelier/entrees"
            titre="Dernières entrées"
            valeur={String(entrees.length)}
            detail={entrees[0] ? `La dernière le ${formatDateFR(entrees[0].created_at)}` : "Aucune entrée enregistrée"}
          />
        </GrilleTuiles>

        {entrees.length > 0 && (
          <section style={{ marginTop: 28, minWidth: 0 }}>
            <h2 style={{
              fontFamily: "Georgia, 'Times New Roman', serif", color: MARINE,
              fontSize: 18, fontWeight: 700, margin: "0 0 12px",
            }}>
              Ce qui vient d&apos;arriver
            </h2>
            <ul style={{
              listStyle: "none", margin: 0, padding: 0,
              backgroundColor: "#FFFFFF", border: "1px solid rgba(27,43,94,0.12)", borderRadius: 16,
            }}>
              {entrees.map((m, i) => {
                const f = nomFourniture.get(m.article_id);
                return (
                  <li key={m.id} style={{
                    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                    padding: "12px 16px", minHeight: 52,
                    borderTop: i === 0 ? "none" : "1px solid rgba(27,43,94,0.08)",
                  }}>
                    <span style={{ color: SOUS, fontSize: 13.5, flex: "0 0 auto" }}>
                      {formatDateFR(m.created_at)}
                    </span>
                    <span style={{ color: MARINE, fontWeight: 600, flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere" }}>
                      {f?.nom ?? "Fourniture"}
                    </span>
                    <span style={{ color: "#1F6E5B", fontWeight: 700, flex: "0 0 auto" }}>
                      +{formatQuantite(m.quantite)} {f?.unite ?? ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section style={{ marginTop: 28, minWidth: 0 }}>
          <h2 style={{
            fontFamily: "Georgia, 'Times New Roman', serif", color: MARINE,
            fontSize: 18, fontWeight: 700, margin: "0 0 12px",
          }}>
            Le reste de l&apos;atelier
          </h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", minWidth: 0 }}>
            <Raccourci href="/atelier/fournitures" titre="🧵 Fournitures" note="Catalogue, seuils et prix d'achat" />
            <Raccourci href="/atelier/inventaire" titre="📦 Inventaire" note="Comptage et écarts" />
            <Raccourci href="/atelier/entrees" titre="📥 Entrées de stock" note="D&apos;où vient ce qu&apos;il y a en réserve" />
            <Raccourci href="/boutique/modeles" titre="🧩 Modèles d&apos;options" note="Les questions posées sur plusieurs articles" />
            <Raccourci href="/boutique/commandes" titre="🎁 Commandes sur mesure" note="À faire, en cours, prêtes" />
          </div>
        </section>
      </div>
    </main>
  );
}
