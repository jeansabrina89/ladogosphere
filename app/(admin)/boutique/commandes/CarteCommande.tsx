"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { avancerCommande, envoyerCommandePrete } from "./actions";
import { formatDateFR } from "@/src/lib/dates";
import {
  STATUTS_COMMANDE,
  libelleStatutCommande,
  statutSuivant,
  type StatutCommande,
} from "@/src/lib/personnalisationLogique";

/**
 * Une commande dans le suivi de fabrication : ses choix, sa date promise, et
 * le geste suivant en une touche. Le passage à « prête » propose l'e-mail,
 * il ne l'envoie pas tout seul.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.14)";
const CIBLE = 44;

export type CommandeCarte = {
  id: string;
  numero: string | null;
  client: string;
  clientEmail: string | null;
  article: string;
  prix_total: number | string;
  date_promise: string | null;
  statut: string;
  notes: string | null;
  enRetard: boolean;
  vente_id: string | null;
  choix: {
    id: string;
    groupe_nom: string;
    valeur_libelle: string;
    valeur_texte: string | null;
    code_couleur: string | null;
  }[];
};

const bouton: React.CSSProperties = {
  minHeight: CIBLE, padding: "0 14px", borderRadius: 12, border: BORDURE,
  backgroundColor: "#FFFFFF", color: MARINE, fontSize: 15, fontWeight: 600,
  fontFamily: "inherit", cursor: "pointer",
};

export default function CarteCommande({ commande }: { commande: CommandeCarte }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);
  const [proposerEmail, setProposerEmail] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const suivant = statutSuivant(commande.statut) as StatutCommande | null;
  const couleurs = STATUTS_COMMANDE.find((s) => s.valeur === commande.statut);

  async function avancer(statut: StatutCommande) {
    setErreur(null);
    setAvis(null);
    setEnCours(true);
    const res = await avancerCommande(commande.id, statut);
    setEnCours(false);

    if (res.error) return setErreur(res.error);
    setAvis(res.message ?? null);
    if (res.proposerEmail && commande.clientEmail) setProposerEmail(true);
    router.refresh();
  }

  async function prevenir() {
    setErreur(null);
    setEnCours(true);
    const res = await envoyerCommandePrete(commande.id);
    setEnCours(false);
    if (res.error) return setErreur(res.error);
    setAvis(res.message ?? null);
    setProposerEmail(false);
  }

  return (
    <div style={{
      border: commande.enRetard ? "2px solid #A8453A" : BORDURE,
      borderRadius: 16, backgroundColor: "#FFFFFF", padding: 14,
      display: "grid", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{ color: MARINE, fontSize: 16, fontWeight: 700 }}>{commande.numero}</span>
        <span style={{
          fontSize: 12, fontWeight: 600, borderRadius: 999, padding: "2px 10px",
          backgroundColor: couleurs?.fond ?? "#EDE8DF", color: couleurs?.couleur ?? SOUS,
        }}>
          {libelleStatutCommande(commande.statut)}
        </span>
      </div>

      <div>
        <p style={{ color: MARINE, fontSize: 15, fontWeight: 600, margin: 0 }}>{commande.article}</p>
        <p style={{ color: SOUS, fontSize: 14, margin: "2px 0 0" }}>
          {commande.client} · {Number(commande.prix_total).toFixed(2)} CHF
        </p>
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
        {commande.choix.map((c) => (
          <li key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            {c.code_couleur && (
              <span aria-hidden="true" style={{
                width: 16, height: 16, flexShrink: 0, borderRadius: 4,
                backgroundColor: c.code_couleur, border: "1px solid rgba(27,43,94,0.2)",
              }} />
            )}
            <span style={{ color: SOUS }}>{c.groupe_nom} :</span>
            {/* Un texte gravé reste du texte : échappé, sauts de ligne gardés. */}
            <span style={{ color: MARINE, fontWeight: 600, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
              {c.valeur_texte ?? c.valeur_libelle}
            </span>
          </li>
        ))}
      </ul>

      {commande.notes && (
        <p style={{
          color: SOUS, fontSize: 14, margin: 0, whiteSpace: "pre-line",
          backgroundColor: "#FBF9F5", borderRadius: 10, padding: "8px 10px",
        }}>
          {commande.notes}
        </p>
      )}

      <p style={{
        color: commande.enRetard ? "#A8453A" : SOUS,
        fontSize: 14, fontWeight: commande.enRetard ? 700 : 400, margin: 0,
      }}>
        {commande.enRetard && "⚠️ "}
        {commande.date_promise ? `Promise pour le ${formatDateFR(commande.date_promise)}` : "Sans date promise"}
      </p>

      {erreur && (
        <p role="alert" style={{
          backgroundColor: "#FDECEC", color: "#8A1F1F", border: "1px solid #F0C2C2",
          borderRadius: 10, padding: "8px 10px", fontSize: 14, fontWeight: 600, margin: 0,
        }}>
          ⚠️ {erreur}
        </p>
      )}
      {avis && (
        <p role="status" style={{
          backgroundColor: "#E4F1EC", color: "#1F6E5B", border: "1px solid #B9DDD1",
          borderRadius: 10, padding: "8px 10px", fontSize: 14, fontWeight: 600, margin: 0,
        }}>
          ✅ {avis}
        </p>
      )}

      {proposerEmail && commande.clientEmail && (
        <div style={{
          border: "1px solid #C9A84C", backgroundColor: "#FFFDF6",
          borderRadius: 12, padding: 10, display: "grid", gap: 8,
        }}>
          <p style={{ color: "#6E5410", fontSize: 14, margin: 0 }}>
            Prévenir {commande.client} que sa commande est prête ?
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={prevenir} disabled={enCours}
              style={{ ...bouton, backgroundColor: "#2E8B7E", color: "#FFFFFF", border: "none" }}>
              ✉️ Envoyer l&apos;e-mail
            </button>
            <button type="button" onClick={() => setProposerEmail(false)} style={bouton}>
              Plus tard
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: BORDURE, paddingTop: 10 }}>
        {suivant && (
          <button type="button" disabled={enCours} onClick={() => avancer(suivant)}
            style={{ ...bouton, backgroundColor: "#2E8B7E", color: "#FFFFFF", border: "none" }}>
            {suivant === "en_cours" && "▶ Mettre en fabrication"}
            {suivant === "prete" && "✅ Marquer prête"}
            {suivant === "remise" && "🤝 Remise au client"}
          </button>
        )}
        {commande.statut === "en_cours" && (
          <button type="button" disabled={enCours} onClick={() => avancer("a_faire")} style={bouton}>
            ↩ Remettre à faire
          </button>
        )}
        {commande.statut !== "remise" && commande.statut !== "annulee" && (
          <button type="button" disabled={enCours} onClick={() => avancer("annulee")}
            style={{ ...bouton, color: "#A8453A" }}>
            Annuler
          </button>
        )}
        {commande.vente_id && (
          <Link href={`/boutique/ventes/${commande.vente_id}`}
            style={{ ...bouton, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            🧾 Vente
          </Link>
        )}
      </div>
    </div>
  );
}
