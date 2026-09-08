"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  optionsRemise,
  totalCommande,
  refusConfirmation,
  remisesParOrigine,
  prixBaseLigne,
  formatPoids,
  poidsTotal,
  MODES_PAIEMENT_LIGNE,
  adresseComplete,
  type Adresse,
  type LignePanier,
  type ModePaiement,
  type ModeRemise,
  type PalierPort,
} from "@/src/lib/venteEnLigneLogique";
import { changerQuantite, retirerDuPanier, confirmerCommande } from "../actions";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const VERT = "#1F6E5B";
const GRENAT = "#8A1F1F";
const BORDURE = "1px solid rgba(27,43,94,0.14)";
const CIBLE = 44;

export type LigneAffichee = LignePanier & { id: string };

export type ReservationChoix = {
  id: string; numero: number | null; date_debut: string; date_fin: string; chien: string | null;
};

const champ: React.CSSProperties = {
  width: "100%", minHeight: CIBLE + 4, padding: "12px 14px", border: BORDURE,
  borderRadius: 14, fontSize: 16, color: MARINE, backgroundColor: "#FFFFFF",
  fontFamily: "inherit", boxSizing: "border-box",
};

const etiquette: React.CSSProperties = {
  display: "block", fontSize: 14, fontWeight: 600, color: MARINE, marginBottom: 6,
};

const rond: React.CSSProperties = {
  width: CIBLE, height: CIBLE, flexShrink: 0, borderRadius: 12, border: BORDURE,
  backgroundColor: "#FFFFFF", color: MARINE, fontSize: 22, fontWeight: 700,
  fontFamily: "inherit", cursor: "pointer", lineHeight: 1,
};

const chf = (n: number) => `${n.toFixed(2)} CHF`;

/**
 * Le panier, et tout ce qui mène à la commande.
 *
 * Le total est visible en permanence, collé en bas avec le bouton : sur un
 * téléphone, on ne fait pas remonter le client pour qu'il voie ce qu'il paie.
 * Les frais de port sont chiffrés AVANT la validation, jamais découverts après.
 */
