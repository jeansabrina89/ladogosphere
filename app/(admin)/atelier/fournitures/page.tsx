import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { listerArticlesSelonNiveau, type Article } from "@/src/lib/boutique";
import { sousLeSeuil } from "@/src/lib/boutiqueLogique";
import { statutVitrine } from "@/src/lib/statutVitrineLogique";
import Bouton from "@/app/components/ui/Bouton";
import CatalogueStock from "@/app/components/stock/CatalogueStock";

export const dynamic = "force-dynamic";

/**
 * Le catalogue de l'atelier : ce qu'on TRANSFORME.
 *
 * Le même écran que le catalogue du magasin, avec un périmètre différent — pas
 * une copie. Ici, ni article revendable, ni article sur mesure : uniquement les
 * fournitures (`articles.composant = true`), filtrées dans la requête.
 *
 * L'atelier n'a qu'un niveau de permission : qui y entre voit les prix d'achat,
 * puisque c'est précisément ce qui déclenche une commande fournisseur.
 */
export default async function FournituresPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; categorie?: string; fournisseur?: string; seuil?: string; inactifs?: string;
    statut?: string;
  }>;
}) {
  await exigerAccesAdmin("perm_atelier");

  const params = await searchParams;
  const recherche = (params.q ?? "").trim().toLowerCase();
  const categorie = (params.categorie ?? "").trim();
  const fournisseur = (params.fournisseur ?? "").trim();
  const seulementSousSeuil = params.seuil === "1";
  const avecInactifs = params.inactifs === "1";
  // Le statut de vitrine se filtre comme le reste : « 4 brouillons » en tête
  // du tableau mène ici d’un clic.
  const statut = (params.statut ?? "").trim();

  const [tousBruts, { data: fournisseurs }] = await Promise.all([
    listerArticlesSelonNiveau("gestion", { perimetre: "atelier" }),
    supabaseAdmin.from("fournisseurs").select("id, nom").eq("actif", true).order("nom"),
  ]);
  const tous = tousBruts as Article[];

  const correspond = (a: Article) => {
    if (!avecInactifs && !a.actif) return false;
    if (categorie && a.categorie !== categorie) return false;
    if (fournisseur && a.fournisseur_id !== fournisseur) return false;
    if (seulementSousSeuil && !sousLeSeuil(a)) return false;
    if (statut && statutVitrine(a.statut_vitrine) !== statut) return false;
    if (!recherche) return true;
    const cible = `${a.nom} ${a.reference} ${a.marque ?? ""} ${a.code_barres ?? ""}`.toLowerCase();
    return cible.includes(recherche);
  };

  return (
    <CatalogueStock
      perimetre="atelier"
      articles={tous.filter(correspond)}
      tous={tous}
      fournisseurs={(fournisseurs ?? []) as { id: string; nom: string }[]}
      gestion
      actions={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* Un seul écran de création, deux portes : la case « fourniture »
              arrive cochée quand on vient de l'atelier. */}
          <Bouton href="/atelier/fournitures/nouvelle" variante="principal">+ Fourniture</Bouton>
          <Bouton href="/atelier/inventaire" variante="secondaire">📦 Inventaire</Bouton>
        </div>
      }
    />
  );
}
