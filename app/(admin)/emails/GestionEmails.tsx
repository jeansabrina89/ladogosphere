"use client";

import { useMemo, useState, useEffect } from "react";
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

type Campagne = {
  id: string;
  sujet: string;
  cible: string;
  nb_destinataires: number;
  nb_echecs: number;
  created_at: string;
};

function cibleLabel(c: string) {
  return c === "membres_actifs" ? "Membres actifs" : "Tous les clients";
}

function formatDateFR(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("fr-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function MessageMembres({ campagnes }: { campagnes: Campagne[] }) {
  const [sujet, setSujet] = useState("");
  const [corps, setCorps] = useState("");
  const [cible, setCible] = useState<"membres_actifs" | "tous_clients">("membres_actifs");
  const [count, setCount] = useState<number | null>(null);
  const [chargeCount, setChargeCount] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState<{ total: number; envoyes: number; echecs: number } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    setChargeCount(true);
    setCount(null);
    fetch("/api/emails/campagne", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cible, apercu: true }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!annule) setCount(typeof d.count === "number" ? d.count : null);
      })
      .catch(() => {
        if (!annule) setCount(null);
      })
      .finally(() => {
        if (!annule) setChargeCount(false);
      });
    return () => {
      annule = true;
    };
  }, [cible]);

  async function envoyer() {
    setErreur(null);
    setResultat(null);
    if (!sujet.trim() || !corps.trim()) {
      setErreur("Renseignez le sujet et le message.");
      return;
    }
    const n = count ?? 0;
    if (n === 0) {
      setErreur("Aucun destinataire pour cette cible.");
      return;
    }
    const ok = window.confirm(
      `Envoyer ce message à ${n} destinataire${n > 1 ? "s" : ""} (${cibleLabel(cible)}) ?`
    );
    if (!ok) return;
    setEnvoi(true);
    try {
      const res = await fetch("/api/emails/campagne", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sujet, corps, cible }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErreur(d.error || "Erreur lors de l'envoi.");
      } else {
        setResultat({ total: d.total, envoyes: d.envoyes, echecs: d.echecs });
        setSujet("");
        setCorps("");
      }
    } catch {
      setErreur("Erreur réseau.");
    }
    setEnvoi(false);
  }

  const apercuCorps = (corps || "Votre message apparaîtra ici…").replace(/\{prenom\}/g, "Marie").replace(/\{nom\}/g, "Dupont");
  const apercuSujet = (sujet || "(sujet)").replace(/\{prenom\}/g, "Marie").replace(/\{nom\}/g, "Dupont");

  const pill = (actif: boolean): React.CSSProperties => ({
    background: actif ? "#2E8B7E" : "#EDE8DF",
    color: actif ? "#FFFFFF" : "#1B2B5E",
    border: "none",
    borderRadius: "999px",
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <Carte accent="teal" className="space-y-4">
        <div>
          <span style={labelStyle}>Destinataires</span>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" style={pill(cible === "membres_actifs")} onClick={() => setCible("membres_actifs")}>
              Membres actifs
            </button>
            <button type="button" style={pill(cible === "tous_clients")} onClick={() => setCible("tous_clients")}>
              Tous les clients
            </button>
          </div>
          <p style={{ margin: "8px 0 0 0", fontSize: "13px", color: "#6B7280" }}>
            {chargeCount
              ? "Calcul du nombre de destinataires…"
              : count === null
              ? "Nombre de destinataires indisponible."
              : `👥 ${count} destinataire${count > 1 ? "s" : ""}`}
          </p>
        </div>

        <div>
          <label style={labelStyle}>Sujet</label>
          <input style={inputStyle} value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder="Ex. Fermeture exceptionnelle en août" />
        </div>

        <div>
          <label style={labelStyle}>Message</label>
          <textarea
            style={{ ...inputStyle, minHeight: "180px", resize: "vertical", lineHeight: 1.6 }}
            value={corps}
            onChange={(e) => setCorps(e.target.value)}
            placeholder={"Bonjour {prenom},\n\nÉcrivez votre message ici…"}
          />
          <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#9CA3AF" }}>
            Variables : <code style={{ fontFamily: "monospace" }}>{"{prenom}"}</code> et{" "}
            <code style={{ fontFamily: "monospace" }}>{"{nom}"}</code> sont remplacés pour chaque destinataire. Les retours à la ligne sont conservés.
          </p>
        </div>

        <div style={{ background: "#F5F0E8", borderRadius: "12px", padding: "16px" }}>
          <p style={{ margin: "0 0 10px 0", fontSize: "12px", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Aperçu (exemple : Marie Dupont)
          </p>
          <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "#6B7280" }}>
            <strong>Sujet :</strong> {apercuSujet}
          </p>
          <div style={{ background: "#FFFFFF", borderRadius: "10px", padding: "16px", whiteSpace: "pre-wrap", color: "#1B2B5E", fontSize: "14px", lineHeight: 1.6 }}>
            {apercuCorps}
          </div>
          <p style={{ margin: "10px 0 0 0", fontSize: "12px", color: "#9CA3AF" }}>
            L'en-tête (logo) et la signature La Dogosphère sont ajoutés automatiquement.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <Bouton variante="principal" onClick={envoyer} disabled={envoi}>
            {envoi ? "Envoi en cours…" : "📤 Envoyer le message"}
          </Bouton>
          {resultat && (
            <span style={{ fontSize: "13px", fontWeight: 600, color: resultat.echecs > 0 ? "#E8847A" : "#2E8B7E" }}>
              {resultat.echecs > 0
                ? `✉️ ${resultat.envoyes} envoyé${resultat.envoyes > 1 ? "s" : ""}, ${resultat.echecs} échec${resultat.echecs > 1 ? "s" : ""}`
                : `✅ ${resultat.envoyes} email${resultat.envoyes > 1 ? "s" : ""} envoyé${resultat.envoyes > 1 ? "s" : ""}`}
            </span>
          )}
          {erreur && <span style={{ color: "#E8847A", fontSize: "13px", fontWeight: 600 }}>❌ {erreur}</span>}
        </div>
      </Carte>

      {campagnes.length > 0 && (
        <Carte>
          <h3 style={{ margin: "0 0 12px 0", color: "#1B2B5E", fontSize: "15px", fontWeight: 700 }}>Derniers envois</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {campagnes.map((c) => (
              <div key={c.id} style={{ borderBottom: "1px solid #EDE8DF", paddingBottom: "8px" }}>
                <p style={{ margin: "0 0 2px 0", color: "#1B2B5E", fontWeight: 600, fontSize: "14px" }}>{c.sujet}</p>
                <p style={{ margin: 0, color: "#6B7280", fontSize: "12px" }}>
                  {formatDateFR(c.created_at)} · {cibleLabel(c.cible)} · {c.nb_destinataires} destinataire{c.nb_destinataires > 1 ? "s" : ""}
                  {c.nb_echecs > 0 ? ` · ${c.nb_echecs} échec${c.nb_echecs > 1 ? "s" : ""}` : ""}
                </p>
              </div>
            ))}
          </div>
        </Carte>
      )}
    </div>
  );
}

