import { exigerAdminPage } from "@/src/lib/accesAdmin";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import { exercicesConnus } from "@/src/lib/exportComptable";
import InventaireExport from "./Inventaire";

/**
 * Export comptable — la MESURE, et rien d'autre.
 *
 * Les pièces se conservent dix ans (CO art. 958f), le stockage est limité :
 * un exercice clos partira vers un stockage tenu par la gérante, puis le
 * bucket sera allégé. Cet écran dit ce que cela représentera. Il ne fabrique
 * rien et ne supprime rien — ce sont d'autres lots, et ils n'existent pas
 * encore.
 */
export default async function ExportComptablePage() {
  await exigerAdminPage();

  const exercices = await exercicesConnus();
  const parDefaut = exercices[0] ?? new Date().getFullYear();

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">
        <EnTete titre="Export comptable" sousTitre="Ce que pèse un exercice, avant tout export" />
        <Carte>
          {exercices.length === 0 ? (
            <p>Aucun exercice ne porte encore de pièce conservée.</p>
          ) : (
            <InventaireExport exercices={exercices} exerciceInitial={parDefaut} />
          )}
        </Carte>
      </div>
    </main>
  );
}
