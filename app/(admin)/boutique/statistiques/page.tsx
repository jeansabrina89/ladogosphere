import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { aujourdhuiISO, formatDateFR } from "@/src/lib/dates";
import { libelleCategorieArticle } from "@/src/lib/boutiqueLogique";
import { statistiquesBoutique, vendeusesBoutique } from "@/src/lib/statistiquesBoutique";
import {
  CANAUX,
  PERIODES,
  avertissementCouverture,
  lireFiltresStatistiques,
  palmares,
  trier,
  type Agregat,
  type ParamsStatistiques,
} from "@/src/lib/statistiquesBoutiqueLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import TableArticles from "./TableArticles";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.12)";

const chf = (n: number | null) =>
  n === null ? "—" : `${n.toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CHF`;
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("fr-CH", { maximumFractionDigits: 1 })} %`);

/**
 * Boutique → Statistiques : ce qui se vend, ce que cela rapporte.
 *
 * Ventes nettes des retours, ventes entièrement rendues exclues, ventes de
 * recette exclues. La marge ne se calcule que sur les lignes qui ont un coût
 * figé, et l'écran dit sur quelle part des ventes elle porte.
 */
export default async function StatistiquesBoutiquePage({ searchParams }: { searchParams: Promise<ParamsStatistiques> }) {
  await exigerAccesAdmin("perm_boutique_gestion");
  const params = await searchParams;
  const aujourdhui = aujourdhuiISO();
  const f = lireFiltresStatistiques(params, aujourdhui);

  const [stats, vendeuses] = await Promise.all([
    statistiquesBoutique({ du: f.du, au: f.au, canal: f.canal, vendeuse: f.vendeuse }),
    vendeusesBoutique(),
  ]);
  const avertissement = avertissementCouverture(stats.couverture);
  const { premiers, derniers, sansVente } = palmares(stats.articles);
  const categories = trier(stats.categories, "caTtc", "desc");

  const requete = new URLSearchParams(
    Object.entries({ periode: f.periode, du: f.du, au: f.au, canal: f.canal, vendeuse: f.vendeuse ?? "" })
      .filter(([, v]) => v) as [string, string][],
  ).toString();

  const champ: React.CSSProperties = {
    minHeight: 44, padding: "8px 12px", border: BORDURE, borderRadius: 12, fontSize: 15,
    color: MARINE, backgroundColor: "#FFFFFF", fontFamily: "inherit",
  };

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-6xl mx-auto" style={{ minWidth: 0 }}>
        <EnTete
          titre="📊 Statistiques"
          sousTitre={`Du ${formatDateFR(f.du)} au ${formatDateFR(f.au)} · ventes nettes des retours`}
          action={
            // Un lien simple, pas un Link : un téléchargement ne se précharge pas.
            <a href={`/boutique/statistiques/export?${requete}`} download style={{
              display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 16px", borderRadius: 12,
              border: BORDURE, backgroundColor: "#FFFFFF", color: MARINE, fontWeight: 600, textDecoration: "none",
            }}>
              ⬇️ Export CSV
            </a>
          }
        />

        <Carte>
          <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 13, color: SOUS }}>
              Période
              <select name="periode" defaultValue={f.periode} style={champ}>
                {PERIODES.map((p) => <option key={p.valeur} value={p.valeur}>{p.libelle}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13, color: SOUS }}>
              Du (dates libres)
              <input type="date" name="du" defaultValue={f.periode === "libre" ? f.du : ""} style={champ} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13, color: SOUS }}>
              Au
              <input type="date" name="au" defaultValue={f.periode === "libre" ? f.au : ""} style={champ} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13, color: SOUS }}>
              Canal
              <select name="canal" defaultValue={f.canal} style={champ}>
                {CANAUX.map((c) => <option key={c.valeur} value={c.valeur}>{c.libelle}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13, color: SOUS }}>
              Vendeuse
              <select name="vendeuse" defaultValue={f.vendeuse ?? ""} style={champ}>
                <option value="">Toutes</option>
                {vendeuses.map((v) => <option key={v.id} value={v.id}>{v.nom} ({v.initiales})</option>)}
              </select>
            </label>
            <button type="submit" style={{
              ...champ, backgroundColor: "#2E8B7E", color: "#FFFFFF", border: "none", fontWeight: 700, cursor: "pointer",
            }}>
              Afficher
            </button>
          </form>
        </Carte>

        {avertissement && (
          <p role="status" style={{
            margin: "16px 0 0", padding: "10px 14px", borderRadius: 12, fontSize: 15, fontWeight: 600,
            backgroundColor: "#F4EAC9", color: "#6E5410", border: "1px solid #E8D59B",
          }}>
            ⚠️ {avertissement}
          </p>
        )}

        {/* Totaux */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, margin: "16px 0" }}>
          <Chiffre titre="Chiffre d'affaires TTC" valeur={chf(stats.totaux.caTtc)} detail={`HT ${chf(stats.totaux.caHt)}`} />
          <Chiffre titre="Coût figé" valeur={chf(stats.totaux.cout)} />
          <Chiffre titre="Marge brute" valeur={chf(stats.totaux.marge)} detail={pct(stats.totaux.margePct)}
            couleur={stats.totaux.marge !== null && stats.totaux.marge < 0 ? "#A8453A" : "#1F6E5B"} />
          <Chiffre titre="Ventes" valeur={String(stats.totaux.nbVentes)} detail={`panier moyen ${chf(stats.totaux.panierMoyen)}`} />
          <Chiffre titre="Part des membres" valeur={pct(stats.totaux.partMembres)} detail={`remise accordée ${chf(stats.totaux.remiseMembre)}`} />
        </div>

        <Carte>
          <h2 className="font-bold" style={{ color: MARINE, margin: "0 0 4px" }}>Par article</h2>
          <p style={{ color: SOUS, fontSize: 13, margin: "0 0 12px" }}>
            Cliquez un en-tête pour trier. En vert les dix meilleurs chiffres d&apos;affaires, en rose les dix plus
            faibles ; en gris les articles qui ne se sont pas vendus sur la période.
          </p>
          <TableArticles
            articles={stats.articles.map((a) => ({ ...a, categorie: libelleCategorieArticle(a.categorie) }))}
            premiers={[...premiers]}
            derniers={[...derniers]}
            sansVente={[...sansVente]}
          />
        </Carte>

        <div style={{ height: 16 }} />

        <Carte>
          <h2 className="font-bold" style={{ color: MARINE, margin: "0 0 12px" }}>Par catégorie</h2>
          {categories.length === 0 ? (
            <p style={{ color: SOUS, margin: 0 }}>Aucune vente sur la période.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: 720, fontSize: 15 }}>
                <thead>
                  <tr style={{ color: SOUS, textAlign: "left" }}>
                    <th className="py-2 font-medium">Catégorie</th>
                    <th className="py-2 font-medium text-right">Quantité</th>
                    <th className="py-2 font-medium text-right">CA TTC</th>
                    <th className="py-2 font-medium text-right">CA HT</th>
                    <th className="py-2 font-medium text-right">Coût figé</th>
                    <th className="py-2 font-medium text-right">Marge</th>
                    <th className="py-2 font-medium text-right">Marge %</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c: Agregat) => (
                    <tr key={c.cle} style={{ borderTop: BORDURE }}>
                      <td className="py-2" style={{ color: MARINE, fontWeight: 600 }}>{libelleCategorieArticle(c.categorie)}</td>
                      <td className="py-2 text-right">{c.quantite}</td>
                      <td className="py-2 text-right">{chf(c.caTtc)}</td>
                      <td className="py-2 text-right">{chf(c.caHt)}</td>
                      <td className="py-2 text-right">{chf(c.cout)}</td>
                      <td className="py-2 text-right">{chf(c.marge)}{c.lignesSansCout > 0 && <Partiel n={c.lignesSansCout} />}</td>
                      <td className="py-2 text-right">{pct(c.margePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Carte>
      </div>
    </main>
  );
}

function Chiffre({ titre, valeur, detail, couleur = MARINE }: { titre: string; valeur: string; detail?: string; couleur?: string }) {
  return (
    <div style={{ backgroundColor: "#FFFFFF", border: BORDURE, borderRadius: 18, padding: 16 }}>
      <p style={{ color: SOUS, fontSize: 13, margin: 0 }}>{titre}</p>
      <p style={{ color: couleur, fontSize: 22, fontWeight: 700, margin: "6px 0 0" }}>{valeur}</p>
      {detail && <p style={{ color: SOUS, fontSize: 13, margin: "4px 0 0" }}>{detail}</p>}
    </div>
  );
}

function Partiel({ n }: { n: number }) {
  return (
    <span style={{ display: "block", fontSize: 12, color: "#A8453A" }}>
      {n} ligne{n > 1 ? "s" : ""} sans coût
    </span>
  );
}