export default function Panier({
  lignes,
  grillePort,
  poidsMaxGrammes,
  delaiJours,
  reservations,
  adresseClient,
}: {
  lignes: LigneAffichee[];
  grillePort: PalierPort[];
  poidsMaxGrammes: number;
  delaiJours: number;
  reservations: ReservationChoix[];
  adresseClient: Partial<Adresse> | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ModeRemise | null>(null);
  const [resa, setResa] = useState(reservations[0]?.id ?? "");
  const [paiement, setPaiement] = useState<ModePaiement | null>(null);
  const [adresse, setAdresse] = useState<Partial<Adresse>>(adresseClient ?? {});
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Une clé par visite du panier : le double clic tombe sur la même.
  const [cle] = useState(() => `panier-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

  const contexte = {
    lignes,
    reservationAVenir: reservations.length > 0,
    grillePort,
    poidsMaxGrammes,
  };
  const options = optionsRemise(contexte);
  const choisie = options.find((o) => o.valeur === mode) ?? null;
  // Les remises sont déjà DANS les lignes : le total ne fait que les
  // additionner pour les montrer, il ne les retire pas une seconde fois.
  const total = totalCommande({ lignes, fraisPort: choisie?.frais ?? 0 });

  const refus = refusConfirmation({
    lignes, mode, contexte, modePaiement: paiement,
    adresseComplete: mode === "postal" ? adresseComplete(adresse) : true,
  });

  async function agir(action: Promise<{ error?: string }>) {
    setEnCours(true);
    const res = await action;
    setEnCours(false);
    setErreur(res.error ?? null);
    if (!res.error) router.refresh();
  }

  if (lignes.length === 0) {
    return (
      <p style={{ color: SOUS, fontSize: 16, margin: 0 }}>
        Votre panier est vide.{" "}
        <Link href="/catalogue" style={{ color: VERT, fontWeight: 700 }}>
          Voir la boutique
        </Link>
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: 20, paddingBottom: 150 }}>
      {erreur && (
        <p role="alert" style={{
          backgroundColor: "#FDECEC", color: GRENAT, border: "1px solid #F0C2C2",
          borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 600, margin: 0,
        }}>
          {erreur}
        </p>
      )}

      {/* ── Les articles ── */}
      <section style={{ display: "grid", gap: 10 }}>
        {lignes.map((l) => {
          const surMesure = l.type_article === "personnalisable";
          const manque =
            !surMesure && l.stock_disponible !== null && l.stock_disponible !== undefined &&
            Number(l.stock_disponible) < Number(l.quantite);

          return (
            <div key={l.id} style={{
              border: manque ? `2px solid ${GRENAT}` : BORDURE, borderRadius: 14,
              backgroundColor: "#FFFFFF", padding: 12,
              display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
            }}>
              <span style={{ flex: "1 1 180px", minWidth: 0, overflowWrap: "anywhere" }}>
                <span style={{ display: "block", color: MARINE, fontSize: 16, fontWeight: 600 }}>
                  {l.libelle}
                </span>
                <span style={{ display: "block", color: SOUS, fontSize: 14 }}>
                  {/* Le prix barré est le prix de base RÉEL de l'article, celui
                      pratiqué hors action — jamais un « prix habituel » gonflé. */}
                  {prixBaseLigne(l) > Number(l.prix_unitaire) && (
                    <span style={{ textDecoration: "line-through", marginRight: 6 }}>
                      {chf(prixBaseLigne(l))}
                    </span>
                  )}
                  {chf(Number(l.prix_unitaire))} l&apos;unité
                  {l.expediable === false ? " · non expédiable" : ""}
                </span>
                {l.remise_libelle && (
                  <span style={{ display: "block", color: VERT, fontSize: 14, fontWeight: 700 }}>
                    {l.remise_libelle}
                  </span>
                )}
                {manque && (
                  <span style={{ display: "block", color: GRENAT, fontSize: 14, fontWeight: 600 }}>
                    Il n&apos;en reste que {l.stock_disponible} : ajustez la quantité ou retirez-le.
                  </span>
                )}
              </span>

              <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {!surMesure && (
                  <>
                    <button type="button" style={rond} disabled={enCours}
                      aria-label={`Un ${l.libelle} de moins`}
                      onClick={() => agir(changerQuantite(l.id, Number(l.quantite) - 1))}>−</button>
                    <span aria-live="polite" style={{
                      minWidth: 32, textAlign: "center", color: MARINE, fontSize: 18, fontWeight: 700,
                    }}>
                      {Number(l.quantite)}
                    </span>
                    <button type="button" style={rond} disabled={enCours}
                      aria-label={`Un ${l.libelle} de plus`}
                      onClick={() => agir(changerQuantite(l.id, Number(l.quantite) + 1))}>+</button>
                  </>
                )}
                <span style={{
                  minWidth: 86, textAlign: "right", color: MARINE, fontSize: 16, fontWeight: 700,
                }}>
                  {chf(Number(l.quantite) * Number(l.prix_unitaire))}
                </span>
                <button type="button" disabled={enCours}
                  aria-label={`Retirer ${l.libelle} du panier`}
                  style={{ ...rond, marginLeft: 8, color: GRENAT, fontSize: 18 }}
                  onClick={() => agir(retirerDuPanier(l.id))}>🗑️</button>
              </span>
            </div>
          );
        })}
        <p style={{ color: SOUS, fontSize: 13, margin: 0 }}>
          Poids du panier : {formatPoids(poidsTotal(lignes))}
        </p>
      </section>

      {/* ── Comment le recevoir ── */}
      <section style={{ display: "grid", gap: 10 }}>
        <h2 style={{ color: MARINE, fontSize: 18, fontWeight: 700, margin: 0 }}>
          Comment souhaitez-vous le recevoir ?
        </h2>
        {options.map((o) => (
          <div key={o.valeur}>
            <button
              type="button"
              disabled={!o.disponible}
              aria-pressed={mode === o.valeur}
              onClick={() => setMode(o.valeur)}
              style={{
                width: "100%", minHeight: CIBLE + 12, padding: "12px 14px", textAlign: "left",
                borderRadius: 14,
                border: mode === o.valeur ? `2px solid ${VERT}` : BORDURE,
                backgroundColor: !o.disponible ? "#F2F0EC" : mode === o.valeur ? "#F1F8F6" : "#FFFFFF",
                color: o.disponible ? MARINE : SOUS,
                fontSize: 16, fontWeight: mode === o.valeur ? 700 : 500,
                fontFamily: "inherit", cursor: o.disponible ? "pointer" : "not-allowed",
                display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center",
              }}
            >
              <span>{mode === o.valeur ? "✓ " : ""}{o.libelle}</span>
              <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                {o.frais === null ? "—" : o.frais === 0 ? "Gratuit" : chf(o.frais)}
              </span>
            </button>
            {o.raison && (
              <p style={{ color: SOUS, fontSize: 14, margin: "4px 0 0" }}>{o.raison}</p>
            )}
          </div>
        ))}

        {mode === "depart_chien" && reservations.length > 1 && (
          <div>
            <label htmlFor="resa" style={etiquette}>À quel départ ?</label>
            <select id="resa" value={resa} onChange={(e) => setResa(e.target.value)} style={champ}>
              {reservations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.chien ?? "Séjour"} — du {r.date_debut} au {r.date_fin}
                </option>
              ))}
            </select>
          </div>
        )}

        {mode === "retrait" && (
          <p style={{ color: SOUS, fontSize: 14, margin: 0 }}>
            📍 À retirer à la pension, aux heures d&apos;ouverture. Nous vous prévenons dès que
            c&apos;est prêt — comptez {delaiJours} jour{delaiJours > 1 ? "s" : ""} ouvrable
            {delaiJours > 1 ? "s" : ""}.
          </p>
        )}

        {mode === "postal" && (
          <div style={{ display: "grid", gap: 10 }}>
            <h3 style={{ color: MARINE, fontSize: 16, fontWeight: 700, margin: 0 }}>
              Adresse de livraison
            </h3>
            {([
              ["nom", "Nom et prénom"],
              ["rue", "Rue et numéro"],
              ["npa", "NPA"],
              ["localite", "Localité"],
            ] as const).map(([cle, libelle]) => (
              <div key={cle}>
                <label htmlFor={`adr-${cle}`} style={etiquette}>{libelle}</label>
                <input
                  id={`adr-${cle}`}
                  type="text"
                  value={adresse[cle] ?? ""}
                  onChange={(e) => setAdresse({ ...adresse, [cle]: e.target.value })}
                  style={champ}
                  autoComplete={cle === "npa" ? "postal-code" : cle === "localite" ? "address-level2" : "street-address"}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Comment payer ── */}
      <section style={{ display: "grid", gap: 10 }}>
        <h2 style={{ color: MARINE, fontSize: 18, fontWeight: 700, margin: 0 }}>
          Comment souhaitez-vous payer ?
        </h2>
        {MODES_PAIEMENT_LIGNE.map((m) => (
          <div key={m.valeur}>
            <button
              type="button"
              disabled={!m.actif}
              aria-pressed={paiement === m.valeur}
              onClick={() => setPaiement(m.valeur)}
              style={{
                width: "100%", minHeight: CIBLE + 12, padding: "12px 14px", textAlign: "left",
                borderRadius: 14,
                border: paiement === m.valeur ? `2px solid ${VERT}` : BORDURE,
                backgroundColor: !m.actif ? "#F2F0EC" : paiement === m.valeur ? "#F1F8F6" : "#FFFFFF",
                color: m.actif ? MARINE : SOUS,
                fontSize: 16, fontWeight: paiement === m.valeur ? 700 : 500,
                fontFamily: "inherit", cursor: m.actif ? "pointer" : "not-allowed",
              }}
            >
              {paiement === m.valeur ? "✓ " : ""}{m.libelle}
            </button>
            <p style={{ color: SOUS, fontSize: 14, margin: "4px 0 0" }}>{m.aide}</p>
          </div>
        ))}
      </section>

      {/* ── Le compte, ligne par ligne ── */}
      <section style={{
        border: BORDURE, borderRadius: 16, backgroundColor: "#FFFFFF", padding: 14,
        display: "grid", gap: 6,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: SOUS, fontSize: 15 }}>
          <span>Articles</span><span>{chf(total.sousTotal)}</span>
        </div>
        {/* Chaque remise est nommée par son ORIGINE : « Action du mois −20 % »
            n'est pas « Remise membre −10 % », et le client doit savoir laquelle
            il a eue. Les lignes qui partagent une même origine se regroupent. */}
        {remisesParOrigine(lignes).map((r) => (
          <div key={r.libelle}
            style={{ display: "flex", justifyContent: "space-between", color: VERT, fontSize: 15, fontWeight: 600 }}>
            <span>{r.libelle}</span>
            <span>−{chf(r.montant)}</span>
          </div>
        ))}
        {total.port > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", color: SOUS, fontSize: 15 }}>
            <span>Frais de port</span><span>{chf(total.port)}</span>
          </div>
        )}
        <div style={{
          display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 10,
          borderTop: BORDURE, color: MARINE, fontSize: 20, fontWeight: 700,
        }}>
          <span>Prix TTC</span><span>{chf(total.aPayer)}</span>
        </div>
      </section>

      {/* ── Le total et la validation, collés en bas ── */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0,
        padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
        backgroundColor: "rgba(245,240,232,0.97)", borderTop: BORDURE,
        display: "flex", gap: 12, alignItems: "center", zIndex: 30,
      }}>
        <span style={{ flex: "0 0 auto" }}>
          <span style={{ display: "block", color: SOUS, fontSize: 12 }}>Prix TTC</span>
          <span style={{ display: "block", color: MARINE, fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>
            {chf(total.aPayer)}
          </span>
        </span>
        <div style={{ flex: 1 }}>
          <button
            type="button"
            disabled={!!refus || enCours}
            onClick={async () => {
              setEnCours(true);
              const res = await confirmerCommande({
                mode_remise: mode!,
                reservation_id: mode === "depart_chien" ? resa || null : null,
                adresse: mode === "postal" ? adresse : null,
                mode_paiement: paiement!,
                cle_idempotence: cle,
              });
              setEnCours(false);
              if (res.error) {
                setErreur(res.error);
                // Les prix ont bougé : le panier corrigé doit apparaître avant
                // que le client ne revalide.
                if (res.recalcule) router.refresh();
                return;
              }
              router.push("/mon-compte/commandes");
            }}
            style={{
              width: "100%", minHeight: CIBLE + 8, borderRadius: 14, border: "none",
              backgroundColor: !refus && !enCours ? VERT : "#B9CFC9", color: "#FFFFFF",
              fontSize: 17, fontWeight: 700, fontFamily: "inherit",
              cursor: !refus && !enCours ? "pointer" : "not-allowed",
            }}
          >
            {enCours ? "Enregistrement…" : "Valider ma commande"}
          </button>
          {refus && (
            <p style={{ color: GRENAT, fontSize: 13, margin: "6px 0 0", textAlign: "center" }}>
              {refus}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
