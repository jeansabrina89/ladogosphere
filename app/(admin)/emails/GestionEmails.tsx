"use client";

import { useMemo, useState } from "react";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";

type Champs = {
  sujet: string;
  titre: string;
  intro: string;
  message_final: string;
};

type EmailModele = {
  type: string;
  label: string;
  variables: string[];
  defaut: Champs;
  perso: Partial<Champs> | null;
};

const EXEMPLES: Record<string, string> = {
  prenom: "Marie",
  nom: "Dupont",
  nom_chien: "Rex",
  date_debut: "lundi 6 juillet 2026",
  date_fin: "vendredi 10 juillet 2026",
  montant: "120.00",
  annee: "2026",
};

function interpoler(texte: string): string {
  return texte.replace(/\{(\w+)\}/g, (_m, cle) =>
    EXEMPLES[cle] !== undefined ? EXEMPLES[cle] : `{${cle}}`
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid #E2E8F0",
  fontSize: "14px",
  color: "#1B2B5E",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: 600,
  color: "#6B7280",
  margin: "0 0 6px 0",
};

function CarteEmail({ email }: { email: EmailModele }) {
  const [sujet, setSujet] = useState(email.perso?.sujet ?? "");
  const [titre, setTitre] = useState(email.perso?.titre ?? "");
  const [intro, setIntro] = useState(email.perso?.intro ?? "");
  const [messageFinal, setMessageFinal] = useState(email.perso?.message_final ?? "");
  const [apercu, setApercu] = useState(false);
  const [etat, setEtat] = useState<"" | "enregistrement" | "ok" | "erreur">("");
  const [copie, setCopie] = useState<string | null>(null);

  const valeurOuDefaut = (v: string, d: string) => (v.trim() !== "" ? v : d);

  const rendu = useMemo(() => ({
    sujet: interpoler(valeurOuDefaut(sujet, email.defaut.sujet)),
    titre: interpoler(valeurOuDefaut(titre, email.defaut.titre)),
    intro: interpoler(valeurOuDefaut(intro, email.defaut.intro)),
    message_final: interpoler(valeurOuDefaut(messageFinal, email.defaut.message_final)),
  }), [sujet, titre, intro, messageFinal, email.defaut]);

  async function enregistrer() {
    setEtat("enregistrement");
    try {
      const res = await fetch("/api/emails/modeles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: email.type,
          sujet, titre, intro, message_final: messageFinal,
        }),
      });
      setEtat(res.ok ? "ok" : "erreur");
    } catch {
      setEtat("erreur");
    }
    setTimeout(() => setEtat(""), 2500);
  }

  async function copierVariable(v: string) {
    const token = `{${v}}`;
    try { await navigator.clipboard.writeText(token); } catch { /* ignore */ }
    setCopie(v);
    setTimeout(() => setCopie(null), 1200);
  }

  return (
    <Carte className="space-y-4">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <h3 style={{ margin: 0, color: "#1B2B5E", fontSize: "16px", fontWeight: 700 }}>{email.label}</h3>
        <button
          type="button"
          onClick={() => setApercu((a) => !a)}
          style={{ background: "transparent", border: "none", color: "#2E8B7E", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
        >
          {apercu ? "Masquer l'aperçu" : "👁️ Aperçu"}
        </button>
      </div>

      <div>
        <span style={labelStyle}>Variables disponibles (cliquez pour copier)</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {email.variables.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => copierVariable(v)}
              style={{
                background: copie === v ? "#2E8B7E" : "#EDE8DF",
                color: copie === v ? "#FFFFFF" : "#1B2B5E",
                border: "none", borderRadius: "999px", padding: "4px 10px",
                fontSize: "12px", cursor: "pointer", fontFamily: "monospace",
              }}
            >
              {copie === v ? "copié !" : `{${v}}`}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={labelStyle}>Sujet</label>
        <input style={inputStyle} value={sujet} placeholder={email.defaut.sujet}
          onChange={(e) => setSujet(e.target.value)} />
      </div>
      <div>
        <label style={labelStyle}>Titre</label>
        <input style={inputStyle} value={titre} placeholder={email.defaut.titre}
          onChange={(e) => setTitre(e.target.value)} />
      </div>
      <div>
        <label style={labelStyle}>Message d'introduction</label>
        <textarea style={{ ...inputStyle, minHeight: "70px", resize: "vertical" }} value={intro}
          placeholder={email.defaut.intro} onChange={(e) => setIntro(e.target.value)} />
      </div>
      <div>
        <label style={labelStyle}>Message de fin</label>
        <textarea style={{ ...inputStyle, minHeight: "70px", resize: "vertical" }} value={messageFinal}
          placeholder={email.defaut.message_final} onChange={(e) => setMessageFinal(e.target.value)} />
      </div>

      <p style={{ margin: 0, fontSize: "12px", color: "#9CA3AF" }}>
        Laissez un champ vide pour garder le texte par défaut (affiché en gris).
      </p>

      {apercu && (
        <div style={{ background: "#F5F0E8", borderRadius: "12px", padding: "16px" }}>
          <p style={{ margin: "0 0 10px 0", fontSize: "12px", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Aperçu (valeurs d'exemple)
          </p>
          <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "#6B7280" }}>
            <strong>Sujet :</strong> {rendu.sujet}
          </p>
          <div style={{ background: "#FFFFFF", borderRadius: "10px", padding: "16px" }}>
            <p style={{ margin: "0 0 8px 0", color: "#1B2B5E", fontWeight: 700, fontSize: "15px" }}
              dangerouslySetInnerHTML={{ __html: rendu.titre }} />
            <p style={{ margin: "0 0 12px 0", color: "#6B7280", fontSize: "14px" }}
              dangerouslySetInnerHTML={{ __html: rendu.intro }} />
            <div style={{ background: "#EDE8DF", borderRadius: "8px", padding: "10px 12px", margin: "0 0 12px 0", fontSize: "12px", color: "#9CA3AF", textAlign: "center" }}>
              — bloc récapitulatif automatique (dates, montant, coordonnées…) —
            </div>
            <p style={{ margin: 0, color: "#6B7280", fontSize: "14px" }}
              dangerouslySetInnerHTML={{ __html: rendu.message_final }} />
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <Bouton variante="principal" onClick={enregistrer} disabled={etat === "enregistrement"}>
          {etat === "enregistrement" ? "Enregistrement…" : "Enregistrer"}
        </Bouton>
        {etat === "ok" && <span style={{ color: "#2E8B7E", fontSize: "13px", fontWeight: 600 }}>✅ Enregistré</span>}
        {etat === "erreur" && <span style={{ color: "#E8847A", fontSize: "13px", fontWeight: 600 }}>❌ Erreur, réessayez</span>}
      </div>
    </Carte>
  );
}

export default function GestionEmails({ emails }: { emails: EmailModele[] }) {
  return (
    <div style={{ padding: "24px", maxWidth: "760px", margin: "0 auto" }}>
      <EnTete
        titre="✉️ Emails"
        sousTitre="Personnalisez le texte des emails automatiques envoyés aux clients."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {emails.map((email) => (
          <CarteEmail key={email.type} email={email} />
        ))}
      </div>
    </div>
  );
}
