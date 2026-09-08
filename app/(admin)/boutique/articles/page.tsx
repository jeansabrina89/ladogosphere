import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { listerArticlesSelonNiveau, type Article } from "@/src/lib/boutique";
import { sousLeSeuil } from "@/src/lib/boutiqueLogique";
import Bouton from "@/app/components/ui/Bouton";
import CatalogueStock from "@/app/components/stock/CatalogueStock";

export const dynamic = "force-dynamic";

/**
 * Le catalogue du magasin : ce qui se VEND.
 *
 * Aucune fourniture de fabrication n'y figure — le filtre est dans la requête
 * (`perimetre: "boutique"`), pas à l'affichage : ce qui n'a pas sa place ici ne
 * doit pas quitter la base. Les fournitures vivent dans l'espace Atelier.
 */
export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; categorie?: string; fournisseur?: string; seuil?: string; inactifs?: string;
  }>;
}) {
  const acces = await exigerAccesAdmin("perm_boutique_vente");
  // Le niveau vient de la garde, jamais du navigateur.
  const gestion = acces.permissions.perm_boutique_gestion === true;

  const params = await searchParams;
  const recherche = (params.q ?? "").trim().toLowerCase();
  const categorie = (params.categorie ?? "").trim();
  const fournisseur = (params.fournisseur ?? "").trim();
  const seulementSousSeuil = params.seuil === "1";
  const avecInactifs = params.inactifs === "1";

  // Sans la gestion, ni prix d'achat ni fournisseur ne quittent la base :
  // le filtrage est dans le SELECT, pas à l'affichage.
  const [tousBruts, { data: fournisseurs }] = await Promise.all([
    listerArticlesSelonNiveau(gestion ? "gestion" : "vente", { perimetre: "boutique" }),
    gestion
      ? supabaseAdmin.from("fournisseurs").select("id, nom").eq("actif", true).order("nom")
      : Promise.resolve({ data: [] as { id: string; nom: string }[] }),
  ]);
  const tous = tousBruts as Article[];

  const correspond = (a: Article) => {
    if (!avecInactifs && !a.actif) return false;
    if (categorie && a.categorie !== categorie) return false;
    if (fournisseur && a.fournisseur_id !== fournisseur) return false;
    if (seulementSousSeuil && !sousLeSeuil(a)) return false;
    if (!recherche) return true;
    const cible = `${a.nom} ${a.reference} ${a.marque ?? ""} ${a.code_barres ?? ""}`.toLowerCase();
    return cible.includes(recherche);
  };

  return (
    <CatalogueStock
      perimetre="boutique"
      articles={tous.filter(correspond)}
      tous={tous}
      fournisseurs={(fournisseurs ?? []) as { id: string; nom: string }[]}
      gestion={gestion}
      actions={
        gestion ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Bouton href="/boutique/articles/nouveau" variante="principal">+ Article</Bouton>
            <Bouton href="/boutique/inventaire" variante="secondaire">📦 Inventaire</Bouton>
          </div>
        ) : undefined
      }
    />
  );
}
