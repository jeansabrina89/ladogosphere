import { modifierChien } from "./actions";
import { exigerPersonnelPage } from "@/src/lib/exigerPersonnelPage";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";

export default async function ModifierChienPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerPersonnelPage();
  const supabase = supabaseAdmin;
  const { id } = await params;

  const { data: chien } = await supabase
    .from("chiens")
    .select("*")
    .eq("id", id)
    .single();

  if (!chien) {
    return (
      <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
        <div className="max-w-3xl mx-auto">
          <Carte>
            <EtatVide
              icone="🐶"
              titre="Chien introuvable"
              message="Ce chien n'existe pas ou a été supprimé."
              action={<Bouton variante="secondaire" href="/chiens">← Retour à la liste</Bouton>}
            />
          </Carte>
        </div>
      </main>
    );
  }

  const actionModifier = modifierChien.bind(null, id);

  const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600, color: "#1B2B5E", marginBottom: 6, fontSize: 14 };
  const champStyle: React.CSSProperties = { width: "100%", border: "1px solid rgba(27,43,94,0.2)", borderRadius: 12, padding: "10px 12px", fontSize: 15, color: "#1B2B5E", backgroundColor: "#FFFFFF", boxSizing: "border-box" };
  const titreSection: React.CSSProperties = { fontFamily: "Georgia, 'Times New Roman', serif", color: "#1B2B5E", fontSize: 18, fontWeight: 700, margin: "0 0 16px" };
  const sousTitre: React.CSSProperties = { fontWeight: 600, color: "#1B2B5E", fontSize: 14, margin: "16px 0 8px" };
  const muted: React.CSSProperties = { color: "rgba(27,43,94,0.6)", fontSize: 13, margin: "6px 0 0" };

  const caseRow = (name: string, label: string, checked: boolean) => (
    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: "#1B2B5E", cursor: "pointer", padding: "6px 0" }}>
      <input type="checkbox" name={name} defaultChecked={!!checked} style={{ width: 18, height: 18, flexShrink: 0 }} />
      {label}
    </label>
  );

  const categorieTxt =
    chien.categorie_poids === "moins_15kg" ? "🟢 Petit (< 15 kg)" :
    chien.categorie_poids === "15_30kg" ? "🟡 Moyen (15–30 kg)" :
    chien.categorie_poids === "30_40kg" ? "🔴 Grand (> 30 kg)" : "—";

  return (
    <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">

        <EnTete titre={`✏️ Modifier ${chien.nom}`} sousTitre={chien.race || undefined} />

        <form action={actionModifier}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Identité */}
            <Carte>
              <h2 style={titreSection}>🐶 Identité</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Nom</label>
                  <input name="nom" defaultValue={chien.nom} style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Race *</label>
                  <input name="race" required defaultValue={chien.race || ""} style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Couleur</label>
                  <input name="couleur" defaultValue={chien.couleur || ""} style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Poids (kg)</label>
                  <input name="poids" type="number" step="0.1" defaultValue={chien.poids || ""} style={champStyle} />
                  <p style={muted}>Catégorie actuelle : {categorieTxt}</p>
                </div>
                <div>
                  <label style={labelStyle}>Date de naissance</label>
                  <input name="date_naissance" type="date" defaultValue={chien.date_naissance || ""} style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Sexe</label>
                  <select name="sexe" defaultValue={chien.sexe || ""} style={champStyle}>
                    <option value="M">Mâle</option>
                    <option value="F">Femelle</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Stérilisation</label>
                  <select name="sterilisation" defaultValue={chien.sterilisation || "non"} style={champStyle}>
                    <option value="non">Non</option>
                    <option value="oui">Oui</option>
                    <option value="chimique">Castré chimiquement</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Numéro de puce *</label>
                  <input name="numero_puce" required defaultValue={chien.numero_puce || ""} style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Niveau d'énergie</label>
                  <select name="niveau_energie" defaultValue={chien.niveau_energie || ""} style={champStyle}>
                    <option value="">Choisir</option>
                    <option value="faible">Faible</option>
                    <option value="moyen">Moyen</option>
                    <option value="eleve">Élevé</option>
                  </select>
                </div>
              </div>
            </Carte>

            {/* Santé & vétérinaire */}
            <Carte>
              <h2 style={titreSection}>🩺 Santé &amp; vétérinaire</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Allergies</label>
                  <textarea name="allergies" rows={3} defaultValue={chien.allergies || ""} style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Traitements</label>
                  <textarea name="traitements" rows={3} defaultValue={chien.traitements || ""} style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Nom du vétérinaire</label>
                  <input name="veterinaire_nom" defaultValue={chien.veterinaire_nom || ""} style={champStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Téléphone du vétérinaire</label>
                  <input name="veterinaire_telephone" defaultValue={chien.veterinaire_telephone || ""} style={champStyle} />
                </div>
              </div>
            </Carte>

            {/* Comportement */}
            <Carte>
              <h2 style={titreSection}>🐾 Comportement</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Comportement / Sociabilité</label>
                  <textarea name="comportement" rows={3} defaultValue={chien.comportement || ""} style={champStyle} />
                </div>
                <div>
                  <p style={sousTitre}>⚠️ Comportements particuliers</p>
                  {caseRow("protection_ressources", "⚠️ Protection de ressources", chien.protection_ressources)}
                  {caseRow("destructeur", "🔨 Destructeur", chien.destructeur)}
                  {caseRow("craintif", "😰 Craintif", chien.craintif)}
                </div>
                <div>
                  <label style={labelStyle}>Autres comportements</label>
                  <input name="comportement_autre" type="text" defaultValue={chien.comportement_autre || ""} style={champStyle} placeholder="Ex: aboie beaucoup, saute sur les gens..." />
                </div>
                <div>
                  <label style={labelStyle}>Remarques</label>
                  <textarea name="remarques" rows={4} defaultValue={chien.remarques || ""} style={champStyle} />
                </div>
              </div>
            </Carte>

            {/* Compatibilités */}
            <Carte>
              <h2 style={titreSection}>🤝 Compatibilités</h2>
              <div>
                <p style={{ ...sousTitre, marginTop: 0 }}>Sexe</p>
                {caseRow("compatible_males_castres", "Mâles castrés", chien.compatible_males_castres)}
                {caseRow("compatible_males_entiers", "Mâles entiers", chien.compatible_males_entiers)}
                {caseRow("compatible_femelles_sterilisees", "Femelles stérilisées", chien.compatible_femelles_sterilisees)}
                {caseRow("compatible_femelles_entieres", "Femelles entières", chien.compatible_femelles_entieres)}
              </div>
              <div>
                <p style={sousTitre}>⚖️ Gabarit</p>
                {caseRow("compatible_moins_15kg", "🟢 Chiens de moins de 15 kg (Petits)", chien.compatible_moins_15kg)}
                {caseRow("compatible_15_30kg", "🟡 Chiens de 15 à 30 kg (Moyens)", chien.compatible_15_30kg)}
                {caseRow("compatible_30_40kg", "🔴 Chiens de plus de 30 kg (Grands)", chien.compatible_30_40kg)}
              </div>
            </Carte>

          </div>

          {/* Actions */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
            <Bouton variante="principal" type="submit">💾 Enregistrer</Bouton>
            <Bouton variante="secondaire" href={`/chiens/${id}`}>✖ Annuler</Bouton>
          </div>
        </form>

      </div>
    </main>
  );
}
