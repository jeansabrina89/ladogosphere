import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import {
  lireModele,
  lireCatalogueModele,
  articlesDuModele,
  listerModeles,
} from "@/src/lib/personnalisation";
import { porteurModele } from "@/src/lib/personnalisationLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import GestionOptions from "@/app/components/options/GestionOptions";
import Identite from "./Identite";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "#5B6478";

/**
 * Un modèle s'édite exactement comme les options d'un article : c'est le même
 * écran, avec le même vocabulaire. Seul l'avertissement en tête change — ici,
 * ce qu'on modifie est partagé.
 */
export default async function ModelePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerAccesAdmin("perm_boutique_gestion");
  const { id } = await params;

  const modele = await lireModele(id);
  if (!modele) notFound();

  const [{ groupes, dependances }, articles, tous, { data: fournitures }] = await Promise.all([
    lireCatalogueModele(id),
    articlesDuModele(id),
    listerModeles(),
    supabaseAdmin
      .from("articles")
      .select("id, nom, unite")
      .eq("composant", true)
      .eq("actif", true)
      .order("nom"),
  ]);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">
        <EnTete
          titre={`🧩 ${modele.nom}`}
          sousTitre="Modèle d'options : ce qui est écrit ici sert à tous les articles qui l'attachent."
          action={<Bouton href="/boutique/modeles" variante="secondaire">← Modèles</Bouton>}
        />

        <Carte>
          <Identite modele={{ id: modele.id, nom: modele.nom, description: modele.description }} />
        </Carte>

        <Carte>
          {articles.length === 0 ? (
            <p style={{ color: SOUS, fontSize: 15, margin: 0 }}>
              Aucun article n&apos;utilise encore ce modèle. Vous pouvez le régler
              tranquillement, puis l&apos;attacher depuis l&apos;écran des options
              d&apos;un article.
            </p>
          ) : (
            <>
              <h2 style={{ color: MARINE, fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>
                Utilisé par {articles.length} article{articles.length > 1 ? "s" : ""}
              </h2>
              <p style={{ color: SOUS, fontSize: 14, margin: "0 0 10px" }}>
                Retirer une option ici la retire de tous ces articles à la fois. Les
                commandes déjà passées gardent leurs choix figés, quoi qu&apos;il arrive.
              </p>
              <ul style={{ margin: 0, paddingLeft: 20, color: MARINE, fontSize: 15 }}>
                {articles.map((a) => (
                  <li key={a.id} style={{ marginBottom: 4 }}>
                    <Link href={`/boutique/articles/${a.id}/options`} style={{ color: MARINE }}>
                      {a.nom}
                    </Link>{" "}
                    <span style={{ color: SOUS, fontSize: 14 }}>({a.reference})</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Carte>

        <Carte>
          <GestionOptions
            porteur={porteurModele(id)}
            groupes={groupes}
            portee={
              articles.length > 0
                ? `Ce modèle sert à ${articles.length} article${articles.length > 1 ? "s" : ""} : ${articles.map((a) => a.nom).join(", ")}.`
                : null
            }
            dependances={dependances}
            fournitures={(fournitures ?? []) as { id: string; nom: string; unite: string }[]}
            sources={tous
              .filter((m) => m.id !== id && m.nbGroupes > 0)
              .map((m) => ({
                porteur: porteurModele(m.id),
                nom: `Modèle : ${m.nom}`,
                nbGroupes: m.nbGroupes,
              }))}
          />
        </Carte>
      </div>
    </main>
  );
}
