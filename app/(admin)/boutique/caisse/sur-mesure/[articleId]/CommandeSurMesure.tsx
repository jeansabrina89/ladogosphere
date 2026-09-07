"use client";

import { useState } from "react";
import Link from "next/link";
import Configurateur, { type ArticleConfigurable } from "@/app/components/Configurateur";
import {
  commanderSurMesure,
  chercherClientCommande,
  type ClientTrouve,
} from "../actions";
import { MODES_CAISSE, lireMontant, rendreMonnaie, encaissementVente, chf } from "@/src/lib/caisseLogique";
import { formatDateFR } from "@/src/lib/dates";
import type { ChoixParGroupe, OptionGroupe } from "@/src/lib/personnalisationLogique";

/**
 * Commande sur mesure au comptoir : on configure, on rattache un client, on
 * encaisse. C'est le même configurateur que dans l'espace client, et le même
 * encaissement que la caisse ordinaire.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.14)";
const VERT = "#2E8B7E";
const CIBLE = 52;

const champ: React.CSSProperties = {
  width: "100%", minHeight: CIBLE, padding: "12px 14px", border: BORDURE,
  borderRadius: 14, fontSize: 16, color: MARINE, backgroundColor: "#FFFFFF",
  fontFamily: "inherit", boxSizing: "border-box",
};

const boutonSecondaire: React.CSSProperties = {
  minHeight: 48, padding: "0 16px", borderRadius: 12, border: BORDURE,
  backgroundColor: "#FFFFFF", color: MARINE, fontSize: 15, fontWeight: 600,
  fontFamily: "inherit", cursor: "pointer",
};

export default function CommandeSurMesure({
  article,
  groupes,
  peutFacturer,
}: {
  article: ArticleConfigurable & { taux_tva: number | string };
  groupes: OptionGroupe[];
  peutFacturer: boolean;
}) {
  const [etape, setEtape] = useState<"configuration" | "paiement" | "fait">("configuration");
  const [choix, setChoix] = useState<ChoixParGroupe>({});
  const [prix, setPrix] = useState(0);
  const [delai, setDelai] = useState(0);
  const [cle] = useState(() => nouvelleCle());

  const [mode, setMode] = useState<string | null>(null);
  const [recu, setRecu] = useState("");
  const [notes, setNotes] = useState("");
  const [client, setClient] = useState<ClientTrouve | null>(null);
  const [recherche, setRecherche] = useState("");
  const [clients, setClients] = useState<ClientTrouve[]>([]);
  const [forcerFactureLibre, setForcerFactureLibre] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [faite, setFaite] = useState<{
    numero: string; rendu: number | null; arrondi: number; datePromise: string | null; id: string;
  } | null>(null);

  const encaissement = encaissementVente(prix, mode ?? "carte");
  const rendu = rendreMonnaie(encaissement.aRegler, lireMontant(recu));

  async function chercher(q: string) {
    setRecherche(q);
    if (q.trim().length < 2) return setClients([]);
    setClients(await chercherClientCommande(q));
  }

  async function valider() {
    setErreur(null);
    if (!mode) return setErreur("Choisissez le mode de règlement.");
    if (!client) return setErreur("Rattachez la commande à un client.");

    setEnCours(true);
    const res = await commanderSurMesure({
      cle_idempotence: cle,
      article_id: article.id,
      client_id: client.id,
      choix,
      mode: mode as "especes" | "twint" | "carte" | "facture_client",
      montant_recu: mode === "especes" ? lireMontant(recu) : null,
      creer_facture_libre: forcerFactureLibre,
      notes,
    });
    setEnCours(false);

    if (res.error) {
      setErreur(res.error);
      if (res.proposerFactureLibre) setForcerFactureLibre(false);
      return;
    }

    setFaite({
      id: res.id!,
      numero: res.numero!,
      rendu: res.rendu ?? null,
      arrondi: res.arrondi ?? 0,
      datePromise: res.datePromise ?? null,
    });
    setEtape("fait");
  }

  if (etape === "fait" && faite) {
    return (
      <div style={{ maxWidth: 520, margin: "0 auto", display: "grid", gap: 12 }}>
        <p style={{ fontSize: 44, textAlign: "center", margin: 0 }}>✅</p>
        <h2 style={{ color: MARINE, fontSize: 22, fontWeight: 700, textAlign: "center", margin: 0 }}>
          {faite.numero}
        </h2>
        <p style={{ color: SOUS, fontSize: 16, textAlign: "center", margin: 0 }}>
          {chf(encaissement.aRegler)} — {MODES_CAISSE.find((m) => m.valeur === mode)?.libelle}
          {faite.datePromise && ` · promise pour le ${formatDateFR(faite.datePromise)}`}
        </p>
        {faite.rendu !== null && (
          <p style={{ color: "#1F6E5B", fontSize: 26, fontWeight: 700, textAlign: "center", margin: 0 }}>
            Rendu : {faite.rendu.toFixed(2)}
          </p>
        )}
        {faite.arrondi !== 0 && (
          <p style={{ color: SOUS, fontSize: 14, textAlign: "center", margin: 0 }}>
            Arrondi des espèces : {faite.arrondi > 0 ? "+" : ""}{faite.arrondi.toFixed(2)}
          </p>
        )}

        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <Link href="/boutique/commandes" style={{
            minHeight: CIBLE, borderRadius: 14, backgroundColor: VERT, color: "#FFFFFF",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, fontWeight: 700, textDecoration: "none",
          }}>
            Voir les commandes
          </Link>
          <Link href="/boutique/caisse" style={{
            ...boutonSecondaire, minHeight: CIBLE, display: "flex",
            alignItems: "center", justifyContent: "center", textDecoration: "none",
          }}>
            Retour à la caisse
          </Link>
        </div>
      </div>
    );
  }

  if (etape === "paiement") {
    return (
      <div style={{ maxWidth: 520, margin: "0 auto", display: "grid", gap: 16 }}>
        <div>
          <h2 style={{ color: MARINE, fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>
            Encaisser la commande
          </h2>
          <p style={{ color: SOUS, fontSize: 15, margin: 0 }}>
            {article.nom} — {chf(prix)} · {delai} jours ouvrables
          </p>
        </div>

        <div>
          <label htmlFor="client" style={{ display: "block", fontSize: 14, fontWeight: 600, color: MARINE, marginBottom: 6 }}>
            Client (obligatoire — la commande doit pouvoir se rappeler)
          </label>
          <input id="client" type="search" value={recherche}
            onChange={(e) => chercher(e.target.value)}
            placeholder="Nom du client…" style={champ} />
          <div style={{ display: "grid", gap: 8, marginTop: 8, maxHeight: 220, overflowY: "auto" }}>
            {clients.map((c) => (
              <button key={c.id} type="button"
                onClick={() => { setClient(c); setErreur(null); }}
                style={{
                  minHeight: 48, borderRadius: 12, padding: "8px 14px", textAlign: "left",
                  border: client?.id === c.id ? `2px solid ${VERT}` : BORDURE,
                  backgroundColor: "#FFFFFF", fontFamily: "inherit", cursor: "pointer",
                }}>
                <span style={{ display: "block", color: MARINE, fontSize: 15, fontWeight: 700 }}>{c.nom}</span>
                {c.email && <span style={{ display: "block", color: SOUS, fontSize: 13 }}>{c.email}</span>}
              </button>
            ))}
          </div>
          {client && (
            <p style={{ color: "#1F6E5B", fontSize: 14, margin: "8px 0 0", fontWeight: 600 }}>
              Commande au nom de {client.nom}.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="notes" style={{ display: "block", fontSize: 14, fontWeight: 600, color: MARINE, marginBottom: 6 }}>
            Note d&apos;atelier (facultative)
          </label>
          <textarea id="notes" value={notes} rows={2}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Prévoir la boucle dorée, cliente pressée…"
            style={{ ...champ, minHeight: 72, resize: "vertical" }} />
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {MODES_CAISSE.filter((m) => m.valeur !== "facture_client" || peutFacturer).map((m) => (
            <button key={m.valeur} type="button"
              onClick={() => { setMode(m.valeur); setErreur(null); }}
              style={{
                minHeight: CIBLE + 4, borderRadius: 14, fontSize: 17, fontWeight: 700,
                fontFamily: "inherit", cursor: "pointer", textAlign: "left", padding: "0 16px",
                border: mode === m.valeur ? `2px solid ${VERT}` : BORDURE,
                backgroundColor: mode === m.valeur ? "#F1F8F6" : "#FFFFFF", color: MARINE,
              }}>
              {m.icone} {m.libelle}
            </button>
          ))}
        </div>

        {mode === "especes" && (
          <div>
            {encaissement.arrondi !== 0 && (
              <p style={{ color: SOUS, fontSize: 14, margin: "0 0 8px" }}>
                Arrondi aux 5 centimes : {encaissement.arrondi > 0 ? "+" : ""}
                {encaissement.arrondi.toFixed(2)} — à encaisser{" "}
                <strong style={{ color: MARINE }}>{chf(encaissement.aRegler)}</strong>.
              </p>
            )}
            <label htmlFor="recu" style={{ display: "block", fontSize: 14, fontWeight: 600, color: MARINE, marginBottom: 6 }}>
              Reçu du client
            </label>
            <input id="recu" type="text" inputMode="decimal" value={recu}
              onChange={(e) => setRecu(e.target.value)}
              placeholder={encaissement.aRegler.toFixed(2)}
              style={{ ...champ, fontSize: 22, fontWeight: 700 }} />
            <p aria-live="polite" style={{
              marginTop: 10, marginBottom: 0, fontSize: 20, fontWeight: 700,
              color: rendu === null ? SOUS : "#1F6E5B",
            }}>
              {rendu === null ? "Rendu : —" : `Rendu : ${rendu.toFixed(2)}`}
            </p>
          </div>
        )}

        {mode === "facture_client" && client && (
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, color: MARINE }}>
            <input type="checkbox" checked={forcerFactureLibre}
              onChange={(e) => setForcerFactureLibre(e.target.checked)}
              style={{ width: 22, height: 22 }} />
            Créer une facture libre si le client n&apos;en a pas d&apos;ouverte
          </label>
        )}

        {erreur && (
          <p role="alert" style={{
            backgroundColor: "#FDECEC", color: "#8A1F1F", border: "1px solid #F0C2C2",
            borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 600, margin: 0,
          }}>
            ⚠️ {erreur}
          </p>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={valider} disabled={enCours || !mode || !client}
            style={{
              flex: 1, minHeight: CIBLE + 4, borderRadius: 14, border: "none",
              backgroundColor: enCours || !mode || !client ? "#B9CFC9" : VERT,
              color: "#FFFFFF", fontSize: 18, fontWeight: 700, fontFamily: "inherit",
              cursor: enCours ? "wait" : "pointer",
            }}>
            {enCours ? "Enregistrement…" : `Valider ${chf(encaissement.aRegler)}`}
          </button>
          <button type="button" onClick={() => { setEtape("configuration"); setErreur(null); }}
            style={{ ...boutonSecondaire, minHeight: CIBLE + 4, padding: "0 18px" }}>
            Retour
          </button>
        </div>
      </div>
    );
  }

  return (
    <Configurateur
      article={article}
      groupes={groupes}
      libelleValidation="Encaisser la commande"
      onValider={(c, resume) => {
        setChoix(c);
        setPrix(resume.prix);
        setDelai(resume.delai);
        setEtape("paiement");
      }}
    />
  );
}

function nouvelleCle(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
