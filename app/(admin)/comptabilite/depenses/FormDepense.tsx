"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EntreeEnStock, { type ArticleEntree, type LigneEntree } from "@/app/components/EntreeEnStock";
import {
  CATEGORIES_DEPENSE,
  MODES_PAIEMENT,
  MESSAGE_JUSTIFICATIF_REQUIS,
  COMPTE_MARCHANDISES,
  refusFichierPiece,
} from "@/src/lib/depensesLogique";

export type FournisseurChoix = {
  id: string;
  nom: string;
  compte_charge_defaut: string | null;
};

/**
 * Saisie d'une dépense, en une seule page et pensée pour le téléphone :
 * on est debout, le ticket dans une main, l'appareil dans l'autre.
 *
 * - champs empilés, pleine largeur, hauteur de frappe 52 px ;
 * - le bouton principal est en bas, collé, atteignable au pouce ;
 * - la catégorie est un choix en français ; le numéro de compte reste affiché
 *   en petit dessous, pour contrôle ;
 * - « Valider » reste désactivé tant qu'il n'y a pas de justificatif.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.16)";

const champ: React.CSSProperties = {
  width: "100%",
  minHeight: 52,
  padding: "12px 14px",
  border: BORDURE,
  borderRadius: 14,
  fontSize: 16, // 16 px : iOS ne zoome pas au focus
  color: MARINE,
  backgroundColor: "#FFFFFF",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const etiquette: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: MARINE,
  marginBottom: 6,
};

const aide: React.CSSProperties = { fontSize: 12, color: SOUS, marginTop: 6 };

export default function FormDepense({
  fournisseurs,
  dateDuJour,
  articles,
}: {
  fournisseurs: FournisseurChoix[];
  dateDuJour: string;
  /** Catalogue actif, pour l'entrée en stock d'un achat de marchandises. */
  articles: ArticleEntree[];
}) {
  const router = useRouter();
  const champFichier = useRef<HTMLInputElement>(null);

  const [date, setDate] = useState(dateDuJour);
  const [fournisseurId, setFournisseurId] = useState("");
  const [libelle, setLibelle] = useState("");
  const [montant, setMontant] = useState("");
  const [compte, setCompte] = useState("");
  const [mode, setMode] = useState("banque");
  const [fichier, setFichier] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<"" | "brouillon" | "valider">("");
  const [entrees, setEntrees] = useState<Record<string, LigneEntree>>({});

  const categorie = useMemo(
    () => CATEGORIES_DEPENSE.find((c) => c.compte === compte) ?? null,
    [compte]
  );

  function choisirFournisseur(id: string) {
    setFournisseurId(id);
    // Le compte du fournisseur présélectionne la catégorie, sans jamais
    // écraser un choix déjà fait à la main.
    const f = fournisseurs.find((x) => x.id === id);
    if (f?.compte_charge_defaut && !compte) setCompte(f.compte_charge_defaut);
  }

  function choisirFichier(f: File | null) {
    setErreur(null);
    if (apercu) URL.revokeObjectURL(apercu);
    if (!f) {
      setFichier(null);
      setApercu(null);
      return;
    }
    const refus = refusFichierPiece({ type: f.type, size: f.size });
    if (refus) {
      setErreur(refus);
      setFichier(null);
      setApercu(null);
      return;
    }
    setFichier(f);
    setApercu(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  }

  async function envoyer(action: "brouillon" | "valider") {
    setErreur(null);
    setEnCours(action);

    const corps = new FormData();
    corps.set("date_depense", date);
    corps.set("libelle", libelle);
    corps.set("montant", montant);
    corps.set("compte_charge", compte);
    corps.set("mode_paiement", mode);
    if (fournisseurId) corps.set("fournisseur_id", fournisseurId);
    if (fichier) corps.set("fichier", fichier);
    // Les entrées en stock ne partent qu'à la validation : un brouillon ne
    // bouge pas le stock.
    if (action === "valider" && Object.keys(entrees).length > 0) {
      corps.set("entrees", JSON.stringify(
        Object.entries(entrees).map(([article_id, l]) => ({
          article_id,
          quantite: l.quantite,
          date_peremption: l.peremption || null,
        }))
      ));
    }
    corps.set("action", action);

    const r = await fetch("/api/depenses", { method: "POST", body: corps });
    const data = await r.json().catch(() => ({}));
    setEnCours("");

    if (!r.ok) {
      setErreur(data.error ?? "L'enregistrement a échoué.");
      // Le brouillon a pu être créé malgré l'échec : on y emmène l'utilisateur.
      if (data.id) router.push(`/comptabilite/depenses/${data.id}`);
      return;
    }
    // La dépense est validée ; si une entrée en stock a été refusée, on le dit
    // ici plutôt que de la laisser disparaître dans la navigation.
    if (Array.isArray(data.erreurs_stock) && data.erreurs_stock.length > 0) {
      setErreur(`Dépense enregistrée, mais une entrée en stock a été refusée : ${data.erreurs_stock[0]}`);
      return;
    }
    router.push(`/comptabilite/depenses/${data.id}`);
  }

  const complet = date && libelle.trim() && Number(montant.replace(",", ".")) > 0 && compte;
  const peutValider = !!complet && !!fichier;

  return (
    <div style={{ paddingBottom: 96 }}>
      <div style={{ display: "grid", gap: 18 }}>
        <div>
          <label htmlFor="date_depense" style={etiquette}>Date</label>
          <input
            id="date_depense" type="date" value={date} style={champ}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="fournisseur" style={etiquette}>Fournisseur (facultatif)</label>
          <select
            id="fournisseur" value={fournisseurId} style={champ}
            onChange={(e) => choisirFournisseur(e.target.value)}
          >
            <option value="">— Aucun —</option>
            {fournisseurs.map((f) => (
              <option key={f.id} value={f.id}>{f.nom}</option>
            ))}
          </select>
          <p style={aide}>
            Nouveau fournisseur ?{" "}
            <Link href="/comptabilite/fournisseurs/nouveau" style={{ color: "#1F6E5B", fontWeight: 600 }}>
              l&apos;ajouter au carnet
            </Link>
          </p>
        </div>

        <div>
          <label htmlFor="libelle" style={etiquette}>Ce que vous avez payé</label>
          <input
            id="libelle" type="text" value={libelle} style={champ}
            placeholder="Loyer des box — septembre"
            onChange={(e) => setLibelle(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="montant" style={etiquette}>Montant (CHF)</label>
          <input
            id="montant" type="text" inputMode="decimal" value={montant}
            style={{ ...champ, fontSize: 22, fontWeight: 700 }}
            placeholder="0.00"
            onChange={(e) => setMontant(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="categorie" style={etiquette}>Catégorie</label>
          <select
            id="categorie" value={compte} style={champ}
            onChange={(e) => setCompte(e.target.value)}
          >
            <option value="">— Choisir —</option>
            {CATEGORIES_DEPENSE.map((c) => (
              <option key={c.compte} value={c.compte}>{c.libelle}</option>
            ))}
          </select>
          <p style={aide}>
            {categorie ? `Compte ${categorie.compte}` : "Le numéro de compte s'affichera ici."}
          </p>
        </div>

        <div>
          <label htmlFor="mode" style={etiquette}>Payé par</label>
          <select id="mode" value={mode} style={champ} onChange={(e) => setMode(e.target.value)}>
            {MODES_PAIEMENT.map((m) => (
              <option key={m.valeur} value={m.valeur}>{m.libelle}</option>
            ))}
          </select>
        </div>

        {compte === COMPTE_MARCHANDISES && (
          <div style={{ border: BORDURE, borderRadius: 14, padding: 14, backgroundColor: "#FFFFFF" }}>
            <span style={etiquette}>Entrée en stock (facultatif)</span>
            <p style={{ ...aide, marginTop: 0, marginBottom: 12 }}>
              Cochez ce qui est arrivé. Les entrées seront enregistrées à la validation de la
              dépense. Aucune écriture supplémentaire : l&apos;achat est déjà en charge.
            </p>
            <EntreeEnStock articles={articles} lignes={entrees} onChange={setEntrees} />
          </div>
        )}

        <div>
          <span style={etiquette}>Justificatif</span>

          {apercu && (
            // Aperçu local d’un blob: URL — next/image n’a rien à optimiser ici.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={apercu}
              alt="Aperçu du justificatif"
              style={{
                width: "100%", maxHeight: 260, objectFit: "contain",
                borderRadius: 14, border: BORDURE, backgroundColor: "#FFFFFF",
                marginBottom: 10,
              }}
            />
          )}
          {fichier && !apercu && (
            <p style={{ ...aide, marginTop: 0, marginBottom: 10 }}>
              📄 {fichier.name} — {(fichier.size / 1024 / 1024).toFixed(1)} Mo
            </p>
          )}

          <input
            ref={champFichier}
            id="fichier"
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif,application/pdf"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => choisirFichier(e.target.files?.[0] ?? null)}
          />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => champFichier.current?.click()}
              style={{
                flex: "1 1 160px", minHeight: 52, borderRadius: 14,
                border: "1px dashed rgba(27,43,94,0.3)", backgroundColor: "#FFFFFF",
                color: MARINE, fontSize: 15, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {fichier ? "📷 Remplacer" : "📷 Photo ou PDF"}
            </button>
            {fichier && (
              <button
                type="button"
                onClick={() => choisirFichier(null)}
                style={{
                  flex: "0 0 auto", minHeight: 52, padding: "0 18px", borderRadius: 14,
                  border: BORDURE, backgroundColor: "#FFFFFF", color: SOUS,
                  fontSize: 15, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Retirer
              </button>
            )}
          </div>
          <p style={aide}>Photo ou PDF, 10 Mo au maximum.</p>
        </div>

        {erreur && (
          <p
            aria-live="polite"
            style={{
              backgroundColor: "#FDECEC", color: "#8A1F1F",
              border: "1px solid #F0C2C2", borderRadius: 12,
              padding: "10px 12px", fontSize: 14, fontWeight: 600, margin: 0,
            }}
          >
            ⚠️ {erreur}
          </p>
        )}
      </div>

      {/* Barre d'action collée en bas : le pouce y arrive sans changer de main. */}
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0,
          padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
          backgroundColor: "rgba(245,240,232,0.96)",
          borderTop: BORDURE,
          display: "flex", gap: 10, alignItems: "center",
          zIndex: 20,
        }}
        className="md:pl-[264px]"
      >
        <button
          type="button"
          onClick={() => envoyer("brouillon")}
          disabled={!complet || enCours !== ""}
          style={{
            flex: "0 0 auto", minHeight: 52, padding: "0 16px", borderRadius: 14,
            border: BORDURE, backgroundColor: "#FFFFFF", color: MARINE,
            fontSize: 15, fontWeight: 600, fontFamily: "inherit",
            cursor: !complet || enCours ? "not-allowed" : "pointer",
            opacity: !complet || enCours ? 0.55 : 1,
          }}
        >
          {enCours === "brouillon" ? "…" : "Brouillon"}
        </button>

        <div style={{ flex: 1 }}>
          <button
            type="button"
            onClick={() => envoyer("valider")}
            disabled={!peutValider || enCours !== ""}
            style={{
              width: "100%", minHeight: 52, borderRadius: 14, border: "none",
              backgroundColor: peutValider ? "#2E8B7E" : "#B9CFC9",
              color: "#FFFFFF", fontSize: 16, fontWeight: 700, fontFamily: "inherit",
              cursor: peutValider && !enCours ? "pointer" : "not-allowed",
            }}
          >
            {enCours === "valider" ? "Enregistrement…" : "Valider la dépense"}
          </button>
          {!fichier && (
            <p style={{ ...aide, textAlign: "center", marginTop: 6 }}>
              {MESSAGE_JUSTIFICATIF_REQUIS}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
