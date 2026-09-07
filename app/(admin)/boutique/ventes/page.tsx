import Link from "next/link";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { aujourdhuiISO, formatDateFR } from "@/src/lib/dates";
import { listerVentes, resumeVentesDuJour } from "@/src/lib/caisse";
import { libelleModeVente, chf } from "@/src/lib/caisseLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import FiltresVentes from "./FiltresVentes";

export const dynamic = "force-dynamic";

const marine = "#1B2B5E";
const sousTexte = "rgba(27,43,94,0.55)";
const bordure = "1px solid rgba(27,43,94,0.12)";

function Tuile({ titre, valeur, couleur }: { titre: string; valeur: string; couleur: string }) {
  return (
    <Carte>
      <p style={{ color: sousTexte, fontSize: 13, margin: 0 }}>{titre}</p>
      <p style={{ color: couleur, fontSize: 24, fontWeight: 700, margin: "4px 0 0" }}>{valeur}</p>
    </Carte>
  );
}

export default async function VentesPage({
  searchParams,
}: {
  searchParams: Promise<{ du?: string; au?: string; mode?: string }>;
}) {
  await exigerAccesAdmin("perm_boutique");

  const params = await searchParams;
  const jour = aujourdhuiISO();

  const [ventes, resume] = await Promise.all([
    listerVentes({ du: params.du, au: params.au, mode: params.mode }),
    resumeVentesDuJour(jour),
  ]);

  // Les lignes, pour dire en un coup d'œil ce qui a été vendu.
  const ids = ventes.map((v) => v.id);
  const { data: lignes } = ids.length
    ? await supabaseAdmin.from("ventes_lignes").select("vente_id, libelle, quantite").in("vente_id", ids)
    : { data: [] };

  const resume_lignes = new Map<string, string>();
  for (const l of (lignes ?? []) as { vente_id: string; libelle: string; quantite: number | string }[]) {
    const actuel = resume_lignes.get(l.vente_id);
    const texte = `${Math.abs(Number(l.quantite))} × ${l.libelle}`;
    resume_lignes.set(l.vente_id, actuel ? `${actuel}, ${texte}` : texte);
  }

  // Les vendeurs, pour la colonne « qui ».
  const vendeurs = [...new Set(ventes.map((v) => v.vendu_par).filter(Boolean))] as string[];
  const { data: profils } = vendeurs.length
    ? await supabaseAdmin.from("profiles").select("id, prenom, nom").in("id", vendeurs)
    : { data: [] };
  const nomVendeur = new Map(
    (profils ?? []).map((p) => [p.id as string, `${p.prenom ?? ""} ${p.nom ?? ""}`.trim()])
  );

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">
        <EnTete
          titre="🧾 Ventes de la boutique"
          sousTitre="Retrouvez une vente pour la réimprimer ou passer un retour."
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href="/boutique/caisse" variante="principal">💳 Caisse</Bouton>
              <Bouton href="/boutique" variante="secondaire">← Boutique</Bouton>
            </div>
          }
        />

        <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <Tuile
            titre="Ventes du jour"
            valeur={`${resume.nombre} — ${chf(resume.total)}`}
            couleur={marine}
          />
          <Tuile titre="Espèces du jour" valeur={chf(resume.especes)} couleur={marine} />
          <Tuile titre="Portées sur facture" valeur={chf(resume.surFacture)} couleur={marine} />
        </div>

        <FiltresVentes />

        {ventes.length === 0 ? (
          <Carte>
            <EtatVide
              icone="🧾"
              titre="Aucune vente"
              message="Aucune vente ne correspond à cette recherche."
            />
          </Carte>
        ) : (
          <Carte>
            <div style={{ display: "grid", gap: 2 }}>
              {ventes.map((v) => {
                const estRetour = !!v.vente_origine_id;
                const montant = Number(v.montant_total);
                const heure = new Date(v.date_vente).toLocaleTimeString("fr-CH", {
                  hour: "2-digit", minute: "2-digit",
                });
                return (
                  <Link
                    key={v.id}
                    href={`/boutique/ventes/${v.id}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "12px 4px",
                      borderTop: bordure, textDecoration: "none", minHeight: 56,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", color: marine, fontSize: 15, fontWeight: 700 }}>
                        {estRetour ? "↩ " : ""}{v.numero}
                        {v.statut === "annulee" && (
                          <span style={{ color: "#A8453A", fontWeight: 600, fontSize: 13 }}> · annulée</span>
                        )}
                      </span>
                      <span style={{ display: "block", color: sousTexte, fontSize: 13, overflowWrap: "anywhere" }}>
                        {formatDateFR(v.date_vente)} à {heure} · {resume_lignes.get(v.id) ?? "—"}
                      </span>
                      <span style={{ display: "block", color: sousTexte, fontSize: 12 }}>
                        {libelleModeVente(v.mode_reglement)}
                        {v.vendu_par && nomVendeur.get(v.vendu_par) ? ` · ${nomVendeur.get(v.vendu_par)}` : ""}
                      </span>
                    </span>
                    <span style={{
                      color: montant < 0 ? "#A8453A" : marine, fontSize: 17, fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}>
                      {chf(montant)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </Carte>
        )}
      </div>
    </main>
  );
}
