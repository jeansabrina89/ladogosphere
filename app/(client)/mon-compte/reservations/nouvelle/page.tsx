import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import TunnelReservation from "./TunnelReservation";
import { etatAdhesionReservation } from "@/src/lib/membre";
import { statutEssaiDe } from "@/src/lib/journeeEssai";
import { lireCohabitationChiens } from "@/src/lib/cohabitationDb";

export default async function NouvelleDemandeReservationPage() {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  const { data: client } = await supabase
    .from("clients")
    .select("id, prenom, cotisation_exemptee, interne, chiens (id, nom, race, poids, categorie_poids, statut_essai, client_id, doit_etre_isole, hebergement_autorise, cohabitation_source)")
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
    statut_essai: string | null;
    client_id: string | null;
    doit_etre_isole: boolean | null;
    hebergement_autorise: string | null;
    cohabitation_source: string | null;
  }[];

  // Un chien refusé n'ouvre plus aucune branche de réservation.
  const chiensDisponibles = chiens.filter(c => statutEssaiDe(c) !== "refuse");

  // Ententes « famille uniquement » : elles vivent dans ententes_chiens.
  const cohabitations = await lireCohabitationChiens(chiens.map(c => c.id));
  const familleParChien = new Map(cohabitations.map(c => [c.id as string, !!c.famille_uniquement]));
  const chiensAvecCohabitation = chiens.map(c => ({
    ...c,
    famille_uniquement: familleParChien.get(c.id) ?? false,
  }));

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

  // L'adhésion s'embarque dès qu'au moins un chien du client est validé.
  const auMoinsUnChienValide = chiens.some((c) => statutEssaiDe(c) === "valide");

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
          chiens={chiensAvecCohabitation}
          tarifs={tarifs}
          estMembreAJour={estMembreAJour}
          estExempte={estExempte}
          essaiTermine={auMoinsUnChienValide}
          adhesionEnAttenteARegler={adhesionEnAttenteARegler}
          montantCotisation={montantCotisation}
          estInterne={!!(client as { interne?: boolean }).interne}
        />
      </div>
    </main>
  );
}
