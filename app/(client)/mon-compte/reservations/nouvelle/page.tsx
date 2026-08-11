import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import TunnelReservation from "./TunnelReservation";
import { etatAdhesionReservation } from "@/src/lib/membre";

export default async function NouvelleDemandeReservationPage() {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  const { data: client } = await supabase
    .from("clients")
    .select("id, prenom, cotisation_exemptee, chiens (id, nom, race, poids, categorie_poids, journee_essai_effectuee, journee_essai_invalide)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!client) {
    return (
      <main style={{ minHeight: "100vh", backgroundColor: "#F5F0E8", padding: "32px 16px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", backgroundColor: "#fff", borderRadius: 18, padding: 32, border: "1px solid rgba(27,43,94,0.12)", textAlign: "center" }}>
          <EtatVide
            icone="🐾"
            titre="Profil en cours de création"
            message="Votre profil est en cours de création par notre équipe. Vous pourrez faire votre demande dès qu'il sera activé."
            action={<Bouton variante="secondaire" href="/mon-compte">← Retour</Bouton>}
          />
          <p style={{ fontSize: 13, color: "rgba(27,43,94,0.4)", marginTop: 8 }}>
            ladogosphere@gmail.com
          </p>
        </div>
      </main>
    );
  }

  const chiens = (client.chiens ?? []) as {
    id: string;
    nom: string;
    race: string | null;
    poids: number | null;
    categorie_poids: string | null;
    journee_essai_effectuee: boolean;
    journee_essai_invalide: boolean;
  }[];

  const chiensDisponibles = chiens.filter(
    c => !(c.journee_essai_effectuee && c.journee_essai_invalide)
  );

  if (chiensDisponibles.length === 0) {
    return (
      <main style={{ minHeight: "100vh", backgroundColor: "#F5F0E8", padding: "32px 16px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", backgroundColor: "#fff", borderRadius: 18, padding: 32, border: "1px solid rgba(27,43,94,0.12)" }}>
          <EtatVide
            icone="🐶"
            titre={chiens.length === 0 ? "Aucun chien enregistré" : "Réservation impossible"}
            message={
              chiens.length === 0
                ? "Ajoute d'abord ton chien pour pouvoir réserver une place."
                : "Tous tes chiens n'ont pas été admis à l'issue de leur journée d'essai. Contacte-nous pour plus d'informations."
            }
            action={
              chiens.length === 0
                ? <Bouton variante="principal" href="/mon-compte/chiens/nouveau">Ajouter un chien</Bouton>
                : <Bouton variante="secondaire" href="/mon-compte">← Retour</Bouton>
            }
          />
          {chiens.length > 0 && (
            <p style={{ textAlign: "center", fontSize: 13, color: "rgba(27,43,94,0.4)", marginTop: 8 }}>
              ladogosphere@gmail.com
            </p>
          )}
        </div>
      </main>
    );
  }

  // Tarifs + statut membre — lus via service role : la RLS réserve ces tables
  // au personnel/admin. On ne lit ici que des données de référence (tarifs) et
  // la cotisation de CE client, déjà authentifié via sa session.
  const { data: tarifsRows } = await supabaseAdmin
    .from("tarifs")
    .select("categorie, membre, prix, annee")
    .eq("actif", true);

  const { aJour: estMembreAJour, enAttenteARegler: adhesionEnAttenteARegler } =
    await etatAdhesionReservation(supabaseAdmin, client.id);
  const estExempte = !!(client as { cotisation_exemptee?: boolean }).cotisation_exemptee;

  // Le client a-t-il au moins une journée d'essai TERMINÉE ?
  const { data: essaisTermines } = await supabaseAdmin
    .from("reservations")
    .select("id")
    .eq("client_id", client.id)
    .eq("type_reservation", "essai")
    .eq("statut", "terminee")
    .limit(1);
  const essaiTermine = !!(essaisTermines && essaisTermines.length > 0);

  const { data: paramCotis } = await supabaseAdmin
    .from("parametres")
    .select("valeur")
    .eq("cle", "cotisation_montant")
    .maybeSingle();
  const montantCotisation = parseFloat(paramCotis?.valeur ?? "200") || 200;

  const tarifs = (tarifsRows ?? []).map((t) => ({
    categorie: t.categorie as string,
    membre: t.membre as boolean,
    prix: String(t.prix),
    annee: t.annee as number,
  }));

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#F5F0E8", padding: "32px 16px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <Bouton variante="discret" href="/mon-compte/reservations">
            ← Mes réservations
          </Bouton>
        </div>
        <TunnelReservation
          chiens={chiens}
          tarifs={tarifs}
          estMembreAJour={estMembreAJour}
          estExempte={estExempte}
          essaiTermine={essaiTermine}
          adhesionEnAttenteARegler={adhesionEnAttenteARegler}
          montantCotisation={montantCotisation}
        />
      </div>
    </main>
  );
}
