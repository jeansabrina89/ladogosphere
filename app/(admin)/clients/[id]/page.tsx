import Link from "next/link";
import { exigerPersonnelPage } from "@/src/lib/exigerPersonnelPage";
import { formatDateFR } from "@/src/lib/dates";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { getMouvementsAvoir, calculerSoldeAvoir } from "@/src/lib/avoirs";
import BoutonArchiverClient from "./BoutonArchiverClient";
import BoutonSupprimerClient from "./BoutonSupprimerClient";
import BoutonCotisation from "./BoutonCotisation";
import BoutonConfirmerCotisation from "./BoutonConfirmerCotisation";
import GestionAvoir from "./GestionAvoir";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import SelectionFactureGroupee from "../../reservations/SelectionFactureGroupee";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import BadgeStatut from "@/app/components/ui/BadgeStatut";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigerPersonnelPage();
  const perms = await getProfilePerms();
  const supabase = supabaseAdmin;

  const { data: client } = await supabase
    .from("clients")
    .select(`*, chiens (id, nom, race, poids, categorie_poids, sexe, sterilisation)`)
    .eq("id", id)
    .single();

  if (!client) {
    return (
      <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
        <div className="max-w-4xl mx-auto">
          <Carte><EtatVide icone="👤" titre="Client introuvable" /></Carte>
        </div>
      </main>
    );
  }

  const anneeActuelle = new Date().getFullYear();

  const { data: cotisations } = await supabase
    .from("cotisations_membres")
    .select("*")
    .eq("client_id", id)
    .order("annee", { ascending: false });

  const { data: parametre } = await supabase
    .from("parametres")
    .select("valeur")
    .eq("cle", "cotisation_montant")
    .single();

  const montantCotisation = parseFloat(parametre?.valeur ?? "180");
  const cotisationAnneeActuelle = cotisations?.find((c) => c.annee === anneeActuelle);

  const mouvementsAvoir = await getMouvementsAvoir(supabaseAdmin, id);
  const soldeAvoir = calculerSoldeAvoir(mouvementsAvoir);

  const { data: reservations } = await supabase
    .from("reservations")
    .select(`
      id, numero, client_id, date_debut, date_fin, type_reservation,
      statut, statut_paiement, montant_final, montant_calcule, ajustement_manuel, montant_paye,
      clients (prenom, nom, membre),
      boxes (numero, nom),
      reservation_chiens (chiens (id, nom, race, categorie_poids))
    `)
    .eq("client_id", id)
    .order("date_debut", { ascending: false });

  const { data: facturesClient } = await supabase
    .from("factures")
    .select("id, numero, date_facture, montant_total, statut")
    .eq("client_id", id)
    .order("date_facture", { ascending: false });

  const muted: React.CSSProperties = { color: "rgba(27,43,94,0.6)", fontSize: 14, margin: 0 };
  const h2: React.CSSProperties = { fontFamily: "Georgia, serif", color: "#1B2B5E", fontSize: 18, fontWeight: 700, margin: "0 0 12px" };
  const pill = (bg: string, color: string): React.CSSProperties => ({
    display: "inline-block", backgroundColor: bg, color, borderRadius: 999,
    padding: "2px 10px", fontSize: 13, fontWeight: 500, lineHeight: "20px", whiteSpace: "nowrap",
  });

  const ligne = (label: string, valeur: React.ReactNode) => (
    <div style={{ display: "flex", gap: 10, fontSize: 15 }}>
      <span style={{ color: "rgba(27,43,94,0.6)", minWidth: 120, flexShrink: 0 }}>{label}</span>
      <span style={{ color: "#1B2B5E", fontWeight: 600 }}>{valeur}</span>
    </div>
  );

  const categorieLabel = (c: string | null) =>
    c === "moins_15kg" ? "🟢 Petit" : c === "15_30kg" ? "🟡 Moyen" : c === "30_40kg" ? "🔴 Grand" : "—";

  const factureBadge = (s: string) => {
    if (s === "acquittee") return <span style={pill("#F4EAC9", "#6E5410")}>Réglée</span>;
    if (s === "annulee") return <span style={pill("#EDE8DF", "rgba(27,43,94,0.6)")}>Annulée</span>;
    return <span style={pill("#E4E7F1", "#2A3B6B")}>Envoyée</span>;
  };

  return (
    <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">

        {client.actif === false && (
          <div style={{ backgroundColor: "#F4EAC9", color: "#6E5410", borderRadius: 12, padding: "10px 14px", fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
            🗄️ Ce client est archivé
          </div>
        )}

        <EnTete
          titre={`👤 ${client.prenom} ${client.nom}`}
          action={
            client.membre
              ? <span style={pill("#F4EAC9", "#6E5410")}>⭐ Membre</span>
              : <span style={pill("#EDE8DF", "rgba(27,43,94,0.6)")}>Standard</span>
          }
        />

        {/* 1. Coordonnées */}
        <section style={{ marginBottom: 28 }}>
          <h2 style={h2}>Coordonnées</h2>
          <Carte>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ligne("Email", client.email)}
              {ligne("Téléphone", client.telephone || "—")}
              {ligne("Adresse", client.adresse || "—")}
              {ligne("Client depuis", formatDateFR(new Date(client.created_at)))}
            </div>
          </Carte>
        </section>

        {/* 2. Adhésion membre */}
        <section style={{ marginBottom: 28 }}>
          <h2 style={h2}>⭐ Adhésion membre</h2>
          <Carte>
            {client.membre && !cotisationAnneeActuelle && (
              <div style={{ backgroundColor: "#F4EAC9", color: "#6E5410", borderRadius: 12, padding: "10px 14px", fontWeight: 600, fontSize: 14, marginBottom: 12 }}>
                ⚠️ Aucune adhésion enregistrée pour {anneeActuelle} — renouvellement requis.
              </div>
            )}

            {perms.perm_encaissements && (
              <BoutonCotisation
                client_id={client.id}
                client_nom={`${client.prenom} ${client.nom}`}
                est_membre={client.membre}
                cotisation_existante={!!cotisationAnneeActuelle}
                montant={montantCotisation}
                annee={anneeActuelle}
                est_exempte={client.cotisation_exemptee}
                raison_exemption={client.cotisation_exemptee_raison}
              />
            )}

            {cotisations && cotisations.length > 0 && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ ...muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 12 }}>Historique</p>
                {cotisations.map((c: any) => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, border: "1px solid rgba(27,43,94,0.12)", borderRadius: 12, padding: "10px 14px" }}>
                    <div>
                      <p style={{ color: "#1B2B5E", fontWeight: 600, fontSize: 14, margin: 0 }}>Adhésion {c.annee}</p>
                      <p style={{ ...muted, fontSize: 12, marginTop: 2 }}>
                        {c.mode_paiement === "cash" ? "💵 Cash" :
                         c.mode_paiement === "virement" ? "🏦 Virement IBAN" :
                         c.mode_paiement === "prochaine_resa" ? "📅 Prochaine réservation" : "—"}
                        {c.date_paiement && ` — ${formatDateFR(c.date_paiement)}`}
                      </p>
                    </div>
                    <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <p style={{ color: "#1B2B5E", fontWeight: 700, fontSize: 14, margin: 0 }}>CHF {Number(c.montant).toFixed(2)}</p>
                      <BadgeStatut statut={c.statut} />
                      <BoutonConfirmerCotisation cotisation_id={c.id} statut={c.statut} perm_encaissements={perms.perm_encaissements} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Carte>
        </section>

        {/* 3. Contact d'urgence */}
        <section style={{ marginBottom: 28 }}>
          <h2 style={h2}>🚨 Contact d'urgence</h2>
          {!client.contact_urgence_nom && !client.contact_urgence_prenom && !client.contact_urgence_telephone ? (
            <Carte><p style={muted}>Aucun contact d'urgence renseigné.</p></Carte>
          ) : (
            <Carte accent="rose">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ligne("Nom", `${client.contact_urgence_prenom || ""} ${client.contact_urgence_nom || "—"}`)}
                {ligne("Téléphone", client.contact_urgence_telephone
                  ? <a href={`tel:${client.contact_urgence_telephone}`} style={{ color: "#1F6E5B", fontWeight: 700 }}>{client.contact_urgence_telephone}</a>
                  : "—")}
              </div>
            </Carte>
          )}
        </section>

        {/* 4. Chiens */}
        <section style={{ marginBottom: 28 }}>
          <h2 style={h2}>🐶 Chiens ({client.chiens?.length ?? 0})</h2>
          {client.chiens?.length === 0 ? (
            <Carte><EtatVide icone="🐶" titre="Aucun chien enregistré" /></Carte>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {client.chiens?.map((chien: any) => (
                <Link key={chien.id} href={`/chiens/${chien.id}`} style={{ textDecoration: "none" }}>
                  <Carte>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div>
                        <p style={{ color: "#1B2B5E", fontWeight: 700, margin: 0 }}>{chien.nom}</p>
                        <p style={muted}>{chien.race || "—"}</p>
                      </div>
                      <div style={{ textAlign: "right", fontSize: 14, color: "#1B2B5E" }}>
                        <p style={{ margin: 0 }}>{chien.poids ? `${chien.poids} kg` : "—"}</p>
                        <p style={{ margin: "2px 0 0" }}>{categorieLabel(chien.categorie_poids)}</p>
                        <p style={{ margin: "2px 0 0" }}>{chien.sexe === "M" ? "♂️" : "♀️"} {
                          chien.sterilisation === "oui" ? "stérilisé(e)" :
                          chien.sterilisation === "chimique" ? "castré chimiquement" : "entier(e)"
                        }</p>
                      </div>
                    </div>
                  </Carte>
                </Link>
              ))}
            </div>
          )}
          {perms.perm_chiens_creer && (
            <div style={{ marginTop: 12 }}>
              <Bouton variante="discret" href="/chiens/nouveau">➕ Ajouter un chien à ce client</Bouton>
            </div>
          )}
        </section>

        {/* 5. Avoir client — composant inchangé */}
        {(perms.isAdmin || perms.perm_encaissements) && (
          <section style={{ marginBottom: 28 }}>
            <GestionAvoir client_id={client.id} solde={soldeAvoir} mouvements={mouvementsAvoir} />
          </section>
        )}

        {/* 6. Factures */}
        <section style={{ marginBottom: 28 }}>
          <h2 style={h2}>📋 Factures</h2>
          {!facturesClient || facturesClient.length === 0 ? (
            <Carte><EtatVide icone="📋" titre="Aucune facture" message="Ce client n'a pas encore de facture." /></Carte>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {facturesClient.map((f: any) => (
                <Link key={f.id} href={`/factures/${f.id}`} style={{ textDecoration: "none" }}>
                  <Carte>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      <div>
                        <p style={{ color: "#1B2B5E", fontWeight: 700, fontSize: 14, margin: 0 }}>{f.numero}</p>
                        <p style={{ ...muted, fontSize: 12, marginTop: 2 }}>{f.date_facture ? formatDateFR(f.date_facture) : "—"}</p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <p style={{ color: "#1B2B5E", fontWeight: 700, fontSize: 14, margin: 0 }}>CHF {Number(f.montant_total).toFixed(2)}</p>
                        {factureBadge(f.statut)}
                      </div>
                    </div>
                  </Carte>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 7. Réservations — composant inchangé */}
        <section style={{ marginBottom: 28 }}>
          <h2 style={h2}>📅 Réservations</h2>
          <SelectionFactureGroupee reservations={reservations ?? []} permEncaissements={perms.perm_encaissements} />
        </section>

        {/* Boutons */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {perms.perm_clients_modifier && (
            <Bouton variante="principal" href={`/clients/${client.id}/modifier`}>✏️ Modifier le client</Bouton>
          )}
          {perms.isAdmin && <BoutonArchiverClient id={client.id} actif={client.actif} />}
          {perms.isAdmin && <BoutonSupprimerClient id={client.id} nom={`${client.prenom} ${client.nom}`} />}
          <Bouton variante="secondaire" href="/clients">← Retour à la liste</Bouton>
        </div>

      </div>
    </main>
  );
}
