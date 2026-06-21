import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { createClient } from "@/src/utils/supabase/server";
import Link from "next/link";
import { formatDateFR, aujourdhuiISO } from "@/src/lib/dates";
import { getSoldeAvoir } from "@/src/lib/avoirs";
import { montantDuReservation, resteAPayer } from "@/src/lib/montants";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { estMembreActif } from "@/src/lib/membre";
import BoutonDemanderAdhesion from "./BoutonDemanderAdhesion";
import BadgeMembre from "@/app/components/BadgeMembre";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import Carte from "@/app/components/ui/Carte";
import BadgeStatut from "@/app/components/ui/BadgeStatut";
import EtatVide from "@/app/components/ui/EtatVide";

export default async function MonComptePage() {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  // Ownership via auth_user_id — jamais de client_id venant de l'URL
  const { data: client } = await supabase
    .from("clients")
    .select(`*, chiens (id, nom)`)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const aujourd_hui = aujourdhuiISO();

  const { data: reservations } = client
    ? await supabase
        .from("reservations")
        .select(`*, reservation_chiens (chiens (nom))`)
        .eq("client_id", client.id)
        .order("date_debut", { ascending: true })
    : { data: [] };

  const resAVenir = (reservations ?? []).filter(
    (r: any) =>
      (r.statut === "validee" || r.statut === "en_attente") &&
      r.date_debut >= aujourd_hui
  );
  const prochaine = resAVenir[0] ?? null;

  // Logique identique à l'ancien bloc "impayées" (statut payable + reste > 0)
  const resImpayees = (reservations ?? []).filter((r: any) => {
    const estPayable = r.statut === "validee" || r.statut === "terminee";
    const nonRegle =
      !r.statut_paiement ||
      r.statut_paiement === "impaye" ||
      r.statut_paiement === "partiel";
    return estPayable && nonRegle && resteAPayer(r) > 0;
  });
  const totalARegler = resImpayees.reduce((sum: number, r: any) => sum + resteAPayer(r), 0);

  const nbChiens = client?.chiens?.length ?? 0;
  const soldeAvoir = client ? await getSoldeAvoir(supabase, client.id) : 0;

  const anneeAdhesion = new Date().getFullYear();
  const estMembre = client ? await estMembreActif(supabaseAdmin, client.id) : false;
  const { data: cotisationAnnee } = client
    ? await supabaseAdmin
        .from("cotisations_membres")
        .select("statut")
        .eq("client_id", client.id)
        .eq("annee", anneeAdhesion)
        .maybeSingle()
    : { data: null };
  const aDemandeEnAttente = cotisationAnnee?.statut === "en_attente";
  const peutDemander = !!client && !estMembre && !cotisationAnnee;
  const { data: paramCotis } = await supabaseAdmin
    .from("parametres")
    .select("valeur")
    .eq("cle", "cotisation_montant")
    .maybeSingle();
  const montantCotisation = parseFloat(paramCotis?.valeur ?? "180") || 180;

  const raccourcis = [
    { href: "/mon-compte/chiens",      label: "Mes chiens" },
    { href: "/mon-compte/reservations", label: "Mes réservations" },
    { href: "/mon-compte/profil",       label: "Mon profil" },
  ];

  const statCardStyle = (bg: string): React.CSSProperties => ({
    backgroundColor: bg,
    borderRadius: "16px",
    padding: "20px 16px",
    textAlign: "center",
    textDecoration: "none",
    display: "block",
  });

  return (
    <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>

        {/* En-tête */}
        <EnTete
          titre={client?.prenom ? `Bonjour ${client.prenom}` : "Bonjour"}
          sousTitre="Voici un aperçu de ton compte"
          action={
            <Bouton variante="principal" href="/mon-compte/reservations/nouvelle">
              Réserver une place
            </Bouton>
          }
        />

        {!aDemandeEnAttente && (
          <div style={{ marginBottom: 24 }}>
            <BadgeMembre membre={!!client?.membre} aJour={estMembre} montrerStandard />
          </div>
        )}

        {/* Mini-stats — 3 cartes fixes + 4e conditionnelle */}
        <div
          className={totalARegler > 0
            ? "grid grid-cols-2 lg:grid-cols-4 gap-3"
            : "grid grid-cols-1 sm:grid-cols-3 gap-3"}
          style={{ marginBottom: "32px" }}
        >
          {/* Chiens */}
          <div style={statCardStyle("#DBEFEA")}>
            <p style={{ fontSize: "24px", fontWeight: 500, color: "#1F6E5B", margin: 0, lineHeight: 1 }}>
              {nbChiens}
            </p>
            <p style={{ fontSize: "13px", color: "rgba(31,110,91,0.7)", marginTop: "6px", marginBottom: 0 }}>
              {nbChiens === 1 ? "Chien" : "Chiens"}
            </p>
          </div>

          {/* À venir */}
          <div style={statCardStyle("#E4E7F1")}>
            <p style={{ fontSize: "24px", fontWeight: 500, color: "#2A3B6B", margin: 0, lineHeight: 1 }}>
              {resAVenir.length}
            </p>
            <p style={{ fontSize: "13px", color: "rgba(42,59,107,0.7)", marginTop: "6px", marginBottom: 0 }}>
              À venir
            </p>
          </div>

          {/* Avoir */}
          <div style={statCardStyle("#FBE2DE")}>
            <p style={{ fontSize: "24px", fontWeight: 500, color: "#A8453A", margin: 0, lineHeight: 1 }}>
              {soldeAvoir.toFixed(2)}
            </p>
            <p style={{ fontSize: "13px", color: "rgba(168,69,58,0.7)", marginTop: "6px", marginBottom: 0 }}>
              Avoir CHF
            </p>
          </div>

          {/* À régler — visible uniquement si montant dû > 0 */}
          {totalARegler > 0 && (
            <Link href="/mon-compte/reservations" style={statCardStyle("#F4EAC9")}>
              <p style={{ fontSize: "24px", fontWeight: 500, color: "#6E5410", margin: 0, lineHeight: 1 }}>
                {totalARegler.toFixed(2)}
              </p>
              <p style={{ fontSize: "13px", color: "rgba(110,84,16,0.7)", marginTop: "6px", marginBottom: 0 }}>
                À régler CHF
              </p>
            </Link>
          )}
        </div>

        {peutDemander && (
          <div style={{ marginBottom: "32px" }}>
            <Carte>
              <p style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 18, fontWeight: 700, color: "#1B2B5E", margin: "0 0 4px" }}>★ Devenir membre</p>
              <p style={{ fontSize: 13, color: "rgba(27,43,94,0.6)", margin: "0 0 4px" }}>
                La cotisation annuelle de {montantCotisation} CHF te donne accès aux tarifs membres sur toutes tes réservations.
              </p>
              <BoutonDemanderAdhesion montant={montantCotisation} />
            </Carte>
          </div>
        )}

        {aDemandeEnAttente && (
          <div style={{ marginBottom: "32px" }}>
            <div style={{ backgroundColor: "#F4EAC9", border: "1px solid #C9A84C", borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>⏳</span>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#6E5410" }}>
                Ta demande d'adhésion est en cours de traitement par notre équipe.
              </p>
            </div>
          </div>
        )}

        {/* Prochaine réservation */}
        <h2 style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          color: "#1B2B5E",
          fontSize: "18px",
          fontWeight: 700,
          margin: "0 0 12px",
        }}>
          Prochaine réservation
        </h2>

        {prochaine ? (
          <div style={{ marginBottom: "32px" }}>
            <Carte accent="rose">
              {(() => {
                const chiens = (prochaine as any).reservation_chiens
                  ?.map((rc: any) => rc.chiens?.nom)
                  .filter(Boolean)
                  .join(", ") ?? "—";
                const montant = montantDuReservation(prochaine as any);
                const memeJour = (prochaine as any).date_debut === (prochaine as any).date_fin;
                return (
                  <>
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: "12px",
                    }}>
                      <div>
                        <p style={{ fontWeight: 700, color: "#1B2B5E", fontSize: "16px", margin: "0 0 6px" }}>
                          {chiens}
                        </p>
                        <p style={{ color: "rgba(27,43,94,0.65)", fontSize: "14px", margin: "0 0 10px" }}>
                          {formatDateFR((prochaine as any).date_debut)}
                          {!memeJour && ` → ${formatDateFR((prochaine as any).date_fin)}`}
                        </p>
                        <BadgeStatut statut={(prochaine as any).statut} />
                      </div>

                      {montant > 0 && (
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <p style={{ fontWeight: 700, color: "#1B2B5E", fontSize: "18px", margin: "0 0 4px" }}>
                            {montant.toFixed(2)} CHF
                          </p>
                          {(prochaine as any).statut_paiement &&
                            (prochaine as any).statut_paiement !== "paye" && (
                              <BadgeStatut statut={(prochaine as any).statut_paiement} />
                            )}
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: "right", marginTop: "16px" }}>
                      <Link
                        href={`/mon-compte/reservations/${(prochaine as any).id}`}
                        style={{ color: "#2E8B7E", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}
                      >
                        Voir le détail ›
                      </Link>
                    </div>
                  </>
                );
              })()}
            </Carte>
          </div>
        ) : (
          <div style={{ marginBottom: "32px" }}>
            <Carte>
              <EtatVide
                icone="📅"
                titre="Aucune réservation à venir"
                message="Réserve une place pour ton chien, on s'occupe du reste."
                action={
                  <Bouton variante="principal" href="/mon-compte/reservations/nouvelle">
                    Réserver une place
                  </Bouton>
                }
              />
            </Carte>
          </div>
        )}

        {/* Raccourcis */}
        <h2 style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          color: "#1B2B5E",
          fontSize: "18px",
          fontWeight: 700,
          margin: "0 0 12px",
        }}>
          Mon espace
        </h2>

        <Carte>
          {raccourcis.map(({ href, label }, i) => (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 0",
                color: "#1B2B5E",
                textDecoration: "none",
                fontSize: "15px",
                fontWeight: 500,
                borderBottom:
                  i < raccourcis.length - 1
                    ? "1px solid rgba(27,43,94,0.08)"
                    : "none",
              }}
            >
              <span>{label}</span>
              <span style={{ color: "rgba(27,43,94,0.35)", fontSize: "20px", lineHeight: 1 }}>›</span>
            </Link>
          ))}
        </Carte>

      </div>
    </main>
  );
}
