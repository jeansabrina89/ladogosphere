import Link from "next/link";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatDateFR, aujourdhuiISO } from "@/src/lib/dates";
import { CATEGORIES_DEPENSE, libelleCategorie, libelleMode } from "@/src/lib/depensesLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import BadgeStatut from "@/app/components/ui/BadgeStatut";
import FiltresDepenses from "./FiltresDepenses";

export const dynamic = "force-dynamic";

const chf = (n: number) => `${n.toFixed(2)} CHF`;

type DepenseListe = {
  id: string;
  numero: string | null;
  date_depense: string;
  libelle: string;
  montant: number | string;
  compte_charge: string;
  mode_paiement: string;
  statut: string;
  fournisseurs: { nom: string } | null;
};

function Tuile({ titre, valeur, couleur }: { titre: string; valeur: string; couleur: string }) {
  return (
    <Carte>
      <p style={{ color: "rgba(27,43,94,0.55)", fontSize: 13, margin: 0 }}>{titre}</p>
      <p style={{ color: couleur, fontSize: 24, fontWeight: 700, margin: "4px 0 0" }}>{valeur}</p>
    </Carte>
  );
}

export default async function DepensesPage({
  searchParams,
}: {
  searchParams: Promise<{ du?: string; au?: string; fournisseur?: string; compte?: string; q?: string }>;
}) {
  await exigerAccesAdmin("perm_depenses");

  const params = await searchParams;
  const du = (params.du ?? "").trim();
  const au = (params.au ?? "").trim();
  const fournisseur = (params.fournisseur ?? "").trim();
  const compte = (params.compte ?? "").trim();
  const recherche = (params.q ?? "").trim().toLowerCase();

  const [{ data: brutes }, { data: fournisseurs }] = await Promise.all([
    supabaseAdmin
      .from("depenses")
      .select(
        "id, numero, date_depense, libelle, montant, compte_charge, mode_paiement, statut, fournisseurs (nom)"
      )
      .order("date_depense", { ascending: false })
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("fournisseurs").select("id, nom").eq("actif", true).order("nom"),
  ]);

  const toutes = (brutes ?? []) as unknown as DepenseListe[];

  // Les pièces, pour la colonne « justificatif » et la tuile de contrôle.
  const { data: piecesBrutes } = await supabaseAdmin
    .from("pieces").select("entite_id").eq("entite", "depense");
  const avecPiece = new Set((piecesBrutes ?? []).map((p) => p.entite_id as string));

  const correspond = (d: DepenseListe) => {
    if (du && d.date_depense < du) return false;
    if (au && d.date_depense > au) return false;
    if (compte && d.compte_charge !== compte) return false;
    if (fournisseur && d.fournisseurs?.nom !== fournisseur) return false;
    if (!recherche) return true;
    const cible = `${d.numero ?? ""} ${d.libelle} ${d.fournisseurs?.nom ?? ""}`.toLowerCase();
    return cible.includes(recherche);
  };
  const depenses = toutes.filter(correspond);

  const vivantes = toutes.filter((d) => d.statut !== "annulee");
  const debutMois = `${aujourdhuiISO().slice(0, 7)}-01`;
  const ceMois = vivantes
    .filter((d) => d.date_depense >= debutMois && d.statut !== "brouillon")
    .reduce((s, d) => s + Number(d.montant), 0);
  const aPayer = vivantes
    .filter((d) => d.statut === "validee" && d.mode_paiement === "a_payer")
    .reduce((s, d) => s + Number(d.montant), 0);
  const sansJustificatif = vivantes.filter(
    (d) => d.statut !== "brouillon" && !avecPiece.has(d.id)
  ).length;

  const marine = "#1B2B5E";
  const sousTexte = "rgba(27,43,94,0.55)";
  const bordure = "1px solid rgba(27,43,94,0.12)";

  const queryExport = new URLSearchParams();
  if (du) queryExport.set("du", du);
  if (au) queryExport.set("au", au);
  if (compte) queryExport.set("compte", compte);
  if (fournisseur) queryExport.set("fournisseur", fournisseur);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-6xl mx-auto">
        <EnTete
          titre="🧾 Dépenses"
          sousTitre={`${toutes.length} dépense${toutes.length > 1 ? "s" : ""}`}
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href="/comptabilite/depenses/nouvelle" variante="principal">+ Dépense</Bouton>
              <Bouton href="/comptabilite/fournisseurs" variante="secondaire">🏢 Fournisseurs</Bouton>
              <Bouton href={`/api/depenses/export?${queryExport.toString()}`} variante="secondaire">
                📥 Exporter
              </Bouton>
              <Bouton href="/comptabilite" variante="secondaire">← Comptabilité</Bouton>
            </div>
          }
        />

        <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <Tuile titre="Ce mois" valeur={chf(ceMois)} couleur={marine} />
          <Tuile titre="À payer" valeur={chf(aPayer)} couleur={aPayer > 0 ? "#A8453A" : marine} />
          <Tuile
            titre="Sans justificatif"
            valeur={String(sansJustificatif)}
            couleur={sansJustificatif > 0 ? "#A8453A" : "#1F6E5B"}
          />
        </div>

        <FiltresDepenses
          categories={CATEGORIES_DEPENSE.map((c) => ({ compte: c.compte, libelle: c.libelle }))}
          fournisseurs={(fournisseurs ?? []).map((f) => f.nom as string)}
        />

        {depenses.length === 0 ? (
          <Carte>
            <EtatVide
              icone="🧾"
              titre="Aucune dépense"
              message="Aucune dépense ne correspond à cette recherche."
            />
          </Carte>
        ) : (
          <Carte>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 720 }}>
                <thead>
                  <tr style={{ color: sousTexte, textAlign: "left" }}>
                    <th className="py-2 font-medium">Numéro</th>
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Fournisseur</th>
                    <th className="py-2 font-medium">Libellé</th>
                    <th className="py-2 font-medium">Catégorie</th>
                    <th className="py-2 font-medium text-right">Montant</th>
                    <th className="py-2 font-medium">Statut</th>
                    <th className="py-2 font-medium text-center">Pièce</th>
                  </tr>
                </thead>
                <tbody>
                  {depenses.map((d) => (
                    <tr key={d.id} style={{ borderTop: bordure }}>
                      <td className="py-2">
                        <Link
                          href={`/comptabilite/depenses/${d.id}`}
                          style={{ color: marine, fontWeight: 700 }}
                        >
                          {d.numero ?? "brouillon"}
                        </Link>
                      </td>
                      <td className="py-2" style={{ color: sousTexte, whiteSpace: "nowrap" }}>
                        {formatDateFR(d.date_depense)}
                      </td>
                      <td className="py-2" style={{ color: sousTexte }}>{d.fournisseurs?.nom ?? "—"}</td>
                      <td className="py-2" style={{ color: marine }}>{d.libelle}</td>
                      <td className="py-2" style={{ color: sousTexte }}>
                        {libelleCategorie(d.compte_charge)}
                        <span style={{ display: "block", fontSize: 11 }}>
                          {d.compte_charge} · {libelleMode(d.mode_paiement)}
                        </span>
                      </td>
                      <td className="py-2 text-right" style={{ color: marine, fontWeight: 600, whiteSpace: "nowrap" }}>
                        {chf(Number(d.montant))}
                      </td>
                      <td className="py-2"><BadgeStatut statut={d.statut} /></td>
                      <td className="py-2 text-center">
                        {avecPiece.has(d.id) ? "📎" : (
                          <span title="Sans justificatif" style={{ color: "#A8453A", fontWeight: 700 }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Carte>
        )}
      </div>
    </main>
  );
}
