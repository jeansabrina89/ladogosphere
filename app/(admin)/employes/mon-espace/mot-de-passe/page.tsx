"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/src/utils/supabase/client";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";

const supabase = createClient();

export default function ChangerMotDePassePage() {
  const router = useRouter();
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState("");
  const [succes, setSucces] = useState(false);
  const [enCours, setEnCours] = useState(false);

  async function enregistrer() {
    setErreur("");
    if (nouveau.length < 8) {
      setErreur("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (nouveau !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setEnCours(true);
    const { error } = await supabase.auth.updateUser({ password: nouveau });
    setEnCours(false);
    if (error) {
      setErreur("Erreur : " + error.message);
      return;
    }
    setSucces(true);
    setNouveau("");
    setConfirmation("");
  }

  const inputStyle = {
    width: "100%",
    border: "1px solid rgba(27,43,94,0.12)",
    borderRadius: "14px",
    padding: "12px 14px",
    fontSize: "15px",
    color: "#1B2B5E",
    boxSizing: "border-box" as const,
  };
  const labelStyle = {
    display: "block",
    fontSize: "14px",
    fontWeight: 600,
    color: "#1B2B5E",
    marginBottom: "6px",
  };

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-md mx-auto">
        <EnTete
          titre="🔑 Changer mon mot de passe"
          action={<Bouton href="/employes/mon-espace" variante="secondaire">← Retour</Bouton>}
        />

        <Carte>
          {succes ? (
            <div style={{ textAlign: "center", padding: "16px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
              <div style={{ width: "100%", borderRadius: "14px", padding: "14px 16px", backgroundColor: "#DCEEE9", color: "#1F6E5B", fontWeight: 600 }}>
                ✅ Mot de passe modifié avec succès.
              </div>
              <Bouton href="/employes/mon-espace" variante="principal">Retour à mon espace</Bouton>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={labelStyle}>Nouveau mot de passe</label>
                <input type="password" value={nouveau} onChange={e => setNouveau(e.target.value)} placeholder="minimum 8 caractères" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Confirmer le mot de passe</label>
                <input type="password" value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder="répéter le mot de passe" style={inputStyle} />
              </div>

              {erreur && (
                <div style={{ borderRadius: "14px", padding: "12px 14px", backgroundColor: "#FBE2DE", color: "#A8453A", fontSize: "14px", fontWeight: 600 }}>
                  {erreur}
                </div>
              )}

              <Bouton onClick={enregistrer} disabled={enCours} pleineLargeur variante="principal">
                {enCours ? "Enregistrement…" : "💾 Enregistrer le nouveau mot de passe"}
              </Bouton>
            </div>
          )}
        </Carte>
      </div>
    </main>
  );
}
