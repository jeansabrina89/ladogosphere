"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  libelleModeRemise,
  libelleModePaiement,
  libelleStatutLigne,
  formatAdresse,
  statutSortie,
} from "@/src/lib/venteEnLigneLogique";
import {
  changerStatutPreparation,
  remettreCommande,
  annulerCommande,
} from "./actions";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const VERT = "#1F6E5B";
const GRENAT = "#8A1F1F";
const BORDURE = "1px solid rgba(27,43,94,0.14)";
const CIBLE = 44;

const bouton: React.CSSProperties = {
  minHeight: CIBLE, padding: "10px 14px", borderRadius: 12, border: BORDURE,
  backgroundColor: "#FFFFFF", color: MARINE, fontSize: 15, fontWeight: 600,
  fontFamily: "inherit", cursor: "pointer",
};

const boutonPrincipal: React.CSSProperties = {
  ...bouton, backgroundColor: VERT, borderColor: VERT, color: "#FFFFFF",
};

const champ: React.CSSProperties = {
  minHeight: CIBLE, padding: "10px 12px", borderRadius: 12, border: BORDURE,
  fontSize: 15, color: MARINE, backgroundColor: "#FFFFFF", fontFamily: "inherit",
};

const chf = (n: number) => `${Number(n).toFixed(2)} CHF`;

export type CommandeAffichee = {
  id: string;
  numero: string | null;
  statut: string;
  mode_remise: string | null;
  mode_paiement: string | null;
  reservation_id: string | null;
  adresse_livraison: Record<string, string> | null;
  frais_port: number;
  remise_membre: number;
  montant_total: number;
  facture_id: string | null;
  vente_id: string | null;
  numero_suivi: string | null;
  motif_annulation: string | null;
  confirmee_le: string | null;
  client: { id: string; prenom: string | null; nom: string | null } | null;
  lignes: { id: string; libelle: string; quantite: number; montant: number }[];
  reservation: { numero: number | null; date_fin: string; chien: string | null } | null;
};

/**
 * Une commande en ligne, côté pension : ce qu'elle contient, comment elle part,
 * et les deux ou trois gestes qui la font avancer.
 */
