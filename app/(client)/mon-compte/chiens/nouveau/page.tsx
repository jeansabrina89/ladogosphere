import type { CSSProperties } from "react";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { creerChienClient } from "./actions";
import BoutonEnregistrer from "./BoutonEnregistrer";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";

const MARINE = "#1B2B5E";

const sLabel: CSSProperties = {
  display: "block", fontWeight: 600, fontSize: 13.5, marginBottom: 6, color: MARINE,
};
const sInput: CSSProperties = {
  width: "100%", border: "1px solid rgba(27,43,94,0.2)", borderRadius: 12,
  padding: "12px 14px", fontSize: 15, color: MARINE, backgroundColor: "#fff",
  boxSizing: "border-box", fontFamily: "inherit",
};
const sGrid2: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };
const sChamp: CSSProperties = { marginBottom: 14 };
const sReq: CSSProperties = { color: "#A8453A" };
const sSecTitre: CSSProperties = {
  fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 19, fontWeight: 700, color: MARINE, margin: 0,
};
const sSecSous: CSSProperties = { margin: "2px 0 0", fontSize: 12.5, color: "rgba(27,43,94,0.45)" };
const sSecNum: CSSProperties = {
  width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
  backgroundColor: "#DBEFEA", color: "#1F6E5B",
  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13,
};

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

  const action = creerChienClient.bind(null, client.id);

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

        <form action={action}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* SECTION 1 — IDENTITÉ */}
            <Carte>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={sSecNum}>1</div>
                <div>
                  <p style={sSecTitre}>Identité</p>
                  <p style={sSecSous}>Qui est ton chien ?</p>
                </div>
              </div>

              <div style={sChamp}>
                <label style={sLabel}>Nom <span style={sReq}>*</span></label>
                <input name="nom" type="text" required placeholder="Ex : Rex" style={sInput} />
              </div>

              <div style={sGrid2}>
                <div style={sChamp}>
                  <label style={sLabel}>Race <span style={sReq}>*</span></label>
                  <input name="race" type="text" required placeholder="Ex : Berger" style={sInput} />
                </div>
                <div style={sChamp}>
                  <label style={sLabel}>Couleur <span style={sReq}>*</span></label>
                  <input name="couleur" type="text" required placeholder="Ex : Noir et feu" style={sInput} />
                </div>
              </div>

              <div style={sGrid2}>
                <div style={sChamp}>
                  <label style={sLabel}>Sexe <span style={sReq}>*</span></label>
                  <select name="sexe" required defaultValue="" style={sInput}>
                    <option value="" disabled>Choisir</option>
                    <option value="M">Mâle</option>
                    <option value="F">Femelle</option>
                  </select>
                </div>
                <div style={sChamp}>
                  <label style={sLabel}>Poids (kg) <span style={sReq}>*</span></label>
                  <input name="poids" type="number" step="0.1" min="0" required placeholder="Ex : 24" style={sInput} />
                </div>
              </div>

              <div style={{ ...sGrid2 }}>
                <div style={{ ...sChamp, marginBottom: 0 }}>
                  <label style={sLabel}>Date de naissance</label>
                  <input name="date_naissance" type="date" style={sInput} />
                </div>
                <div style={{ ...sChamp, marginBottom: 0 }}>
                  <label style={sLabel}>Numéro de puce</label>
                  <input name="numero_puce" type="text" placeholder="15 chiffres" style={sInput} />
                </div>
              </div>
            </Carte>

            {/* SECTION 2 — SANTÉ */}
            <Carte>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={sSecNum}>2</div>
                <div>
                  <p style={sSecTitre}>Santé</p>
                  <p style={sSecSous}>Suivi médical et remarques.</p>
                </div>
              </div>

              <div style={sChamp}>
                <label style={sLabel}>Stérilisation <span style={sReq}>*</span></label>
                <select name="sterilisation" required defaultValue="" style={sInput}>
                  <option value="" disabled>Choisir</option>
                  <option value="non">Non</option>
                  <option value="oui">Oui</option>
                  <option value="chimique">Castré chimiquement</option>
                </select>
              </div>

              <div style={sChamp}>
                <label style={sLabel}>Allergies</label>
                <textarea name="allergies" rows={2} placeholder="Aliments, médicaments…" style={{ ...sInput, resize: "vertical" }} />
              </div>

              <div style={sChamp}>
                <label style={sLabel}>Traitements en cours</label>
                <textarea name="traitements" rows={2} placeholder="Médication, posologie…" style={{ ...sInput, resize: "vertical" }} />
              </div>

              <div style={{ ...sChamp, marginBottom: 0 }}>
                <label style={sLabel}>Remarques</label>
                <textarea name="remarques" rows={3} placeholder="Tout ce qu'on devrait savoir" style={{ ...sInput, resize: "vertical" }} />
              </div>
            </Carte>

          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 20 }}>
            <BoutonEnregistrer />
            <Bouton variante="secondaire" href="/mon-compte/chiens">← Retour</Bouton>
          </div>

        </form>
      </div>
    </main>
  );
}
