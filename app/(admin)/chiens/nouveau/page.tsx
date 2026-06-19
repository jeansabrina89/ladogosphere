import { exigerPersonnelPage } from "@/src/lib/exigerPersonnelPage";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { creerChien } from "./actions";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";

export default async function NouveauChienPage() {
  await exigerPersonnelPage();
  const supabase = supabaseAdmin;
  const { data: clients } = await supabase
    .from("clients")
    .select("id, prenom, nom")
    .order("nom");

  const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600, color: "#1B2B5E", marginBottom: 6, fontSize: 14 };
  const champStyle: React.CSSProperties = { width: "100%", border: "1px solid rgba(27,43,94,0.2)", borderRadius: 12, padding: "10px 12px", fontSize: 15, color: "#1B2B5E", backgroundColor: "#FFFFFF", boxSizing: "border-box" };
  const titreSection: React.CSSProperties = { fontFamily: "Georgia, 'Times New Roman', serif", color: "#1B2B5E", fontSize: 18, fontWeight: 700, margin: "0 0 16px" };
  const sousTitre: React.CSSProperties = { fontWeight: 600, color: "#1B2B5E", fontSize: 14, margin: "16px 0 8px" };
  const muted: React.CSSProperties = { color: "rgba(27,43,94,0.6)", fontSize: 13, margin: "6px 0 0" };

  const caseRow = (name: string, label: string) => (
    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: "#1B2B5E", cursor: "pointer", padding: "6px 0" }}>
      <input type="checkbox" name={name} style={{ width: 18, height: 18, flexShrink: 0 }} />
      {label}
    </label>
  );

  return (
    <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">

        <EnTete titre="➕ Ajouter un chien" sousTitre="Nouvelle fiche chien" />

        <form action={creerChien}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Identité */}
            <Carte>
              <h2 style={titreSection}>🐶 Identité</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Propriétaire *</label>
                  <select name="client_id" required style={champStyle}>
                    <option value="">-- Sélectionner --</option>
                    {clients?.map(c => (
                      <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Nom *</label>
                  <input name="nom" type="text" required style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Race *</label>
                  <input name="race" type="text" required style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Couleur *</label>
                  <input name="couleur" type="text" required style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Poids (kg) *</label>
                  <input name="poids" type="number" step="0.1" required style={champStyle} />
                  <p style={muted}>{"Catégorie calculée automatiquement : <15 kg = Petit · 15–30 kg = Moyen · >30 kg = Grand"}</p>
                </div>
                <div>
                  <label style={labelStyle}>Date de naissance</label>
                  <input name="date_naissance" type="date" style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Sexe *</label>
                  <select name="sexe" required style={champStyle}>
                    <option value="">Choisir</option>
                    <option value="M">Mâle</option>
                    <option value="F">Femelle</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Stérilisation</label>
                  <select name="sterilisation" defaultValue="non" style={champStyle}>
                    <option value="non">Non</option>
                    <option value="oui">Oui</option>
                    <option value="chimique">Castré chimiquement</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Numéro de puce *</label>
                  <input name="numero_puce" type="text" required style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Niveau d'énergie</label>
                  <select name="niveau_energie" style={champStyle}>
                    <option value="">Choisir</option>
                    <option value="faible">Faible</option>
                    <option value="moyen">Moyen</option>
                    <option value="eleve">Élevé</option>
                  </select>
                </div>
              </div>
            </Carte>

            {/* Santé */}
            <Carte>
              <h2 style={titreSection}>🩺 Santé</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Allergies</label>
                  <textarea name="allergies" rows={3} style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Traitements</label>
                  <textarea name="traitements" rows={3} style={champStyle} />
                </div>
              </div>
            </Carte>

            {/* Comportement */}
            <Carte>
              <h2 style={titreSection}>🐾 Comportement</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Comportement / Sociabilité</label>
                  <textarea name="comportement" rows={3} style={champStyle} />
                </div>
                <div>
                  <p style={sousTitre}>⚠️ Comportements particuliers</p>
                  {caseRow("protection_ressources", "⚠️ Protection de ressources")}
                  {caseRow("destructeur", "🔨 Destructeur")}
                  {caseRow("craintif", "😰 Craintif")}
                </div>
                <div>
                  <label style={labelStyle}>Autres comportements</label>
                  <input name="comportement_autre" type="text" style={champStyle} placeholder="Ex: aboie beaucoup, saute sur les gens..." />
                </div>
                <div>
                  <label style={labelStyle}>Remarques</label>
                  <textarea name="remarques" rows={4} style={champStyle} />
                </div>
              </div>
            </Carte>

            {/* Compatibilités */}
            <Carte>
              <h2 style={titreSection}>🤝 Compatibilités</h2>
              <div>
                <p style={{ ...sousTitre, marginTop: 0 }}>Sexe</p>
                {caseRow("compatible_males_castres", "Mâles castrés")}
                {caseRow("compatible_males_entiers", "Mâles entiers")}
                {caseRow("compatible_femelles_sterilisees", "Femelles stérilisées")}
                {caseRow("compatible_femelles_entieres", "Femelles entières")}
              </div>
              <div>
                <p style={sousTitre}>⚖️ Gabarit</p>
                {caseRow("compatible_moins_15kg", "🟢 Chiens de moins de 15 kg (Petits)")}
                {caseRow("compatible_15_30kg", "🟡 Chiens de 15 à 30 kg (Moyens)")}
                {caseRow("compatible_30_40kg", "🔴 Chiens de plus de 30 kg (Grands)")}
              </div>
              <div>
                <p style={sousTitre}>🚪 Isolement</p>
                {caseRow("doit_etre_isole", "🚫🐕 Doit être isolé (box seul, tarif privatif)")}
              </div>
            </Carte>

          </div>

          {/* Actions */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
            <Bouton variante="principal" type="submit">💾 Enregistrer</Bouton>
            <Bouton variante="secondaire" href="/chiens">✖ Annuler</Bouton>
          </div>
        </form>

      </div>
    </main>
  );
}
