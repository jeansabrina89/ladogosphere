import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { estMembreActif } from "@/src/lib/membre";
import { TYPES_ABONNEMENT, JOURS_PAR_CARTE, JOURS_PAYES, labelAbonnement, cartesEligibles, type ChienHebergement } from "@/src/lib/abonnementsTypes";
import { getAbonnementsClient } from "@/src/lib/abonnementSolde";
import { formatDateFR } from "@/src/lib/dates";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import BadgeStatut from "@/app/components/ui/BadgeStatut";
import EtatVide from "@/app/components/ui/EtatVide";
import BoutonCommander from "./BoutonCommander";

const MARINE = "#1B2B5E";

export default async function AbonnementsPage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, prenom")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!client) redirect("/mon-compte");

  const estMembre = await estMembreActif(supabaseAdmin, client.id);

  const { data: chiensClient } = await supabaseAdmin
    .from("chiens")
    .select("hebergement_autorise, actif")
    .eq("client_id", client.id);
  const eligibles = cartesEligibles((chiensClient ?? []) as ChienHebergement[]);

  const annee = new Date().getFullYear();
  const { data: tarifsRows } = await supabaseAdmin
    .from("tarifs")
    .select("categorie, prix")
    .eq("annee", annee)
    .eq("membre", true)
    .eq("actif", true);

  const abonnements = await getAbonnementsClient(client.id);

  const muted: React.CSSProperties = { color: "rgba(27,43,94,0.6)", fontSize: 14, margin: 0 };
  const h2: React.CSSProperties = {
    fontFamily: "Georgia, 'Times New Roman', serif",
    color: MARINE,
    fontSize: 18,
    fontWeight: 700,
    margin: "0 0 12px",
  };

  return (
    <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        <div style={{ marginBottom: 16 }}>
          <Link href="/mon-compte" style={{ color: "#1F6E5B", textDecoration: "none", fontWeight: 600, fontSize: 14 }}>
            ← Mon compte
          </Link>
        </div>

        <EnTete
          titre="🎟️ Cartes journées"
          sousTitre="Achetez une carte de 11 journées (10 payées + 1 offerte) et utilisez-les à votre rythme."
        />

        {!estMembre ? (
          <section style={{ marginBottom: 28 }}>
            <Carte>
              <p style={{ fontFamily: "Georgia, serif", fontSize: 17, fontWeight: 700, color: MARINE, margin: "0 0 8px" }}>
                Réservé aux membres
              </p>
              <p style={muted}>
                Les cartes journées sont disponibles uniquement pour les membres à jour de cotisation.
              </p>
              <div style={{ marginTop: 12 }}>
                <Bouton variante="principal" href="/mon-compte">Devenir membre</Bouton>
              </div>
            </Carte>
          </section>
        ) : eligibles.length === 0 ? (
          <section style={{ marginBottom: 28 }}>
            <Carte>
              <p style={{ fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 700, color: MARINE, margin: "0 0 8px" }}>
                Aucune carte disponible
              </p>
              <p style={muted}>
                Selon le profil de vos chiens, aucune carte n'est disponible pour le moment.
                Complétez le profil (hébergement) de vos chiens ou contactez l'équipe.
              </p>
            </Carte>
          </section>
        ) : (
          <section style={{ marginBottom: 28 }}>
            <h2 style={h2}>Choisir une formule</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {TYPES_ABONNEMENT.filter((type) => eligibles.includes(type.categorie)).map((type) => {
                const tarifRow = (tarifsRows ?? []).find((t) => t.categorie === type.categorie);
                if (!tarifRow) return null;
                const prix = JOURS_PAYES * Number(tarifRow.prix);
                return (
                  <Carte key={type.categorie}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <p style={{ fontWeight: 700, color: MARINE, fontSize: 15, margin: "0 0 4px" }}>
                          {type.label}
                        </p>
                        <p style={{ ...muted, fontSize: 13, margin: "0 0 6px" }}>
                          {JOURS_PAR_CARTE} journées ({JOURS_PAYES} payées + 1 offerte)
                        </p>
                        <p style={{ fontWeight: 700, color: MARINE, fontSize: 18, margin: "0 0 10px" }}>
                          CHF {prix.toFixed(2)}
                        </p>
                        <BoutonCommander categorie={type.categorie} />
                      </div>
                    </div>
                  </Carte>
                );
              })}
            </div>
            <p style={{ ...muted, fontSize: 12, marginTop: 10, fontStyle: "italic" }}>
              Les journées sont créditées après confirmation du paiement par l'équipe.
            </p>
          </section>
        )}

        {/* Mes cartes */}
        <section style={{ marginBottom: 28 }}>
          <h2 style={h2}>Mes cartes</h2>
          {abonnements.length === 0 ? (
            <Carte>
              <EtatVide
                icone="🎟️"
                titre="Aucune carte"
                message="Vous n'avez pas encore de carte journées."
              />
            </Carte>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {abonnements.map((abo) => (
                <Carte key={abo.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 700, color: MARINE, fontSize: 15, margin: "0 0 4px" }}>
                        {labelAbonnement(abo.categorie)}
                      </p>
                      <p style={{ ...muted, fontSize: 13, margin: "0 0 4px" }}>
                        {abo.jours_restants} / {abo.jours_total} journées restantes
                      </p>
                      {abo.date_expiration && (
                        <p style={{ ...muted, fontSize: 12, margin: "0 0 6px" }}>
                          Expire le {formatDateFR(abo.date_expiration)}
                        </p>
                      )}
                      {abo.statut === "en_attente_paiement" && (
                        <div style={{
                          color: "#6E5410",
                          fontSize: 13,
                          fontWeight: 600,
                          backgroundColor: "#F4EAC9",
                          borderRadius: 8,
                          padding: "6px 10px",
                          marginTop: 6,
                        }}>
                          En attente de paiement — réglez par TWINT/virement, l'équipe validera.
                        </div>
                      )}
                    </div>
                    <BadgeStatut statut={abo.statut} />
                  </div>
                </Carte>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