export default function GestionEmails({ emails, campagnes = [] }: { emails: EmailModele[]; campagnes?: Campagne[] }) {
  const [onglet, setOnglet] = useState<"modeles" | "message">("modeles");

  const ongletStyle = (actif: boolean): React.CSSProperties => ({
    background: "transparent",
    border: "none",
    borderBottom: actif ? "3px solid #2E8B7E" : "3px solid transparent",
    color: actif ? "#1B2B5E" : "#6B7280",
    fontSize: "15px",
    fontWeight: 700,
    padding: "10px 4px",
    cursor: "pointer",
  });

  return (
    <div style={{ padding: "24px", maxWidth: "760px", margin: "0 auto" }}>
      <EnTete
        titre="✉️ Emails"
        sousTitre="Personnalisez les emails automatiques et envoyez un message à vos clients."
      />

      <div style={{ display: "flex", gap: "20px", borderBottom: "1px solid #EDE8DF", margin: "0 0 20px 0" }}>
        <button type="button" style={ongletStyle(onglet === "modeles")} onClick={() => setOnglet("modeles")}>
          Modèles automatiques
        </button>
        <button type="button" style={ongletStyle(onglet === "message")} onClick={() => setOnglet("message")}>
          Message aux membres
        </button>
      </div>

      {onglet === "modeles" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {emails.map((email) => (
            <CarteEmail key={email.type} email={email} />
          ))}
        </div>
      ) : (
        <MessageMembres campagnes={campagnes} />
      )}
    </div>
  );
}
