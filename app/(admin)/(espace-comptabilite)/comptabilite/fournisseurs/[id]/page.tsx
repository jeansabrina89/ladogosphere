import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatDateFR } from "@/src/lib/dates";
import { libelleCategorie } from "@/src/lib/depensesLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import BadgeStatut from "@/app/components/ui/BadgeStatut";
import FormFournisseur, {
  BoutonActivation,
  BoutonSupprimerFournisseur,
  type FournisseurExistant,
} from "../FormFournisseur";

export const dynamic = "force-dynamic";

const chf = (n: number) => `${n.toFixed(2)} CHF`;

export default async function FicheFournisseurPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerAccesAdmin("perm_depenses");
  const { id } = await params;

  const { data: fournisseur } = await supabaseAdmin
    .from("fournisseurs")
    .select("id, nom, adresse, npa, localite, email, telephone, iban, compte_charge_defaut, notes, actif")
    .eq("id", id)
    .maybeSingle();
  if (!fournisseur) notFound();

  const { data: depenses } = await supabaseAdmin
    .from("depenses")
    .select("id, numero, date_depense, libelle, montant, compte_charge, statut, exercice")
    .eq("fournisseur_id", id)
    .order("date_depense", { ascending: false });

  const liste = depenses ?? [];

  // Pièces jointes, pour signaler une dépense sans justificatif d'un coup d'œil.
  const ids = liste.map((d) => d.id as string);
  const { data: pieces } = ids.length
    ? await supabaseAdmin.from("pieces").select("entite_id").eq("entite", "depense").in("entite_id", ids)
    : { data: [] as { entite_id: string }[] };
  const avecPiece = new Set((pieces ?? []).map((p) => p.entite_id as string));

  // Total dépensé par exercice, hors brouillons et annulations.
  const parExercice = new Map<number, number>();
  for (const d of liste) {
    if (d.statut === "brouillon" || d.statut === "annulee") continue;
    const ex = (d.exercice as number) ?? Number(String(d.date_depense).slice(0, 4));
    parExercice.set(ex, (parExercice.get(ex) ?? 0) + Number(d.montant));
  }
  const exercices = [...parExercice.entries()].sort((a, b) => b[0] - a[0]);

  const marine = "#1B2B5E";
  const sousTexte = "rgba(27,43,94,0.55)";
  const bordure = "1px solid rgba(27,43,94,0.12)";

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto" style={{ display: "grid", gap: 16 }}>
        <EnTete
          titre={`🏢 ${fournisseur.nom as string}`}
          sousTitre={fournisseur.actif ? undefined : "Fiche désactivée"}
          action={<Bouton href="/comptabilite/fournisseurs" variante="secondaire">← Fournisseurs</Bouton>}
        />

        {exercices.length > 0 && (
          <Carte>
            <h2 className="font-bold mb-3" style={{ color: marine }}>Total dépensé</h2>
            <table className="w-full text-sm">
              <tbody>
                {exercices.map(([annee, total]) => (
                  <tr key={annee} style={{ borderTop: bordure }}>
                    <td className="py-1.5" style={{ color: sousTexte }}>Exercice {annee}</td>
                    <td className="py-1.5 text-right" style={{ color: marine, fontWeight: 700 }}>{chf(total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Carte>
        )}

        <Carte>
          <h2 className="font-bold mb-3" style={{ color: marine }}>Coordonnées</h2>
          <FormFournisseur fournisseur={fournisseur as unknown as FournisseurExistant} />
        </Carte>

        <Carte>
          <h2 className="font-bold mb-3" style={{ color: marine }}>
            Dépenses ({liste.length})
          </h2>
          {liste.length === 0 ? (
            <p style={{ color: sousTexte, fontSize: 14, margin: 0 }}>Aucune dépense pour ce fournisseur.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 560 }}>
                <thead>
                  <tr style={{ color: sousTexte, textAlign: "left" }}>
                    <th className="py-2 font-medium">Numéro</th>
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Libellé</th>
                    <th className="py-2 font-medium text-right">Montant</th>
                    <th className="py-2 font-medium">Statut</th>
                    <th className="py-2 font-medium text-center">Pièce</th>
                  </tr>
                </thead>
                <tbody>
                  {liste.map((d) => (
                    <tr key={d.id as string} style={{ borderTop: bordure }}>
                      <td className="py-2">
                        <Link href={`/comptabilite/depenses/${d.id}`} style={{ color: marine, fontWeight: 700 }}>
                          {(d.numero as string) ?? "brouillon"}
                        </Link>
                      </td>
                      <td className="py-2" style={{ color: sousTexte, whiteSpace: "nowrap" }}>
                        {formatDateFR(d.date_depense as string)}
                      </td>
                      <td className="py-2" style={{ color: marine }}>
                        {d.libelle as string}
                        <span style={{ display: "block", fontSize: 11, color: sousTexte }}>
                          {libelleCategorie(d.compte_charge as string)} · {d.compte_charge as string}
                        </span>
                      </td>
                      <td className="py-2 text-right" style={{ color: marine, fontWeight: 600, whiteSpace: "nowrap" }}>
                        {chf(Number(d.montant))}
                      </td>
                      <td className="py-2"><BadgeStatut statut={d.statut as string} /></td>
                      <td className="py-2 text-center">
                        {avecPiece.has(d.id as string) ? "📎" : (
                          <span title="Sans justificatif" style={{ color: "#A8453A", fontWeight: 700 }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Carte>

        <Carte>
          <h2 className="font-bold mb-3" style={{ color: marine }}>Fiche</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
            <BoutonActivation id={id} actif={fournisseur.actif as boolean} />
            {liste.length === 0 && <BoutonSupprimerFournisseur id={id} />}
          </div>
          {liste.length > 0 && (
            <p style={{ color: sousTexte, fontSize: 12, marginTop: 10, marginBottom: 0 }}>
              Ce fournisseur porte des dépenses : il se désactive, il ne se supprime pas.
            </p>
          )}
        </Carte>
      </div>
    </main>
  );
}
