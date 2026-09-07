import { notFound } from "next/navigation";
import Link from "next/link";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatDateFR } from "@/src/lib/dates";
import { lireArticle, historiqueMouvements } from "@/src/lib/boutique";
import {
  libelleCategorieArticle,
  libelleMouvement,
  formatQuantite,
  margeArticle,
  estPerissable,
  sousLeSeuil,
  urlPhotoArticle,
} from "@/src/lib/boutiqueLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import ActionsMouvement from "./ActionsMouvement";
import PhotoArticle from "./PhotoArticle";

export const dynamic = "force-dynamic";

const chf = (n: number) => `${n.toFixed(2)} CHF`;

const marine = "#1B2B5E";
const sousTexte = "rgba(27,43,94,0.55)";
const bordure = "1px solid rgba(27,43,94,0.12)";

function Ligne({ cle, valeur }: { cle: string; valeur: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: bordure }}>
      <span style={{ color: sousTexte, fontSize: 15 }}>{cle}</span>
      <span style={{ color: marine, fontSize: 15, fontWeight: 600, textAlign: "right" }}>{valeur}</span>
    </div>
  );
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerAccesAdmin("perm_boutique");
  const { id } = await params;

  const article = await lireArticle(id);
  if (!article) notFound();

  const [mouvements, { data: fournisseur }] = await Promise.all([
    historiqueMouvements(id),
    article.fournisseur_id
      ? supabaseAdmin.from("fournisseurs").select("id, nom").eq("id", article.fournisseur_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Les dépenses citées par les entrées, pour renvoyer vers l'achat d'origine.
  const idsDepense = [...new Set(mouvements.map((m) => m.depense_id).filter(Boolean))] as string[];
  const { data: depenses } = idsDepense.length
    ? await supabaseAdmin.from("depenses").select("id, numero").in("id", idsDepense)
    : { data: [] };
  const numeroDepense = new Map((depenses ?? []).map((d) => [d.id as string, d.numero as string | null]));

  const stock = Number(article.stock_actuel);
  const marge = margeArticle(Number(article.prix_vente), article.prix_achat === null ? null : Number(article.prix_achat));
  const alerte = sousLeSeuil(article);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto" style={{ display: "grid", gap: 16 }}>
        <EnTete
          titre={`🛒 ${article.nom}`}
          sousTitre={`${article.reference}${article.marque ? ` · ${article.marque}` : ""}`}
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href={`/boutique/articles/${id}/modifier`} variante="secondaire">✏️ Modifier</Bouton>
              <Bouton href="/boutique/articles" variante="secondaire">← Boutique</Bouton>
            </div>
          }
        />

        <Carte accent={alerte ? "or" : "aucun"}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ color: alerte ? "#A8453A" : marine, fontSize: 30, fontWeight: 700 }}>
              {formatQuantite(stock)} {article.unite}
            </span>
            <span style={{ color: marine, fontSize: 20, fontWeight: 600 }}>
              {chf(Number(article.prix_vente))} TTC
            </span>
          </div>
          {alerte && (
            <p style={{ color: "#6E5410", backgroundColor: "#F4EAC9", border: "1px solid #C9A84C",
                        borderRadius: 12, padding: "8px 12px", fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>
              ⚠️ Sous le seuil d&apos;alerte ({formatQuantite(article.stock_alerte)} {article.unite}).
            </p>
          )}

          <Ligne cle="Catégorie" valeur={libelleCategorieArticle(article.categorie)} />
          <Ligne cle="Taux de TVA" valeur={`${Number(article.taux_tva).toString().replace(".", ",")} %`} />
          <Ligne
            cle="Prix d'achat"
            valeur={
              article.prix_achat === null ? "—" : (
                <>
                  {chf(Number(article.prix_achat))}
                  {marge && (
                    <span style={{ display: "block", fontSize: 12, fontWeight: 400, color: sousTexte }}>
                      Marge {marge.montant.toFixed(2)} CHF
                      {marge.pourcentage !== null && ` (${marge.pourcentage > 0 ? "+" : ""}${String(marge.pourcentage).replace(".", ",")} %)`}
                    </span>
                  )}
                </>
              )
            }
          />
          <Ligne cle="Seuil d'alerte" valeur={Number(article.stock_alerte ?? 0) > 0 ? `${formatQuantite(article.stock_alerte)} ${article.unite}` : "—"} />
          <Ligne
            cle="Fournisseur"
            valeur={
              fournisseur ? (
                <Link href={`/comptabilite/fournisseurs/${fournisseur.id}`} style={{ color: "#1F6E5B" }}>
                  {fournisseur.nom as string}
                </Link>
              ) : "—"
            }
          />
          <Ligne cle="Code-barres" valeur={article.code_barres ?? "—"} />
          <Ligne cle="Site vitrine" valeur={article.vendable_en_ligne && article.actif ? "Visible" : "Masqué"} />
          {article.description && <Ligne cle="Description" valeur={article.description} />}
        </Carte>

        <Carte>
          <h2 className="font-bold" style={{ color: marine, margin: "0 0 12px" }}>Photo</h2>
          <PhotoArticle articleId={id} url={urlPhotoArticle(article.photo_path)} nom={article.nom} />
        </Carte>

        <Carte>
          <ActionsMouvement
            articleId={id}
            stockActuel={stock}
            unite={article.unite}
            perissable={estPerissable(article.categorie)}
          />
        </Carte>

        <Carte>
          <h2 className="font-bold" style={{ color: marine, margin: "0 0 4px" }}>Historique du stock</h2>
          <p style={{ color: sousTexte, fontSize: 13, margin: "0 0 12px" }}>
            Un mouvement ne se modifie ni ne se supprime : une erreur se corrige par un mouvement inverse motivé.
          </p>

          {mouvements.length === 0 ? (
            <p style={{ color: sousTexte, fontSize: 15, margin: 0 }}>Aucun mouvement pour l&apos;instant.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: 520, fontSize: 15 }}>
                <thead>
                  <tr style={{ color: sousTexte, textAlign: "left" }}>
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Mouvement</th>
                    <th className="py-2 font-medium text-right">Quantité</th>
                    <th className="py-2 font-medium text-right">Stock après</th>
                  </tr>
                </thead>
                <tbody>
                  {mouvements.map((m) => {
                    const q = Number(m.quantite);
                    return (
                      <tr key={m.id} style={{ borderTop: bordure }}>
                        <td className="py-2" style={{ color: sousTexte, whiteSpace: "nowrap" }}>
                          {formatDateFR(m.created_at)}
                        </td>
                        <td className="py-2" style={{ color: marine }}>
                          {libelleMouvement(m.type)}
                          {(m.motif || m.depense_id || m.date_peremption) && (
                            <span style={{ display: "block", fontSize: 12, color: sousTexte }}>
                              {m.motif}
                              {m.motif && m.depense_id ? " · " : ""}
                              {m.depense_id && (
                                <Link href={`/comptabilite/depenses/${m.depense_id}`} style={{ color: "#1F6E5B" }}>
                                  Dépense {numeroDepense.get(m.depense_id) ?? ""}
                                </Link>
                              )}
                              {m.date_peremption && ` · à consommer avant le ${formatDateFR(m.date_peremption)}`}
                            </span>
                          )}
                        </td>
                        <td
                          className="py-2 text-right"
                          style={{ color: q < 0 ? "#A8453A" : "#1F6E5B", fontWeight: 700, whiteSpace: "nowrap" }}
                        >
                          {q > 0 ? "+" : ""}{formatQuantite(q)}
                        </td>
                        <td className="py-2 text-right" style={{ color: sousTexte, whiteSpace: "nowrap" }}>
                          {m.quantite_apres === null ? "—" : formatQuantite(m.quantite_apres)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Carte>
      </div>
    </main>
  );
}
