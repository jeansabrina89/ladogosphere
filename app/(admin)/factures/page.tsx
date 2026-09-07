import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatDateFR } from "@/src/lib/dates";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import BadgeFacture from "./BadgeFacture";
import FiltresFactures from "./FiltresFactures";
import { etatFacture } from "@/src/lib/factureStatut";

const chf = (n: number) => `${(Number(n) || 0).toFixed(2)} CHF`;

const TYPES: Record<string, string> = {
  facture: "Facture", libre: "Facture", acompte: "Acompte", avoir: "Avoir",
};

type FactureListe = {
  id: string; numero: string | null; type: string; statut: string;
  date_facture: string | null; date_echeance: string | null;
  montant_total: number | string; montant_paye: number | string; montant_restant: number | string;
  clients: { prenom?: string; nom?: string } | null;
};

export default async function FacturesListePage({
  searchParams,
}: {
  searchParams: Promise<{ vues?: string; q?: string; du?: string; au?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("role, perm_encaissements").eq("id", user.id).single();
  if (profile?.role !== "admin" && !profile?.perm_encaissements) redirect("/");

  const params = await searchParams;
  const selection = new Set((params.vues || "").split(",").filter(Boolean));
  const recherche = (params.q || "").trim().toLowerCase();
  const du = (params.du || "").trim();
  const au = (params.au || "").trim();
  const aujourdhui = new Date().toISOString().split("T")[0];

  let requete = supabaseAdmin
    .from("factures")
    .select(`
      id, numero, type, statut, date_facture, date_echeance,
      montant_total, montant_paye, montant_restant, clients (prenom, nom)
    `)
    .order("date_facture", { ascending: false })
    .order("created_at", { ascending: false });
  if (du) requete = requete.gte("date_facture", du);
  if (au) requete = requete.lte("date_facture", au);

  const { data: brutes } = await requete;
  const toutes = (brutes ?? []) as unknown as FactureListe[];

  const correspond = (f: FactureListe) => {
    if (selection.size > 0 && !selection.has(etatFacture(f, aujourdhui))) return false;
    if (recherche === "") return true;
    const c = f.clients;
    const cible = `${f.numero ?? ""} ${c?.prenom ?? ""} ${c?.nom ?? ""}`.toLowerCase();
    return cible.includes(recherche);
  };
  const factures = toutes.filter(correspond);

  // Tuiles : ce qui reste à encaisser, ce qui traîne, ce qui est rentré ce mois.
  const emises = toutes.filter((f) => f.numero && f.type !== "avoir"
    && f.statut !== "annulee" && f.statut !== "annulee_par_avoir");
  const aEncaisser = emises.reduce((s, f) => s + Math.max(Number(f.montant_restant) || 0, 0), 0);
  const enRetard = emises
    .filter((f) => etatFacture(f, aujourdhui) === "en_retard")
    .reduce((s, f) => s + Math.max(Number(f.montant_restant) || 0, 0), 0);

  const debutMois = `${aujourdhui.slice(0, 7)}-01`;
  const { data: paiementsMois } = await supabaseAdmin
    .from("paiements_resa").select("montant, arrondi").gte("date_paiement", debutMois).lte("date_paiement", aujourdhui);
  const encaisseCeMois = (paiementsMois ?? []).reduce(
    (s: number, p: { montant: number | string; arrondi: number | string }) =>
      s + Number(p.montant) + Number(p.arrondi ?? 0), 0);

  const marine = "#1B2B5E";
  const sousTexte = "rgba(27,43,94,0.55)";
  const bordure = "1px solid rgba(27,43,94,0.12)";

  const exportHref = `/api/comptabilite/journal-export?annee=${aujourdhui.slice(0, 4)}`;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-6xl mx-auto">
        <EnTete
          titre="🧾 Factures"
          sousTitre={`${toutes.length} pièce${toutes.length > 1 ? "s" : ""}`}
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href="/factures/nouvelle" variante="principal">+ Nouvelle facture</Bouton>
              <Bouton href={exportHref} variante="secondaire">📥 Exporter</Bouton>
              <Bouton href="/comptabilite" variante="secondaire">← Comptabilité</Bouton>
            </div>
          }
        />

        <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <Tuile titre="À encaisser" valeur={chf(aEncaisser)} couleur={marine} />
          <Tuile titre="En retard" valeur={chf(enRetard)} couleur={enRetard > 0 ? "#A8453A" : marine} />
          <Tuile titre="Encaissé ce mois" valeur={chf(encaisseCeMois)} couleur="#1F6E5B" />
        </div>

        <FiltresFactures />

        {factures.length === 0 ? (
          <Carte>
            <div className="p-2">
              <EtatVide icone="🧾" titre="Aucune facture" message="Aucune pièce ne correspond à cette recherche." />
            </div>
          </Carte>
        ) : (
          <Carte>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: sousTexte }}>
                    <th className="text-left py-2 px-3 font-semibold">N°</th>
                    <th className="text-left py-2 px-3 font-semibold">Date</th>
                    <th className="text-left py-2 px-3 font-semibold">Échéance</th>
                    <th className="text-left py-2 px-3 font-semibold">Client</th>
                    <th className="text-left py-2 px-3 font-semibold">Type</th>
                    <th className="text-right py-2 px-3 font-semibold">Total</th>
                    <th className="text-right py-2 px-3 font-semibold">Payé</th>
                    <th className="text-right py-2 px-3 font-semibold">Reste</th>
                    <th className="text-left py-2 px-3 font-semibold">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {factures.map((f) => {
                    const c = f.clients;
                    const reste = Number(f.montant_restant) || 0;
                    const etat = etatFacture(f, aujourdhui);
                    return (
                      <tr key={f.id} style={{ borderTop: bordure }}>
                        <td className="py-2 px-3">
                          <a href={`/factures/${f.id}`} className="font-semibold" style={{ color: marine }}>
                            {f.numero ?? "brouillon"}
                          </a>
                        </td>
                        <td className="py-2 px-3" style={{ color: sousTexte }}>
                          {f.date_facture ? formatDateFR(f.date_facture) : "—"}
                        </td>
                        <td className="py-2 px-3" style={{ color: etat === "en_retard" ? "#A8453A" : sousTexte }}>
                          {f.date_echeance ? formatDateFR(f.date_echeance) : "—"}
                        </td>
                        <td className="py-2 px-3" style={{ color: marine }}>
                          {c ? `${c.prenom ?? ""} ${c.nom ?? ""}`.trim() : "—"}
                        </td>
                        <td className="py-2 px-3" style={{ color: sousTexte }}>{TYPES[f.type] ?? f.type}</td>
                        <td className="py-2 px-3 text-right" style={{ color: marine }}>{chf(Number(f.montant_total))}</td>
                        <td className="py-2 px-3 text-right" style={{ color: sousTexte }}>{chf(Number(f.montant_paye))}</td>
                        <td className="py-2 px-3 text-right" style={{ color: reste > 0 ? "#A8453A" : sousTexte }}>
                          {reste > 0 ? chf(reste) : "—"}
                        </td>
                        <td className="py-2 px-3"><BadgeFacture facture={f} aujourdhui={aujourdhui} /></td>
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

function Tuile({ titre, valeur, couleur }: { titre: string; valeur: string; couleur: string }) {
  return (
    <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: "rgba(27,43,94,0.12)" }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "rgba(27,43,94,0.5)" }}>
        {titre}
      </p>
      <p className="text-2xl font-bold" style={{ color: couleur }}>{valeur}</p>
    </div>
  );
}
