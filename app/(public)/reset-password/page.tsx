"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Eye, EyeOff } from "lucide-react";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ResetPasswordPage() {
  const router = useRouter();
  const [etat, setEtat] = useState<"verification" | "pret" | "succes" | "erreur">("verification");
  const [message, setMessage] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [voirMdp, setVoirMdp] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const dejaLance = useRef(false);

  useEffect(() => {
    if (dejaLance.current) return; // empêche le double-appel de React
    dejaLance.current = true;

    const params = new URLSearchParams(window.location.search);
    const token_hash = params.get("token_hash");
    const type = params.get("type");

    if (!token_hash || !type) {
      setEtat("erreur");
      setMessage("Lien invalide. Merci de redemander un e-mail de réinitialisation.");
      return;
    }

    supabase.auth.verifyOtp({ type: type as any, token_hash }).then(({ error }) => {
      if (error) {
        setEtat("erreur");
        setMessage("Ce lien a expiré ou a déjà été utilisé. Merci de redemander un e-mail.");
      } else {
        setEtat("pret");
      }
    });
  }, []);

  async function enregistrer() {
    if (motDePasse.length < 8) {
      setMessage("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (motDePasse !== confirmation) {
      setMessage("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setEnCours(true);
    setMessage("");
    const { error } = await supabase.auth.updateUser({ password: motDePasse });
    setEnCours(false);
    if (error) {
      setMessage("Erreur : " + error.message);
      return;
    }
    setEtat("succes");
    setTimeout(() => router.push("/login"), 2500);
  }

  return (
    <div style={{ maxWidth: 420, margin: "60px auto", padding: 24 }}>
      <h1 style={{ marginBottom: 16 }}>Réinitialisation du mot de passe</h1>

      {etat === "verification" && <p>Vérification du lien en cours…</p>}

      {etat === "erreur" && (
        <>
          <p style={{ color: "#b00" }}>{message}</p>
          <button onClick={() => router.push("/login")} style={{ marginTop: 12 }}>
            Retour à la connexion
          </button>
        </>
      )}

      {etat === "pret" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ position: "relative" }}>
            <input
              type={voirMdp ? "text" : "password"}
              placeholder="Nouveau mot de passe"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              style={{ width: "100%", paddingRight: 40, boxSizing: "border-box" }}
            />
            <button type="button" onClick={() => setVoirMdp((v) => !v)}
              aria-label={voirMdp ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              style={{ position: "absolute", top: "50%", right: 8, transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#888", display: "flex", padding: 0 }}>
              {voirMdp ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div style={{ position: "relative" }}>
            <input
              type={voirMdp ? "text" : "password"}
              placeholder="Confirmer le mot de passe"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              style={{ width: "100%", paddingRight: 40, boxSizing: "border-box" }}
            />
            <button type="button" onClick={() => setVoirMdp((v) => !v)}
              aria-label={voirMdp ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              style={{ position: "absolute", top: "50%", right: 8, transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#888", display: "flex", padding: 0 }}>
              {voirMdp ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {message && <p style={{ color: "#b00" }}>{message}</p>}
          <button onClick={enregistrer} disabled={enCours}>
            {enCours ? "Enregistrement…" : "Enregistrer le nouveau mot de passe"}
          </button>
        </div>
      )}

      {etat === "succes" && (
        <p style={{ color: "#080" }}>
          Mot de passe modifié ✓ Redirection vers la connexion…
        </p>
      )}
    </div>
  );
}