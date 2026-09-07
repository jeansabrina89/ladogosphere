import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import FormNouveauChien from "./FormNouveauChien";

const MARINE = "#1B2B5E";

export default async function NouveauChienClientPage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  const { data: client } = await supabaseServer
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!client) {
    return (
      <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <Carte>
            <EtatVide
              icone="🐾"
              titre="Profil en cours de création"
              message="Ton profil est en cours de validation par notre équipe. Reviens dans quelques instants."
              action={<Bouton variante="secondaire" href="/mon-compte">← Retour</Bouton>}
            />
          </Carte>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>

        <div style={{ marginBottom: 18 }}>
          <a href="/mon-compte/chiens" style={{ color: "#1F6E5B", textDecoration: "none", fontWeight: 600, fontSize: 14 }}>
            ← Mes chiens
          </a>
        </div>

        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 26, fontWeight: 700, color: MARINE, margin: "0 0 4px" }}>
            🐶 Ajouter un chien
          </h1>
          <p style={{ margin: 0, color: "rgba(27,43,94,0.6)", fontSize: 14 }}>
            Quelques infos pour créer la fiche de ton compagnon.
          </p>
        </div>

        <FormNouveauChien clientId={client.id} />
      </div>
    </main>
  );
}
