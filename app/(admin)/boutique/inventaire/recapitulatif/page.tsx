import Link from "next/link";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { listerArticles } from "@/src/lib/boutique";
import { aujourdhuiISO, formatDateFR } from "@/src/lib/dates";
import {
  libelleCategorieArticle,
  formatQuantite,
  valeurStock,
} from "@/src/lib/boutiqueLogique";
import BoutonImprimer from "./BoutonImprimer";

export const dynamic = "force-dynamic";

const chf = (n: number) => `${n.toFixed(2)} CHF`;

const marine = "#1B2B5E";
const sousTexte = "rgba(27,43,94,0.55)";
const bordure = "1px solid rgba(27,43,94,0.2)";

/**
 * Récapitulatif de la valeur du stock au prix d'achat, à imprimer et à
 * conserver comme pièce de clôture : c'est le document qui justifie le solde
 * du compte 1200 « Stock de marchandises » au bilan.
 */
export default async function RecapitulatifStockPage() {
  await exigerAccesAdmin("perm_boutique");

  const articles = (await listerArticles({ actifsSeulement: true })).filter(
    (a) =>
      a.type_article !== "personnalisable" &&
      (Number(a.stock_actuel) !== 0 || Number(a.prix_achat ?? 0) !== 0)
  );
  const total = valeurStock(articles);
  const sansPrixAchat = articles.filter((a) => a.prix_achat === null && Number(a.stock_actuel) > 0);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#FFFFFF" }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          main { padding: 0 !important; }
        }
      `}</style>

      <div className="no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <BoutonImprimer />
        <Link
          href="/boutique/inventaire"
          style={{
            display: "inline-flex", alignItems: "center", padding: "8px 20px", minHeight: 44,
            borderRadius: 12, backgroundColor: "#DBEFEA", color: "#1F6E5B",
            fontWeight: 600, textDecoration: "none",
          }}
        >
          ← Inventaire
        </Link>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", color: marine }}>
        <h1 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 24, fontWeight: 700, margin: 0 }}>
          Valeur du stock de marchandises
        </h1>
        <p style={{ color: sousTexte, fontSize: 14, margin: "4px 0 24px" }}>
          La Dogosphère — état au {formatDateFR(aujourdhuiISO())}, au prix d&apos;achat.
          Compte 1200 « Stock de marchandises ».
        </p>

        <table className="w-full" style={{ fontSize: 14, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: bordure }}>
              <th className="py-2 font-medium">Référence</th>
              <th className="py-2 font-medium">Article</th>
              <th className="py-2 font-medium">Catégorie</th>
              <th className="py-2 font-medium text-right">Stock</th>
              <th className="py-2 font-medium text-right">Prix d&apos;achat</th>
              <th className="py-2 font-medium text-right">Valeur</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((a) => (
              <tr key={a.id} style={{ borderBottom: "1px solid rgba(27,43,94,0.08)" }}>
                <td className="py-2" style={{ color: sousTexte, whiteSpace: "nowrap" }}>{a.reference}</td>
                <td className="py-2">{a.nom}</td>
                <td className="py-2" style={{ color: sousTexte }}>{libelleCategorieArticle(a.categorie)}</td>
                <td className="py-2 text-right" style={{ whiteSpace: "nowrap" }}>
                  {formatQuantite(a.stock_actuel)} {a.unite}
                </td>
                <td className="py-2 text-right" style={{ color: sousTexte, whiteSpace: "nowrap" }}>
                  {a.prix_achat === null ? "—" : chf(Number(a.prix_achat))}
                </td>
                <td className="py-2 text-right" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                  {chf(Number(a.stock_actuel) * Number(a.prix_achat ?? 0))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid " + marine }}>
              <td className="py-3" colSpan={5} style={{ fontWeight: 700 }}>
                Total de la valeur du stock
              </td>
              <td className="py-3 text-right" style={{ fontWeight: 700, fontSize: 18, whiteSpace: "nowrap" }}>
                {chf(total)}
              </td>
            </tr>
          </tfoot>
        </table>

        {sansPrixAchat.length > 0 && (
          <p style={{ color: "#A8453A", fontSize: 13, marginTop: 16 }}>
            {sansPrixAchat.length} article{sansPrixAchat.length > 1 ? "s ont" : " a"} du stock sans prix
            d&apos;achat renseigné : {sansPrixAchat.length > 1 ? "ils comptent" : "il compte"} pour zéro dans ce total.
          </p>
        )}

        <div style={{ marginTop: 48, display: "flex", gap: 40, fontSize: 13, color: sousTexte }}>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: bordure, paddingTop: 6 }}>Date et lieu</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: bordure, paddingTop: 6 }}>Signature</div>
          </div>
        </div>
      </div>
    </main>
  );
}
