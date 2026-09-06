import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { modifierChienClient } from "./actions";
import Link from "next/link";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import ChoixCohabitationChamp from "@/app/components/ChoixCohabitation";
import { choixCohabitationDe, cohabitationVerrouillee } from "@/src/lib/cohabitation";
import { lireCohabitationChiens } from "@/src/lib/cohabitationDb";

export default async function ModifierChienClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: chien } = await supabase
    .from("chiens")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!chien) {
    return (
      <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <Carte>
            <EtatVide
              icone="🐶"
              titre="Chien introuvable"
              message="Ce chien n'existe pas ou n'est pas rattaché à ton compte."
              action={<Bouton variante="secondaire" href="/mon-compte/chiens">← Mes chiens</Bouton>}
            />
          </Carte>
        </div>
      </main>
    );
  }

  // Mode de cohabitation actuel : colonnes du chien + entente famille_uniquement.
  const [cohabitation] = await lireCohabitationChiens([chien.id]);
  const choixActuel = choixCohabitationDe(cohabitation);
  const verrouille = cohabitationVerrouillee(cohabitation);

  const action = modifierChienClient.bind(null, chien.id);

  const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600, color: "#1B2B5E", marginBottom: 6, fontSize: 14 };
  const champStyle: React.CSSProperties = { width: "100%", border: "1px solid rgba(27,43,94,0.2)", borderRadius: 12, padding: "10px 12px", fontSize: 15, color: "#1B2B5E", backgroundColor: "#FFFFFF", boxSizing: "border-box" };
  const titreSection: React.CSSProperties = { fontFamily: "Georgia, 'Times New Roman', serif", color: "#1B2B5E", fontSize: 18, fontWeight: 700, margin: "0 0 16px" };

  return (
    <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        <div style={{ marginBottom: 16 }}>
          <Link href={`/mon-compte/chiens/${chien.id}`} style={{ color: "#1F6E5B", textDecoration: "none", fontWeight: 600, fontSize: 14 }}>← Retour à la fiche</Link>
        </div>

        <EnTete titre={`✏️ Modifier ${chien.nom}`} sousTitre={chien.race || undefined} />

        <form action={action}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Identité */}
            <Carte>
              <h2 style={titreSection}>🐶 Identité</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Nom *</label>
                  <input name="nom" type="text" required defaultValue={chien.nom ?? ""} style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Race *</label>
                  <input name="race" type="text" required defaultValue={chien.race ?? ""} style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Couleur *</label>
                  <input name="couleur" type="text" required defaultValue={chien.couleur ?? ""} style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Poids (kg) *</label>
                  <input name="poids" type="number" step="0.1" min="0" required defaultValue={chien.poids ?? ""} style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Sexe *</label>
                  <select name="sexe" required defaultValue={chien.sexe ?? ""} style={champStyle}>
                    <option value="" disabled>Choisir</option>
                    <option value="M">Mâle</option>
                    <option value="F">Femelle</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Stérilisation *</label>
                  <select name="sterilisation" required defaultValue={chien.sterilisation || "non"} style={champStyle}>
                    <option value="non">Non</option>
                    <option value="oui">Oui</option>
                    <option value="chimique">Castré chimiquement</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Date de naissance</label>
                  <input name="date_naissance" type="date" defaultValue={chien.date_naissance ? String(chien.date_naissance).slice(0, 10) : ""} style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Numéro de puce</label>
                  <input name="numero_puce" type="text" defaultValue={chien.numero_puce ?? ""} style={champStyle} />
                </div>
              </div>
            </Carte>

            {/* Cohabitation en box */}
            <Carte>
              <h2 style={titreSection}>🏠 Cohabitation en box</h2>
              <ChoixCohabitationChamp valeur={choixActuel} verrouille={verrouille} />
            </Carte>

            {/* Santé */}
            <Carte>
              <h2 style={titreSection}>🩺 Santé</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Allergies</label>
                  <textarea name="allergies" rows={2} defaultValue={chien.allergies ?? ""} style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Traitements en cours</label>
                  <textarea name="traitements" rows={2} defaultValue={chien.traitements ?? ""} style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Remarques</label>
                  <textarea name="remarques" rows={3} defaultValue={chien.remarques ?? ""} style={champStyle} />
                </div>
              </div>
            </Carte>

          </div>

          {/* Actions */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
            <Bouton variante="principal" type="submit">💾 Enregistrer</Bouton>
            <Bouton variante="secondaire" href={`/mon-compte/chiens/${chien.id}`}>← Annuler</Bouton>
          </div>
        </form>

      </div>
    </main>
  );
}
