import Link from "next/link";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { libelleCategorie } from "@/src/lib/depensesLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";

export const dynamic = "force-dynamic";

const chf = (n: number) => `${n.toFixed(2)} CHF`;

export default async function FournisseursPage() {
  await exigerAccesAdmin("perm_depenses");

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

  const liste = fournisseurs ?? [];
  const marine = "#1B2B5E";
  const sousTexte = "rgba(27,43,94,0.55)";
  const bordure = "1px solid rgba(27,43,94,0.12)";

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">
        <EnTete
          titre="🏢 Fournisseurs"
          sousTitre={`${liste.length} fiche${liste.length > 1 ? "s" : ""}`}
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href="/comptabilite/fournisseurs/nouveau" variante="principal">+ Fournisseur</Bouton>
              <Bouton href="/comptabilite/depenses" variante="secondaire">← Dépenses</Bouton>
            </div>
          }
        />

        {liste.length === 0 ? (
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
