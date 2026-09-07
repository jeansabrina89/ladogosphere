import { notFound, redirect } from "next/navigation";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { lireArticle } from "@/src/lib/boutique";
import {
  lireCatalogueArticle,
  lireCatalogueOptions,
  articlesPersonnalisables,
  modelesDArticle,
  listerModeles,
} from "@/src/lib/personnalisation";
import { porteurArticle } from "@/src/lib/personnalisationLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import GestionOptions from "@/app/components/options/GestionOptions";
import ModelesAttaches from "@/app/components/options/ModelesAttaches";

export const dynamic = "force-dynamic";

export default async function OptionsArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerAccesAdmin("perm_boutique");
  const { id } = await params;

  const article = await lireArticle(id);
  if (!article) notFound();

  // Un article ordinaire n'a pas d'options : on renvoie à sa fiche.
  if (article.type_article !== "personnalisable") redirect(`/boutique/articles/${id}`);

  const [
    { groupes, dependances },
    { groupes: resolus, fusions },
    attaches,
    tousModeles,
    sources,
    { data: fournitures },
  ] = await Promise.all([
    // L'écran d'édition ne montre que les groupes PROPRES : ceux d'un modèle
    // se modifient dans le modèle, où le changement vaut pour tous.
    lireCatalogueArticle(id),
    lireCatalogueOptions(id),
    modelesDArticle(id),
    listerModeles(),
    articlesPersonnalisables(id),
    supabaseAdmin
      .from("articles")
      .select("id, nom, unite")
      .eq("composant", true)
      .eq("actif", true)
      .order("nom"),
  ]);

  const parId = new Map(tousModeles.map((m) => [m.id, m]));

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">
        <EnTete
          titre={`🎨 Options — ${article.nom}`}
          sousTitre="Ce que le client pourra choisir, et ce que chaque choix coûte, allonge ou consomme."
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href={`/boutique/caisse/sur-mesure/${id}`} variante="principal">
                🎁 Commande sur mesure
              </Bouton>
              <Bouton href={`/boutique/articles/${id}`} variante="secondaire">← Fiche</Bouton>
            </div>
          }
        />

        <Carte>
          <ModelesAttaches
            articleId={id}
            attaches={attaches.map((m) => ({
              id: m.id,
              nom: m.nom,
              description: m.description,
              ordre: m.ordre,
              nbGroupes: parId.get(m.id)?.nbGroupes ?? 0,
            }))}
            disponibles={tousModeles
              .filter((m) => m.actif && m.nbGroupes > 0)
              .map((m) => ({ id: m.id, nom: m.nom, nbGroupes: m.nbGroupes }))}
            fusions={fusions}
            nbGroupesPropres={groupes.length}
          />
        </Carte>

        <Carte>
          <h3 style={{ color: "#1B2B5E", fontSize: 17, fontWeight: 700, margin: "0 0 4px" }}>
            Questions propres à cet article
          </h3>
          <p style={{ color: "#5B6478", fontSize: 14, margin: "0 0 14px" }}>
            Elles s&apos;ajoutent à celles des modèles attachés, et ne servent qu&apos;ici.
          </p>
          <GestionOptions
            porteur={porteurArticle(id)}
            groupes={groupes}
            herites={resolus.filter((r) => !groupes.some((g) => g.id === r.id))}
            dependances={dependances}
            fournitures={(fournitures ?? []) as { id: string; nom: string; unite: string }[]}
            sources={sources.map((s) => ({
              porteur: porteurArticle(s.id),
              nom: `${s.nom} (${s.reference})`,
              nbGroupes: s.nbGroupes,
            }))}
          />
        </Carte>
      </div>
    </main>
  );
}
