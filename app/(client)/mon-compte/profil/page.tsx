import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { createClient } from "@/src/utils/supabase/server";
import { modifierProfil } from "./actions";
import Link from "next/link";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";

export default async function MonProfilPage() {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  if (!client) return <div style={{ padding: 24 }}>Profil introuvable</div>;

  const actionModifier = modifierProfil.bind(null, client.id);

  const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600, color: "#1B2B5E", marginBottom: 6, fontSize: 14 };
  const champStyle: React.CSSProperties = { width: "100%", border: "1px solid rgba(27,43,94,0.2)", borderRadius: 12, padding: "10px 12px", fontSize: 15, color: "#1B2B5E", backgroundColor: "#FFFFFF", boxSizing: "border-box" };
  const champDisabled: React.CSSProperties = { ...champStyle, backgroundColor: "#EDE8DF", color: "rgba(27,43,94,0.5)" };
  const titreSection: React.CSSProperties = { fontFamily: "Georgia, 'Times New Roman', serif", color: "#1B2B5E", fontSize: 18, fontWeight: 700, margin: "0 0 16px" };
  const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };
  const muted: React.CSSProperties = { color: "rgba(27,43,94,0.5)", fontSize: 12.5, margin: "6px 0 0" };

  return (
    <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        <div style={{ marginBottom: 16 }}>
          <Link href="/mon-compte" style={{ color: "#1F6E5B", textDecoration: "none", fontWeight: 600, fontSize: 14 }}>← Mon compte</Link>
        </div>

        <EnTete titre="👤 Mon profil" sousTitre="Tes coordonnées et ton contact d'urgence." />

        <form action={actionModifier}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Coordonnées */}
            <Carte>
              <h2 style={titreSection}>Coordonnées</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={grid2}>
                  <div>
                    <label style={labelStyle}>Prénom</label>
                    <input name="prenom" defaultValue={client.prenom || ""} style={champStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Nom</label>
                    <input name="nom" defaultValue={client.nom || ""} style={champStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input type="email" defaultValue={client.email || ""} disabled style={champDisabled} />
                  <p style={muted}>L'email ne peut pas être modifié.</p>
                </div>
                <div>
                  <label style={labelStyle}>Téléphone</label>
                  <input name="telephone" type="text" defaultValue={client.telephone || ""} style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Adresse</label>
                  <textarea name="adresse" rows={3} defaultValue={client.adresse || ""} style={champStyle} />
                </div>
              </div>
            </Carte>

            {/* Contact d'urgence */}
            <Carte>
              <h2 style={titreSection}>🚨 Contact d'urgence</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={grid2}>
                  <div>
                    <label style={labelStyle}>Prénom</label>
                    <input name="contact_urgence_prenom" type="text" defaultValue={client.contact_urgence_prenom || ""} placeholder="Prénom" style={champStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Nom</label>
                    <input name="contact_urgence_nom" type="text" defaultValue={client.contact_urgence_nom || ""} placeholder="Nom" style={champStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Téléphone</label>
                  <input name="contact_urgence_telephone" type="text" defaultValue={client.contact_urgence_telephone || ""} placeholder="+41 XX XXX XX XX" style={champStyle} />
                </div>
              </div>
            </Carte>

          </div>

          {/* Actions */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
            <Bouton variante="principal" type="submit">💾 Enregistrer</Bouton>
            <Bouton variante="secondaire" href="/mon-compte">← Retour</Bouton>
          </div>
        </form>

      </div>
    </main>
  );
}
