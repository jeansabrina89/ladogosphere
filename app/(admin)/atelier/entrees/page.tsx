import Link from "next/link";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatDateFR } from "@/src/lib/dates";
import { formatQuantite, libelleMouvement } from "@/src/lib/boutiqueLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.12)";

/**
 * L'historique des entrées de fournitures : d'où vient ce qu'il y a en stock.
 *
 * Un mouvement ne se modifie ni ne se supprime — une erreur se corrige par un
 * mouvement inverse motivé. Cet écran est donc en LECTURE seule, et c'est
 * volontaire : il sert à retrouver une facture, pas à réécrire l'histoire.
 */
export default async function EntreesAtelierPage() {
  await exigerAccesAdmin("perm_atelier");

  // Les fournitures d'abord : leurs identifiants bornent la recherche des
  // mouvements. Un mouvement d'article revendu n'a rien à faire ici.
  const { data: fournitures } = await supabaseAdmin
    .from("articles")
    .select("id, nom, reference, unite")
    .eq("composant", true);

  const parId = new Map(
    (fournitures ?? []).map((a) => [a.id as string, a as { id: string; nom: string; reference: string; unite: string }])
  );

  const { data: mouvements } = parId.size > 0
    ? await supabaseAdmin
        .from("mouvements_stock")
        .select("id, article_id, type, quantite, quantite_apres, motif, depense_id, created_at")
        .in("article_id", [...parId.keys()])
        .eq("type", "entree")
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [] as Record<string, unknown>[] };

  const lignes = (mouvements ?? []) as unknown as {
    id: string; article_id: string; type: string; quantite: number | string;
    quantite_apres: number | string | null; motif: string | null;
    depense_id: string | null; created_at: string;
  }[];

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto" style={{ minWidth: 0 }}>
        <EnTete
          titre="📥 Entrées de stock"
          sousTitre={`Les ${lignes.length} dernières entrées de fournitures`}
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href="/comptabilite/depenses/nouvelle" variante="principal">+ Dépense</Bouton>
              <Bouton href="/atelier" variante="secondaire">← Atelier</Bouton>
            </div>
          }
        />

        {lignes.length === 0 ? (
          <Carte>
            <EtatVide
              icone="📥"
              titre="Aucune entrée"
              message="Les fournitures entrent en stock depuis une dépense « Matières de fabrication », ou à la main depuis leur fiche."
            />
          </Carte>
        ) : (
          <Carte>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: 640, fontSize: 15 }}>
                <thead>
                  <tr style={{ color: SOUS, textAlign: "left" }}>
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Fourniture</th>
                    <th className="py-2 font-medium text-right">Quantité</th>
                    <th className="py-2 font-medium text-right">Stock après</th>
                    <th className="py-2 font-medium">Origine</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((m) => {
                    const a = parId.get(m.article_id);
                    return (
                      <tr key={m.id} style={{ borderTop: BORDURE }}>
                        <td className="py-2" style={{ color: SOUS, whiteSpace: "nowrap" }}>
                          {formatDateFR(m.created_at)}
                        </td>
                        <td className="py-2">
                          <Link href={`/boutique/articles/${m.article_id}`} style={{ color: MARINE, fontWeight: 700 }}>
                            {a?.nom ?? "Fourniture supprimée"}
                          </Link>
                          <span style={{ display: "block", fontSize: 12, color: SOUS }}>{a?.reference ?? ""}</span>
                        </td>
                        <td className="py-2 text-right" style={{ color: "#1F6E5B", fontWeight: 700, whiteSpace: "nowrap" }}>
                          +{formatQuantite(m.quantite)} {a?.unite ?? ""}
                        </td>
                        <td className="py-2 text-right" style={{ color: SOUS, whiteSpace: "nowrap" }}>
                          {m.quantite_apres !== null ? formatQuantite(m.quantite_apres) : "—"}
                        </td>
                        <td className="py-2" style={{ color: SOUS }}>
                          {m.depense_id ? (
                            <Link href={`/comptabilite/depenses/${m.depense_id}`} style={{ color: MARINE }}>
                              🧾 Voir la dépense
                            </Link>
                          ) : (
                            m.motif || libelleMouvement(m.type)
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Carte>
        )}
      </div>
    </main>
  );
}