export default function CarteCommandeEnLigne({ commande }: { commande: CommandeAffichee }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);
  const [mode, setMode] = useState("especes");
  const [suivi, setSuivi] = useState(commande.numero_suivi ?? "");
  const [ouvert, setOuvert] = useState(false);

  const facturee = commande.mode_paiement === "facture" && !!commande.facture_id;
  const sortie = statutSortie(commande.mode_remise as "retrait" | "depart_chien" | "postal" | null);
  const close = commande.statut === "remise" || commande.statut === "expediee"
    || commande.statut === "annulee";

  async function agir(action: Promise<{ error?: string; message?: string }>) {
    setEnCours(true);
    const res = await action;
    setEnCours(false);
    setErreur(res.error ?? null);
    setAvis(res.error ? null : res.message ?? null);
    if (!res.error) router.refresh();
  }

  return (
    <div style={{ border: BORDURE, borderRadius: 16, backgroundColor: "#FFFFFF", padding: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <span style={{ flex: "1 1 180px", minWidth: 0, color: MARINE, fontSize: 17, fontWeight: 700 }}>
          {commande.numero ?? "Commande"}
          <span style={{ color: SOUS, fontSize: 15, fontWeight: 400 }}>
            {" "}— {commande.client ? `${commande.client.prenom ?? ""} ${commande.client.nom ?? ""}`.trim() : "client inconnu"}
          </span>
        </span>
        <span style={{ color: MARINE, fontSize: 17, fontWeight: 700 }}>
          {chf(commande.montant_total)}
        </span>
      </div>

      <p style={{ color: SOUS, fontSize: 14, margin: "2px 0 10px" }}>
        {libelleStatutLigne(commande.statut)} · {libelleModeRemise(commande.mode_remise)} ·{" "}
        {libelleModePaiement(commande.mode_paiement)}
        {facturee ? " (facture émise)" : ""}
      </p>

      {commande.reservation && (
        <p style={{
          color: "#6E5410", backgroundColor: "#F4EAC9", border: "1px solid #C9A84C",
          borderRadius: 10, padding: "8px 10px", fontSize: 14, fontWeight: 600, margin: "0 0 10px",
        }}>
          🐕 À remettre au départ de {commande.reservation.chien ?? "son chien"}, le{" "}
          {commande.reservation.date_fin}
          {commande.reservation.numero ? ` (réservation nº ${commande.reservation.numero})` : ""}.
        </p>
      )}

      {commande.mode_remise === "postal" && commande.adresse_livraison && (
        <p style={{ color: MARINE, fontSize: 14, margin: "0 0 10px", whiteSpace: "pre-line" }}>
          📮 {formatAdresse(commande.adresse_livraison)}
        </p>
      )}

      <ul style={{ listStyle: "none", margin: "0 0 10px", padding: 0 }}>
        {commande.lignes.map((l) => (
          <li key={l.id} style={{
            borderTop: BORDURE, padding: "6px 0",
            display: "flex", gap: 10, justifyContent: "space-between",
          }}>
            <span style={{ color: MARINE, fontSize: 15, overflowWrap: "anywhere" }}>
              {l.quantite} × {l.libelle}
            </span>
            <span style={{ color: SOUS, fontSize: 15, whiteSpace: "nowrap" }}>{chf(l.montant)}</span>
          </li>
        ))}
      </ul>

      {(commande.remise_membre > 0 || commande.frais_port > 0) && (
        <p style={{ color: SOUS, fontSize: 14, margin: "0 0 10px" }}>
          {commande.remise_membre > 0 ? `Remise membre −${chf(commande.remise_membre)}` : ""}
          {commande.remise_membre > 0 && commande.frais_port > 0 ? " · " : ""}
          {commande.frais_port > 0 ? `Port ${chf(commande.frais_port)}` : ""}
        </p>
      )}

      {erreur && (
        <p role="alert" style={{ color: GRENAT, fontSize: 15, margin: "0 0 10px", fontWeight: 600 }}>{erreur}</p>
      )}
      {avis && (
        <p role="status" style={{ color: VERT, fontSize: 15, margin: "0 0 10px", fontWeight: 600 }}>{avis}</p>
      )}

      {commande.statut === "annulee" ? (
        <p style={{ color: GRENAT, fontSize: 14, margin: 0 }}>
          Annulée : {commande.motif_annulation}
        </p>
      ) : close ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {commande.vente_id && (
            <Link href={`/boutique/ventes/${commande.vente_id}`}
              style={{ ...bouton, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
              🧾 Voir la vente
            </Link>
          )}
          {commande.numero_suivi && (
            <span style={{ color: SOUS, fontSize: 14 }}>Suivi : {commande.numero_suivi}</span>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/boutique/commandes-en-ligne/${commande.id}/bon`} target="_blank"
              style={{ ...bouton, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
              🖨️ Bon de préparation
            </Link>
            {commande.statut === "confirmee" && (
              <button type="button" style={bouton} disabled={enCours}
                onClick={() => agir(changerStatutPreparation(commande.id, "en_preparation"))}>
                Commencer la préparation
              </button>
            )}
            {commande.statut === "en_preparation" && (
              <button type="button" style={bouton} disabled={enCours}
                onClick={() => agir(changerStatutPreparation(commande.id, "prete"))}>
                Marquer prête
              </button>
            )}
            <button type="button" style={{ ...bouton, marginLeft: 8, color: GRENAT }} disabled={enCours}
              aria-label={`Annuler la commande ${commande.numero ?? ""}`}
              onClick={() => {
                const motif = window.prompt("Motif de l'annulation :", "");
                if (!motif) return;
                void agir(annulerCommande(commande.id, motif));
              }}>
              Annuler
            </button>
          </div>

          {!ouvert ? (
            <button type="button" style={boutonPrincipal} onClick={() => setOuvert(true)}>
              {sortie === "expediee" ? "📦 Expédier" : "✅ Remettre au client"}
            </button>
          ) : (
            <div style={{
              border: BORDURE, borderRadius: 14, backgroundColor: "#FBF9F5", padding: 12,
              display: "grid", gap: 10,
            }}>
              {facturee ? (
                <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>
                  Cette commande est déjà facturée : rien à encaisser au comptoir, la vente sera
                  simplement portée sur la facture.
                </p>
              ) : (
                <div>
                  <label htmlFor={`mode-${commande.id}`} style={{
                    display: "block", fontSize: 14, fontWeight: 600, color: MARINE, marginBottom: 6,
                  }}>
                    Le client règle par
                  </label>
                  <select id={`mode-${commande.id}`} value={mode}
                    onChange={(e) => setMode(e.target.value)} style={champ}>
                    <option value="especes">Espèces</option>
                    <option value="twint">TWINT</option>
                    <option value="carte">Carte</option>
                    <option value="facture_client">Sur sa facture</option>
                  </select>
                </div>
              )}

              {sortie === "expediee" && (
                <div>
                  <label htmlFor={`suivi-${commande.id}`} style={{
                    display: "block", fontSize: 14, fontWeight: 600, color: MARINE, marginBottom: 6,
                  }}>
                    Numéro de suivi (facultatif)
                  </label>
                  <input id={`suivi-${commande.id}`} type="text" value={suivi}
                    onChange={(e) => setSuivi(e.target.value)} style={{ ...champ, width: "100%" }}
                    placeholder="99.00.123456.78901234" />
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" style={boutonPrincipal} disabled={enCours}
                  onClick={() => agir(remettreCommande({
                    commande_id: commande.id,
                    mode: facturee ? null : (mode as "especes" | "twint" | "carte" | "facture_client"),
                    numero_suivi: sortie === "expediee" ? suivi : null,
                  }))}>
                  {enCours ? "…" : sortie === "expediee" ? "Confirmer l'expédition" : "Confirmer la remise"}
                </button>
                <button type="button" style={bouton} onClick={() => setOuvert(false)}>Annuler</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
