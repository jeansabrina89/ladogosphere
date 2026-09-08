import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { articleEnLigne, nombreArticlesPanier } from "@/src/lib/venteEnLigne";
import { lireCatalogueOptions } from "@/src/lib/personnalisation";
import { urlPhotoArticle, libelleCategorieArticle } from "@/src/lib/boutiqueLogique";
import { disponibilite } from "@/src/lib/venteEnLigneLogique";
import { alerteProposable, normaliserEmail } from "@/src/lib/alertesStockLogique";
import { alerteEnCours } from "@/src/lib/alertesStock";
import AlerteStock from "./AlerteStock";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import ConfigurateurClient from "./ConfigurateurClient";
import BoutonAjouter from "./BoutonAjouter";
import BarrePanier from "../BarrePanier";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.12)";

/**
 * Fiche produit.
 *
 * Un article ordinaire s'ajoute au panier ; un article personnalisable ouvre
 * le configurateur d'APP 12, devenu validant. Le catalogue reste consultable
 * sans compte : c'est pour commander qu'il faut se connecter.
 */
export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let clientId: string | null = null;
  let emailConnu: string | null = null;
  if (user) {
    const { data } = await supabase
      .from("clients").select("id, email").eq("auth_user_id", user.id).maybeSingle();
    clientId = (data?.id as string) ?? null;
    emailConnu = normaliserEmail((data?.email as string) ?? user.email) || null;
  }

  const { id } = await params;
  const article = await articleEnLigne(id);
  if (!article) notFound();

  const surMesure = article.type_article === "personnalisable";
  const [catalogue, nombre] = await Promise.all([
    surMesure ? lireCatalogueOptions(id) : Promise.resolve({ groupes: [], dependances: [] }),
    clientId ? nombreArticlesPanier(clientId) : Promise.resolve(0),
  ]);

  const dispo = disponibilite(article.stock_disponible, article.type_article);
  const url = urlPhotoArticle(article.photo_path);

  // L'alerte ne se propose que là où elle a un sens : un article à stock,
  // vendu en ligne, et réellement épuisé. Un article sur mesure se fabrique —
  // il n'est jamais en rupture, et n'a rien à annoncer.
  const proposerAlerte = alerteProposable({
    type_article: article.type_article,
    // `articleEnLigne` ne rend que l'actif et le vendable en ligne : être ici
    // les prouve tous les deux.
    vendable_en_ligne: true,
    actif: true,
    stock_disponible: article.stock_disponible,
  });
  // Relue à chaque affichage : le même écran rechargé montre le même état.
  const dejaInscrit = proposerAlerte && emailConnu
    ? (await alerteEnCours(article.id, emailConnu))?.email ?? null
    : null;

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8", paddingBottom: 110 }}>
      <div className="max-w-4xl mx-auto">
        <EnTete
          titre={`${surMesure ? "🎨" : "🛍️"} ${article.nom}`}
          sousTitre={libelleCategorieArticle(article.categorie) + (article.marque ? ` · ${article.marque}` : "")}
          action={<Bouton href="/mon-compte/boutique" variante="secondaire">← Boutique</Bouton>}
        />

        {!user && (
          <Carte>
            <p style={{ color: MARINE, fontSize: 15, margin: 0 }}>
              <Link href={`/login?suite=/mon-compte/boutique/${id}`} style={{ color: "#1F6E5B", fontWeight: 700 }}>
                Connectez-vous
              </Link>{" "}
              pour commander cet article.
            </p>
          </Carte>
        )}

        {surMesure ? (
          catalogue.groupes.length === 0 ? (
            <Carte>
              <p style={{ color: SOUS, fontSize: 15, margin: 0 }}>
                Cet article n&apos;a pas encore d&apos;options à choisir. Passez nous voir, nous en
                parlerons de vive voix.
              </p>
            </Carte>
          ) : (
            <ConfigurateurClient
              article={{
                id: article.id,
                nom: article.nom,
                description: article.description,
                prix_vente: article.prix_vente,
                delai_fabrication_jours: article.delai_fabrication_jours,
                photo_path: article.photo_path,
              }}
              groupes={catalogue.groupes}
              dependances={catalogue.dependances}
              connecte={!!clientId}
            />
          )
        ) : (
          <Carte>
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              {url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={url} alt={article.nom} style={{
                  width: "100%", maxHeight: 320, objectFit: "cover",
                  borderRadius: 14, border: BORDURE,
                }} />
              ) : (
                <div style={{
                  minHeight: 200, borderRadius: 14, backgroundColor: "#EDE8DF",
                  display: "flex", alignItems: "center", justifyContent: "center", color: SOUS,
                }}>
                  Pas encore de photo
                </div>
              )}

              <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
                {article.description && (
                  <p style={{ color: MARINE, fontSize: 15, margin: 0, whiteSpace: "pre-line" }}>
                    {article.description}
                  </p>
                )}
                <p style={{ color: MARINE, fontSize: 26, fontWeight: 700, margin: 0 }}>
                  {Number(article.prix_vente).toFixed(2)} CHF
                  <span style={{ color: SOUS, fontSize: 15, fontWeight: 400 }}> TTC</span>
                </p>
                <p style={{
                  color: dispo.etat === "epuise" ? SOUS : dispo.etat === "dernier" ? "#8A5A1F" : "#1F6E5B",
                  fontSize: 16, fontWeight: 600, margin: 0,
                }}>
                  {dispo.libelle}
                </p>
                {article.expediable === false && (
                  <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>
                    📦 Trop lourd pour un colis : à retirer à la pension ou au départ de votre chien.
                  </p>
                )}

                <BoutonAjouter
                  articleId={article.id}
                  nom={article.nom}
                  epuise={dispo.etat === "epuise"}
                  connecte={!!clientId}
                />

                {/* SOUS le bouton, jamais à sa place. */}
                {proposerAlerte && (
                  <AlerteStock
                    articleId={article.id}
                    emailConnu={emailConnu}
                    dejaInscrit={dejaInscrit}
                  />
                )}
              </div>
            </div>
          </Carte>
        )}
      </div>

      <BarrePanier nombre={nombre} />
    </main>
  );
}
