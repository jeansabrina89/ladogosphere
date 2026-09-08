import Link from "next/link";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { listerAttentes, resumeAttentes } from "@/src/lib/alertesStock";
import { filtrerAttentes, libelleAttentes, type FiltreAttentes } from "@/src/lib/alertesStockLogique";
import { formatDateFR } from "@/src/lib/dates";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import BoutonRenvoyer from "./BoutonRenvoyer";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.12)";

/**
 * Qui attend quoi.
 *
 * Ce n'est pas une liste de contacts : c'est une information de RÉASSORT. Le
 * tri se fait sur les attentes en cours, du plus attendu au moins attendu —
 * ce que dit cet écran, c'est quoi racheter, et pour combien de monde.
 */
export default async function AttentesPage({
  searchParams,
}: {
  searchParams: Promise<{ filtre?: string; article?: string }>;
}) {
  await exigerAccesAdmin("perm_boutique_gestion");

  const params = await searchParams;
  const filtre: FiltreAttentes =
    params.filtre === "notifiees" ? "notifiees"
    : params.filtre === "toutes" ? "toutes"
    : "en_attente";
  const articleId = (params.article ?? "").trim() || null;

  const [toutes, resume] = await Promise.all([
    listerAttentes(articleId),
    resumeAttentes(),
  ]);
  const lignes = filtrerAttentes(toutes, filtre);

  // Le classement de réassort, limité à ce qui attend encore.
  const rang = new Map(resume.map((r, i) => [r.article_id, i]));
  const classees = [...lignes].sort((a, b) => {
    const ra = rang.get(a.article_id) ?? 999;
    const rb = rang.get(b.article_id) ?? 999;
    if (ra !== rb) return ra - rb;
    return a.cree_le < b.cree_le ? -1 : 1;
  });

  const nomArticleFiltre = articleId
    ? toutes[0]?.article?.nom ?? "cet article"
    : null;

  const chip = (valeur: FiltreAttentes, libelle: string) => {
    const actif = filtre === valeur;
    const q = new URLSearchParams();
    if (valeur !== "en_attente") q.set("filtre", valeur);
    if (articleId) q.set("article", articleId);
    const qs = q.toString();
    return (
      <Link
        key={valeur}
        href={`/boutique/attentes${qs ? `?${qs}` : ""}`}
        aria-pressed={actif}
        style={{
          display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 16px",
          borderRadius: 999, fontSize: 15, fontWeight: actif ? 700 : 600,
          textDecoration: "none", backgroundColor: actif ? "#DBEFEA" : "#FFFFFF",
          border: `1px solid ${actif ? "#B9DDD1" : "rgba(27,43,94,0.15)"}`,
          color: actif ? "#1F6E5B" : MARINE,
        }}
      >
        {libelle}
      </Link>
    );
  };

  const enAttenteTotal = resume.reduce((s, r) => s + r.enAttente, 0);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto" style={{ minWidth: 0 }}>
        <EnTete
          titre="🔔 Attentes"
          sousTitre={
            nomArticleFiltre
              ? `Les demandes portant sur « ${nomArticleFiltre} »`
              : `${enAttenteTotal} personne${enAttenteTotal > 1 ? "s" : ""} attend${enAttenteTotal > 1 ? "ent" : ""} un retour en stock`
          }
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {articleId && (
                <Bouton href="/boutique/attentes" variante="secondaire">Toutes les attentes</Bouton>
              )}
              <Bouton href="/boutique/articles" variante="secondaire">← Articles</Bouton>
            </div>
          }
        />

        {/* Le classement de réassort : quoi racheter, et en quelle quantité. */}
        {!articleId && resume.some((r) => r.enAttente > 0) && (
          <Carte>
            <h2 style={{
              fontFamily: "Georgia, 'Times New Roman', serif", color: MARINE,
              fontSize: 17, fontWeight: 700, margin: "0 0 10px",
            }}>
              À racheter en premier
            </h2>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {resume.filter((r) => r.enAttente > 0).slice(0, 8).map((r) => {
                const nom = toutes.find((l) => l.article_id === r.article_id)?.article?.nom;
                return (
                  <li key={r.article_id} style={{
                    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                    minHeight: 44, minWidth: 0,
                  }}>
                    <Link
                      href={`/boutique/attentes?article=${r.article_id}`}
                      style={{ color: MARINE, fontWeight: 700, flex: "1 1 200px", minWidth: 0, overflowWrap: "anywhere" }}
                    >
                      {nom ?? "Article retiré"}
                    </Link>
                    <span style={{ color: "#8A5A1F", fontWeight: 700, flex: "0 0 auto" }}>
                      {libelleAttentes(r.enAttente)}
                    </span>
                    {r.depuis && (
                      <span style={{ color: SOUS, fontSize: 13.5, flex: "0 0 auto" }}>
                        depuis le {formatDateFR(r.depuis)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Carte>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
          {chip("en_attente", "En attente")}
          {chip("notifiees", "Notifiées")}
          {chip("toutes", "Toutes")}
        </div>

        {classees.length === 0 ? (
          <Carte>
            <EtatVide
              icone="🔔"
              titre="Aucune attente"
              message={
                filtre === "notifiees"
                  ? "Personne n'a encore été prévenu d'un retour en stock."
                  : "Personne n'attend le retour d'un article. C'est bon signe."
              }
            />
          </Carte>
        ) : (
          <Carte>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: 640, fontSize: 15 }}>
                <thead>
                  <tr style={{ color: SOUS, textAlign: "left" }}>
                    <th className="py-2 font-medium">Article</th>
                    <th className="py-2 font-medium">Adresse</th>
                    <th className="py-2 font-medium">Inscrite le</th>
                    <th className="py-2 font-medium">État</th>
                    <th className="py-2 font-medium">&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {classees.map((l) => (
                    <tr key={l.id} style={{ borderTop: BORDURE }}>
                      <td className="py-2">
                        {l.article ? (
                          <Link href={`/boutique/articles/${l.article.id}`} style={{ color: MARINE, fontWeight: 700 }}>
                            {l.article.nom}
                          </Link>
                        ) : (
                          <span style={{ color: SOUS }}>Article retiré</span>
                        )}
                      </td>
                      <td className="py-2" style={{ color: MARINE, overflowWrap: "anywhere" }}>{l.email}</td>
                      <td className="py-2" style={{ color: SOUS, whiteSpace: "nowrap" }}>
                        {formatDateFR(l.cree_le)}
                      </td>
                      <td className="py-2" style={{ whiteSpace: "nowrap" }}>
                        {l.notifie_le ? (
                          <span style={{ color: "#1F6E5B", fontWeight: 600 }}>
                            ✓ prévenue le {formatDateFR(l.notifie_le)}
                          </span>
                        ) : (
                          <span style={{ color: "#8A5A1F", fontWeight: 600 }}>⏳ en attente</span>
                        )}
                      </td>
                      <td className="py-2">
                        {l.notifie_le && <BoutonRenvoyer alerteId={l.id} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Carte>
        )}
      </div>
    </main>
  );
}
