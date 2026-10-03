import Link from "next/link";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import TableFournisseurs, { type LigneFournisseur } from "@/app/components/fournisseurs/TableFournisseurs";
import {
  USAGES,
  basculerUsage,
  fournisseurRetenu,
  lireUsages,
} from "@/src/lib/usagesFournisseurs";
import { DOMAINES, fournisseursDuDomaine, lireDomaine } from "@/src/lib/domainesFournisseurs";

export const dynamic = "force-dynamic";

export default async function FournisseursPage({
  searchParams,
}: {
  searchParams: Promise<{ usages?: string | string[]; domaine?: string }>;
}) {
  await exigerAccesAdmin("perm_depenses");
  const params = await searchParams;
  // Pastilles cochables : union des usages cochés, rien de coché = tout.
  const coches = lireUsages(params.usages);
  // APP 73 — la Comptabilité voit TOUS les fournisseurs, filtrables par domaine.
  const domaine = lireDomaine(params.domaine);

  const [{ data: fournisseurs }, { data: depenses }] = await Promise.all([
    supabaseAdmin
      .from("fournisseurs")
      .select("id, nom, localite, email, telephone, compte_charge_defaut, actif, domaines")
      .order("actif", { ascending: false })
      .order("nom"),
    supabaseAdmin.from("depenses").select("fournisseur_id, montant, statut"),
  ]);

  // Total dépensé par fournisseur, hors annulations et brouillons.
  const totaux = new Map<string, { total: number; nb: number }>();
  for (const d of depenses ?? []) {
    const id = d.fournisseur_id as string | null;
    if (!id || d.statut === "annulee" || d.statut === "brouillon") continue;
    const t = totaux.get(id) ?? { total: 0, nb: 0 };
    t.total += Number(d.montant);
    t.nb += 1;
    totaux.set(id, t);
  }

  const tous = fournisseurs ?? [];
  const liste = fournisseursDuDomaine(tous, domaine)
    .filter((f) => fournisseurRetenu(f.compte_charge_defaut as string | null, coches));
  const sousTexte = "rgba(27,43,94,0.55)";
  // Les deux filtres se combinent : chacun garde l'autre dans l'adresse.
  const adresse = (u: string, d: string | null) => {
    const q = new URLSearchParams(u.startsWith("?") ? u.slice(1) : u);
    if (d) q.set("domaine", d);
    const t = q.toString().replace(/%2C/g, ",");
    return `/comptabilite/fournisseurs${t ? `?${t}` : ""}`;
  };
  const usagesActuels = coches.length > 0 ? `?usages=${coches.join(",")}` : "";

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">
        <EnTete
          titre="🏢 Fournisseurs"
          sousTitre={coches.length === 0 && !domaine
            ? `${tous.length} fiche${tous.length > 1 ? "s" : ""}`
            : `${liste.length} fiche${liste.length > 1 ? "s" : ""} sur ${tous.length}`}
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href="/comptabilite/fournisseurs/nouveau" variante="principal">+ Fournisseur</Bouton>
              <Bouton href="/comptabilite/depenses" variante="secondaire">← Dépenses</Bouton>
            </div>
          }
        />

        <nav aria-label="Filtrer par usage" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 14px" }}>
          {USAGES.map((u) => {
            const actif = coches.includes(u.valeur);
            return (
              <Link
                key={u.valeur}
                href={adresse(basculerUsage(coches, u.valeur), domaine)}
                aria-pressed={actif}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36, padding: "0 12px",
                  borderRadius: 999, fontSize: 13, fontWeight: 600, textDecoration: "none",
                  backgroundColor: actif ? u.texte : u.fond, color: actif ? "#FFFFFF" : u.texte,
                  border: `1px solid ${u.texte}`,
                }}
              >
                {actif ? "✓ " : ""}{u.libelle}
              </Link>
            );
          })}
          {(coches.length > 0 || domaine) && (
            <Link href="/comptabilite/fournisseurs" style={{ alignSelf: "center", fontSize: 13, color: sousTexte }}>
              Tout afficher
            </Link>
          )}
        </nav>

        <nav aria-label="Filtrer par domaine" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 14px" }}>
          {[{ valeur: null, libelle: "Tous les domaines" }, ...DOMAINES].map((d) => {
            const actif = d.valeur === domaine;
            return (
              <Link
                key={d.valeur ?? "tous"}
                href={adresse(usagesActuels, d.valeur)}
                aria-pressed={actif}
                style={{
                  display: "inline-flex", alignItems: "center", minHeight: 36, padding: "0 12px",
                  borderRadius: 999, fontSize: 13, fontWeight: 600, textDecoration: "none",
                  backgroundColor: actif ? "#1B2B5E" : "#FFFFFF", color: actif ? "#FFFFFF" : "#1B2B5E",
                  border: "1px solid rgba(27,43,94,0.25)",
                }}
              >
                {d.libelle}
              </Link>
            );
          })}
        </nav>

        <TableFournisseurs
          liste={liste as unknown as LigneFournisseur[]}
          lienFiche
          totaux={totaux}
          vide={tous.length === 0
            ? { titre: "Carnet vide", message: "Ajoutez un fournisseur pour retrouver ses coordonnées et sa catégorie habituelle à la saisie." }
            : { titre: "Aucun fournisseur pour ce filtre", message: "Décochez une pastille, ou changez de domaine." }}
        />
      </div>
    </main>
  );
}
