import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { listerArticlesSelonNiveau, type Article } from "@/src/lib/boutique";
import { manquePoids, sousLeSeuil } from "@/src/lib/boutiqueLogique";
import { sansEtiquettes } from "@/src/lib/etiquettesArticles";
import { statutVitrine } from "@/src/lib/statutVitrineLogique";
import Bouton from "@/app/components/ui/Bouton";
import CatalogueStock from "@/app/components/stock/CatalogueStock";
import {
  animalRetenu,
  articleDeLAnimal,
  grouperParRayon,
  ongletsAnimaux,
  rayonsOuverts,
} from "@/src/lib/listeArticlesAdmin";

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
    statut?: string; sanspoids?: string; sansetiquettes?: string; surcommande?: string;
    /* APP 47 : l'onglet d'animal, combinable avec tous les filtres ci-dessus. */
    animal?: string;
    /* APP 32 : « ART-0057 Paille », posé par la suppression pour le confirmer. */
    supprime?: string;
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
  // Le statut de vitrine se filtre comme le reste : « 4 brouillons » en tête
  // du tableau mène ici d’un clic.
  const statut = (params.statut ?? "").trim();
  // « Sans poids » : ceux qu'il faut compléter pour qu'ils partent par la poste.
  const seulementSansPoids = params.sanspoids === "1";
  // « Sans étiquettes » : ceux qu'aucun filtre du catalogue ne ramènera.
  const seulementSansEtiquettes = params.sansetiquettes === "1";
  // « Sur commande » : ce qui s'achète même à stock zéro (APP 26).
  const seulementSurCommande = params.surcommande === "1";

  // Sans la gestion, ni prix d'achat ni fournisseur ne quittent la base :
  // le filtrage est dans le SELECT, pas à l'affichage.
  const [tousBruts, { data: fournisseurs }] = await Promise.all([
    listerArticlesSelonNiveau(gestion ? "gestion" : "vente", { perimetre: "boutique" }),
    gestion
      // Les délais viennent avec : c'est eux qui disent si un article coché
      // est réellement commandable, et la liste doit le signaler.
      ? supabaseAdmin
          .from("fournisseurs")
          .select("id, nom, delai_commande_max_jours")
          .eq("actif", true)
          .order("nom")
      : Promise.resolve({ data: [] as { id: string; nom: string }[] }),
  ]);
  const tous = tousBruts as Article[];

  const correspond = (a: Article) => {
    if (!avecInactifs && !a.actif) return false;
    if (categorie && a.categorie !== categorie) return false;
    if (fournisseur && a.fournisseur_id !== fournisseur) return false;
    if (seulementSousSeuil && !sousLeSeuil(a)) return false;
    if (statut && statutVitrine(a.statut_vitrine) !== statut) return false;
    if (seulementSansPoids && !manquePoids(a)) return false;
    if (seulementSansEtiquettes && !sansEtiquettes(a)) return false;
    if (seulementSurCommande && a.disponible_sur_commande !== true) return false;
    if (!recherche) return true;
    const cible = `${a.nom} ${a.reference} ${a.marque ?? ""} ${a.code_barres ?? ""}`.toLowerCase();
    return cible.includes(recherche);
  };

  /*
   * La confirmation de suppression.
   *
   * Elle voyage dans l'adresse plutôt que dans une session : l'article n'existe
   * plus, il n'y a donc plus rien à interroger pour savoir ce qui vient de se
   * passer. Elle nomme la référence ET le nom, parce que « Article supprimé »
   * ne dit pas lequel — et c'est exactement ce qu'on veut relire.
   */
  const supprime = (params.supprime ?? "").trim().slice(0, 120);

  /*
   * APP 47 — l'animal, puis le rayon.
   *
   * Les onglets se calculent sur ce qui reste après TOUS LES AUTRES filtres,
   * l'animal excepté : sinon l'onglet « Chats » ferait disparaître « Chiens »,
   * et l'on ne pourrait plus en sortir qu'en effaçant l'adresse à la main.
   */
  const saufAnimal = tous.filter(correspond);
  const animal = animalRetenu(params.animal, saufAnimal);
  const retenus = saufAnimal.filter((a) => articleDeLAnimal(a, animal));

  /*
   * Les compteurs de tête SUIVENT L'ONGLET : « sous le seuil » sous l'onglet
   * Chats compte les chats. Ils ne suivent PAS la recherche ni les autres
   * filtres — « 12 sous le seuil » doit rester le nombre à traiter, pas le
   * nombre que ma recherche du moment laisse voir.
   */
  const tousDeLOnglet = tous.filter((a) => articleDeLAnimal(a, animal));

  const groupes = grouperParRayon(retenus);
  // Chercher et replier ne vont pas ensemble : replier cacherait la réponse.
  const filtreActif = Boolean(
    recherche || categorie || fournisseur || statut ||
    seulementSousSeuil || seulementSansPoids || seulementSansEtiquettes || seulementSurCommande,
  );

  /** L'adresse d'un onglet : tous les filtres en cours, l'animal remplacé. */
  const lienOnglet = (valeur: string | null) => {
    const q = new URLSearchParams();
    for (const [cle, v] of Object.entries(params)) {
      if (cle === "animal" || cle === "supprime") continue;
      if (typeof v === "string" && v.trim() !== "") q.set(cle, v);
    }
    if (valeur) q.set("animal", valeur);
    const s = q.toString();
    return s ? `/boutique/articles?${s}` : "/boutique/articles";
  };

  return (
    <CatalogueStock
      avis={supprime ? `${supprime} a été supprimé définitivement.` : null}
      perimetre="boutique"
      articles={retenus}
      tous={tousDeLOnglet}
      onglets={ongletsAnimaux(saufAnimal, animal)}
      groupes={groupes}
      rayonsOuverts={rayonsOuverts({ filtreActif, nbRayons: groupes.length })}
      lienOnglet={lienOnglet}
      fournisseurs={(fournisseurs ?? []) as { id: string; nom: string }[]}
      gestion={gestion}
      actions={
        gestion ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Bouton href="/boutique/articles/nouveau" variante="principal">+ Nouvel article</Bouton>
            <Bouton href="/boutique/inventaire" variante="secondaire">📦 Inventaire</Bouton>
          </div>
        ) : undefined
      }
    />
  );
}
