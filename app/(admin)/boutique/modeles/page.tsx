import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { listerModeles } from "@/src/lib/personnalisation";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bibliotheque from "./Bibliotheque";

export const dynamic = "force-dynamic";

/**
 * Bibliothèque de modèles d'options : les questions qu'on pose à l'identique
 * sur plusieurs articles, écrites une fois.
 */
export default async function ModelesPage() {
  await exigerAccesAdmin("perm_boutique_gestion");
  const modeles = await listerModeles();

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">
        <EnTete
          titre="🧩 Modèles d'options"
          sousTitre="Les questions posées à l'identique sur plusieurs articles, écrites une seule fois."
        />

        <Carte>
          <p style={{ color: "#5B6478", fontSize: 15, margin: "0 0 14px" }}>
            Un modèle est <strong>partagé</strong>, pas copié : corriger un prix ou ajouter
            un coloris ici le fait partout où le modèle est attaché. Les commandes déjà
            passées, elles, ne bougent jamais — leurs choix sont figés.
          </p>
          <Bibliotheque modeles={modeles} />
        </Carte>
      </div>
    </main>
  );
}
