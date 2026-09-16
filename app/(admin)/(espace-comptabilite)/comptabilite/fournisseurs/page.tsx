import Link from "next/link";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { libelleCategorie } from "@/src/lib/depensesLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import {
  USAGES,
  basculerUsage,
  fournisseurRetenu,
  infoUsage,
  lireUsages,
  usageDuCompte,
} from "@/src/lib/usagesFournisseurs";

export const dynamic = "force-dynamic";

const chf = (n: number) => `${n.toFixed(2)} CHF`;

export default async function FournisseursPage({
  searchParams,
}: {
  searchParams: Promise<{ usages?: string | string[] }>;
}) {
  await exigerAccesAdmin("perm_depenses");
  // Pastilles cochables : union des usages cochés, rien de coché = tout.
  const coches = lireUsages((await searchParams).usages);

  const [{ data: fournisseurs }, { data: depenses }] = await Promise.all([
    supabaseAdmin
      .from("fournisseurs")
      .select("id, nom, localite, email, telephone, compte_charge_defaut, actif")
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
  const liste = tous.filter((f) => fournisseurRetenu(f.compte_charge_defaut as string | null, coches));
  const marine = "#1B2B5E";
  const sousTexte = "rgba(27,43,94,0.55)";
  const bordure = "1px solid rgba(27,43,94,0.12)";

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">
        <EnTete
          titre="🏢 Fournisseurs"
          sousTitre={coches.length === 0
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
                href={`/comptabilite/fournisseurs${basculerUsage(coches, u.valeur)}`}
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
          {coches.length > 0 && (
            <Link href="/comptabilite/fournisseurs" style={{ alignSelf: "center", fontSize: 13, color: sousTexte }}>
              Tout afficher
            </Link>
          )}
        </nav>

        {tous.length > 0 && liste.length === 0 ? (
          <Carte>
            <EtatVide
              icone="🏢"
              titre="Aucun fournisseur pour cet usage"
              message="Décochez une pastille, ou renseignez la catégorie habituelle d'un fournisseur."
            />
          </Carte>
        ) : liste.length === 0 ? (
          <Carte>
            <EtatVide
              icone="🏢"
              titre="Carnet vide"
              message="Ajoutez un fournisseur pour retrouver ses coordonnées et sa catégorie habituelle à la saisie."
            />
          </Carte>
        ) : (
          <Carte>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 620 }}>
                <thead>
                  <tr style={{ color: sousTexte, textAlign: "left" }}>
                    <th className="py-2 font-medium">Nom</th>
                    <th className="py-2 font-medium">Localité</th>
                    <th className="py-2 font-medium">Catégorie habituelle</th>
                    <th className="py-2 font-medium text-right">Dépenses</th>
                    <th className="py-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {liste.map((f) => {
                    const t = totaux.get(f.id as string) ?? { total: 0, nb: 0 };
                    return (
                      <tr key={f.id as string} style={{ borderTop: bordure, opacity: f.actif ? 1 : 0.5 }}>
                        <td className="py-2">
                          <Link href={`/comptabilite/fournisseurs/${f.id}`} style={{ color: marine, fontWeight: 700 }}>
                            {f.nom as string}
                          </Link>
                          {!f.actif && (
                            <span style={{ color: sousTexte, fontSize: 12 }}> — désactivé</span>
                          )}
                          {(() => {
                            const u = infoUsage(usageDuCompte(f.compte_charge_defaut as string | null));
                            return (
                              <span style={{
                                display: "inline-block", marginLeft: 8, fontSize: 11, fontWeight: 600,
                                padding: "1px 8px", borderRadius: 999, backgroundColor: u.fond, color: u.texte,
                              }}>
                                {u.libelle}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-2" style={{ color: sousTexte }}>{(f.localite as string) ?? "—"}</td>
                        <td className="py-2" style={{ color: sousTexte }}>
                          {f.compte_charge_defaut
                            ? `${libelleCategorie(f.compte_charge_defaut as string)} (${f.compte_charge_defaut})`
                            : "—"}
                        </td>
                        <td className="py-2 text-right" style={{ color: sousTexte }}>{t.nb}</td>
                        <td className="py-2 text-right" style={{ color: marine, fontWeight: 600, whiteSpace: "nowrap" }}>
                          {chf(t.total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Carte>
        )}
      </div>
    </main>
  );
}
