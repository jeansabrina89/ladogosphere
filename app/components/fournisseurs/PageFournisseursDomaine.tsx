import { supabaseAdmin } from "@/src/lib/supabase-admin";
import type { AccesAdmin } from "@/src/lib/accesAdmin";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import TableFournisseurs, { type LigneFournisseur } from "@/app/components/fournisseurs/TableFournisseurs";
import { fournisseursDuDomaine, infoDomaine } from "@/src/lib/domainesFournisseurs";

/**
 * APP 73 — les fournisseurs d'UN domaine, vus depuis son espace (Boutique ou
 * Atelier). La garde est celle de la page qui l'appelle ; ce composant ne lit
 * que des coordonnées — jamais une dépense : les montants restent à la
 * Comptabilité.
 *
 * La fiche et la création gardent leur garde d'aujourd'hui (« Dépenses ») :
 * leurs boutons n'apparaissent qu'à qui peut les ouvrir.
 */
export default async function PageFournisseursDomaine({
  domaine,
  acces,
}: {
  domaine: "boutique" | "atelier";
  acces: AccesAdmin;
}) {
  const peutFiche = acces.isAdmin || acces.permissions.perm_depenses === true;

  const { data } = await supabaseAdmin
    .from("fournisseurs")
    .select("id, nom, localite, email, telephone, actif, domaines")
    .order("actif", { ascending: false })
    .order("nom");

  const liste = fournisseursDuDomaine((data ?? []) as LigneFournisseur[], domaine);
  const info = infoDomaine(domaine);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">
        <EnTete
          titre="🏢 Fournisseurs"
          sousTitre={`${info.court} · ${liste.length} fiche${liste.length > 1 ? "s" : ""}`}
          action={peutFiche ? (
            <Bouton href={`/comptabilite/fournisseurs/nouveau?domaine=${domaine}`} variante="principal">
              + Fournisseur
            </Bouton>
          ) : undefined}
        />
        <TableFournisseurs
          liste={liste}
          lienFiche={peutFiche}
          vide={{
            titre: `Aucun fournisseur « ${info.court} »`,
            message: "Cochez ce domaine sur la fiche d'un fournisseur pour qu'il apparaisse ici.",
          }}
        />
      </div>
    </main>
  );
}
