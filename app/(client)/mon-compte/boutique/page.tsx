import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { urlPhotoArticle, libelleCategorieArticle } from "@/src/lib/boutiqueLogique";
import { libelleDelai } from "@/src/lib/personnalisationLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import EtatVide from "@/app/components/ui/EtatVide";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.12)";

/**
 * Les articles sur mesure, côté client : on les configure, on voit le prix et
 * le délai. La commande elle-même se passe au comptoir.
 */
export default async function BoutiqueClientPage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: articles } = await supabaseAdmin
    .from("articles")
    .select("id, nom, description, categorie, prix_vente, photo_path, delai_fabrication_jours")
    .eq("actif", true)
    .eq("vendable_en_ligne", true)
    .eq("composant", false)
    .eq("type_article", "personnalisable")
    .order("nom");

  const liste = articles ?? [];

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">
        <EnTete
          titre="🎁 Sur mesure"
          sousTitre="Composez votre collier, votre laisse ou votre harnais, et voyez le prix en direct."
        />

        {liste.length === 0 ? (
          <Carte>
            <EtatVide
              icone="🎁"
              titre="Rien à personnaliser pour l'instant"
              message="Les articles sur mesure apparaîtront ici dès qu'ils seront proposés."
            />
          </Carte>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {liste.map((a) => {
              const url = urlPhotoArticle(a.photo_path as string | null);
              return (
                <Link key={a.id as string} href={`/mon-compte/boutique/${a.id}`}
                  style={{ textDecoration: "none" }}>
                  <Carte>
                    {url ? (
                      /* Photo du bucket public de la boutique. */
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={url} alt={a.nom as string} style={{
                        width: "100%", height: 160, objectFit: "cover",
                        borderRadius: 12, border: BORDURE, marginBottom: 10,
                      }} />
                    ) : (
                      <div style={{
                        width: "100%", height: 160, borderRadius: 12, marginBottom: 10,
                        backgroundColor: "#EDE8DF", display: "flex",
                        alignItems: "center", justifyContent: "center", color: SOUS,
                      }}>
                        Pas encore de photo
                      </div>
                    )}
                    <p style={{ color: MARINE, fontSize: 17, fontWeight: 700, margin: 0 }}>{a.nom as string}</p>
                    <p style={{ color: SOUS, fontSize: 13, margin: "2px 0 8px" }}>
                      {libelleCategorieArticle(a.categorie as string)}
                    </p>
                    <p style={{ color: MARINE, fontSize: 16, fontWeight: 600, margin: 0 }}>
                      dès {Number(a.prix_vente).toFixed(2)} CHF
                    </p>
                    <p style={{ color: SOUS, fontSize: 13, margin: "2px 0 0" }}>
                      🛠️ {libelleDelai(Number(a.delai_fabrication_jours ?? 0))}
                    </p>
                  </Carte>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
