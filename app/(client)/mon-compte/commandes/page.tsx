import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { commandesDuClient } from "@/src/lib/venteEnLigne";
import {
  libelleStatutLigne,
  libelleModeRemise,
  libelleModePaiement,
  formatAdresse,
} from "@/src/lib/venteEnLigneLogique";
import { formatDateFR } from "@/src/lib/dates";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const VERT = "#1F6E5B";
const BORDURE = "1px solid rgba(27,43,94,0.12)";

const chf = (n: number) => `${Number(n).toFixed(2)} CHF`;

const COULEUR_STATUT: Record<string, string> = {
  confirmee: "#8A5A1F",
  en_preparation: "#8A5A1F",
  prete: VERT,
  remise: VERT,
  expediee: VERT,
  annulee: "#8A1F1F",
};

/** Mes commandes : où elles en sont, ce qu'elles contiennent, leur facture. */
export default async function MesCommandesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?suite=/mon-compte/commandes");

  const { data: fiche } = await supabase
    .from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
  if (!fiche) redirect("/mon-compte/completer-profil");

  const commandes = await commandesDuClient(fiche.id as string);

  const factureIds = commandes.map((c) => c.facture_id).filter((id): id is string => !!id);
  const { data: factures } = factureIds.length
    ? await supabaseAdmin.from("factures").select("id, numero").in("id", factureIds)
    : { data: [] };
  const parFacture = new Map(
    ((factures ?? []) as unknown as { id: string; numero: string | null }[]).map((f) => [f.id, f.numero])
  );

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">
        <EnTete
          titre="📦 Mes commandes"
          sousTitre="Où en est chacune, et ce qu'elle contient."
          action={<Bouton href="/mon-compte/boutique" variante="secondaire">← Boutique</Bouton>}
        />

        {commandes.length === 0 ? (
          <Carte>
            <EtatVide
              icone="📦"
              titre="Aucune commande"
              message="Vos commandes apparaîtront ici dès la première."
            />
          </Carte>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {commandes.map((c) => (
              <Carte key={c.id}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                  <span style={{ flex: "1 1 160px", color: MARINE, fontSize: 18, fontWeight: 700 }}>
                    {c.numero ?? "Commande"}
                  </span>
                  <span style={{
                    color: COULEUR_STATUT[c.statut] ?? SOUS, fontSize: 15, fontWeight: 700,
                  }}>
                    {libelleStatutLigne(c.statut, true)}
                  </span>
                </div>

                <p style={{ color: SOUS, fontSize: 14, margin: "2px 0 12px" }}>
                  {c.confirmee_le ? formatDateFR(c.confirmee_le.slice(0, 10)) : ""} ·{" "}
                  {libelleModeRemise(c.mode_remise)} · {libelleModePaiement(c.mode_paiement)}
                </p>

                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {c.lignes.map((l) => (
                    <li key={l.id} style={{
                      borderTop: BORDURE, padding: "8px 0",
                      display: "flex", gap: 10, justifyContent: "space-between",
                    }}>
                      <span style={{ color: MARINE, fontSize: 15, overflowWrap: "anywhere" }}>
                        {Number(l.quantite)} × {l.libelle}
                      </span>
                      <span style={{ color: MARINE, fontSize: 15, fontWeight: 600, whiteSpace: "nowrap" }}>
                        {chf(Number(l.montant))}
                      </span>
                    </li>
                  ))}
                </ul>

                <div style={{ borderTop: BORDURE, paddingTop: 10, marginTop: 4, display: "grid", gap: 4 }}>
                  {Number(c.remise_membre) > 0 && (
                    <p style={{ color: VERT, fontSize: 14, margin: 0, display: "flex", justifyContent: "space-between" }}>
                      <span>Remise membre</span><span>−{chf(Number(c.remise_membre))}</span>
                    </p>
                  )}
                  {Number(c.frais_port) > 0 && (
                    <p style={{ color: SOUS, fontSize: 14, margin: 0, display: "flex", justifyContent: "space-between" }}>
                      <span>Frais de port</span><span>{chf(Number(c.frais_port))}</span>
                    </p>
                  )}
                  <p style={{
                    color: MARINE, fontSize: 17, fontWeight: 700, margin: 0,
                    display: "flex", justifyContent: "space-between",
                  }}>
                    <span>Prix TTC</span><span>{chf(Number(c.montant_total))}</span>
                  </p>
                </div>

                {c.mode_remise === "postal" && c.adresse_livraison && (
                  <p style={{ color: SOUS, fontSize: 14, margin: "10px 0 0", whiteSpace: "pre-line" }}>
                    📮 {formatAdresse(c.adresse_livraison)}
                  </p>
                )}

                {c.numero_suivi && (
                  <p style={{ color: MARINE, fontSize: 15, margin: "10px 0 0", fontWeight: 600 }}>
                    📦 Numéro de suivi : {c.numero_suivi}
                  </p>
                )}

                {c.facture_id && parFacture.get(c.facture_id) && (
                  <p style={{ margin: "10px 0 0" }}>
                    <Link href="/mon-compte/factures" style={{ color: VERT, fontSize: 15, fontWeight: 600 }}>
                      🧾 Facture {parFacture.get(c.facture_id)}
                    </Link>
                  </p>
                )}

                {c.statut === "annulee" && c.motif_annulation && (
                  <p style={{ color: "#8A1F1F", fontSize: 14, margin: "10px 0 0" }}>
                    Annulée : {c.motif_annulation}
                  </p>
                )}
              </Carte>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
