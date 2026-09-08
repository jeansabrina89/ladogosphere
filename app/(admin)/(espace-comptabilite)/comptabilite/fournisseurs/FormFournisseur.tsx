"use client";

import { useActionState } from "react";
import {
  enregistrerFournisseur,
  basculerActifFournisseur,
  supprimerFournisseur,
  type EtatFournisseur,
} from "./actions";
import { CATEGORIES_DEPENSE } from "@/src/lib/depensesLogique";

const INITIAL: EtatFournisseur = { erreur: null };

const MARINE = "#1B2B5E";
const BORDURE = "1px solid rgba(27,43,94,0.16)";

const champ: React.CSSProperties = {
  width: "100%", minHeight: 48, padding: "10px 14px", border: BORDURE,
  borderRadius: 12, fontSize: 16, color: MARINE, backgroundColor: "#FFFFFF",
  fontFamily: "inherit", boxSizing: "border-box",
};
const etiquette: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600, color: MARINE, marginBottom: 6,
};

function Erreur({ texte }: { texte: string | null }) {
  if (!texte) return null;
  return (
    <p
      aria-live="polite"
      style={{
        backgroundColor: "#FDECEC", color: "#8A1F1F", border: "1px solid #F0C2C2",
        borderRadius: 12, padding: "10px 12px", fontSize: 14, fontWeight: 600, margin: "10px 0 0",
      }}
    >
      ⚠️ {texte}
    </p>
  );
}

export type FournisseurExistant = {
  id: string;
  nom: string;
  adresse: string | null;
  npa: string | null;
  localite: string | null;
  email: string | null;
  telephone: string | null;
  iban: string | null;
  compte_charge_defaut: string | null;
  notes: string | null;
  actif: boolean;
};

export default function FormFournisseur({ fournisseur }: { fournisseur?: FournisseurExistant }) {
  const [etat, action, enCours] = useActionState(enregistrerFournisseur, INITIAL);

  return (
    <form action={action} style={{ display: "grid", gap: 16 }}>
      {fournisseur && <input type="hidden" name="id" value={fournisseur.id} />}

      <div>
        <label htmlFor="nom" style={etiquette}>Nom</label>
        <input id="nom" name="nom" defaultValue={fournisseur?.nom ?? ""} style={champ} required />
      </div>

      <div>
        <label htmlFor="compte_charge_defaut" style={etiquette}>Catégorie habituelle</label>
        <select
          id="compte_charge_defaut"
          name="compte_charge_defaut"
          defaultValue={fournisseur?.compte_charge_defaut ?? ""}
          style={champ}
        >
          <option value="">— Aucune —</option>
          {CATEGORIES_DEPENSE.map((c) => (
            <option key={c.compte} value={c.compte}>{c.libelle} ({c.compte})</option>
          ))}
        </select>
        <p style={{ fontSize: 12, color: "rgba(27,43,94,0.55)", marginTop: 6 }}>
          Elle présélectionnera la catégorie à la saisie d&apos;une dépense.
        </p>
      </div>

      <div>
        <label htmlFor="adresse" style={etiquette}>Adresse</label>
        <input id="adresse" name="adresse" defaultValue={fournisseur?.adresse ?? ""} style={champ} />
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "120px 1fr" }}>
        <div>
          <label htmlFor="npa" style={etiquette}>NPA</label>
          <input id="npa" name="npa" defaultValue={fournisseur?.npa ?? ""} style={champ} inputMode="numeric" />
        </div>
        <div>
          <label htmlFor="localite" style={etiquette}>Localité</label>
          <input id="localite" name="localite" defaultValue={fournisseur?.localite ?? ""} style={champ} />
        </div>
      </div>

      <div>
        <label htmlFor="email" style={etiquette}>E-mail</label>
        <input id="email" name="email" type="email" defaultValue={fournisseur?.email ?? ""} style={champ} />
      </div>

      <div>
        <label htmlFor="telephone" style={etiquette}>Téléphone</label>
        <input id="telephone" name="telephone" type="tel" defaultValue={fournisseur?.telephone ?? ""} style={champ} />
      </div>

      <div>
        <label htmlFor="iban" style={etiquette}>IBAN</label>
        <input id="iban" name="iban" defaultValue={fournisseur?.iban ?? ""} style={champ} placeholder="CH.." />
      </div>

      <div>
        <label htmlFor="notes" style={etiquette}>Notes</label>
        <textarea id="notes" name="notes" defaultValue={fournisseur?.notes ?? ""} rows={3} style={{ ...champ, minHeight: 90 }} />
      </div>

      <button
        type="submit"
        disabled={enCours}
        style={{
          minHeight: 52, borderRadius: 14, border: "none", backgroundColor: "#2E8B7E",
          color: "#FFFFFF", fontSize: 16, fontWeight: 700, fontFamily: "inherit",
          cursor: enCours ? "wait" : "pointer",
        }}
      >
        {enCours ? "Enregistrement…" : fournisseur ? "Enregistrer" : "Créer le fournisseur"}
      </button>

      <Erreur texte={etat.erreur} />
    </form>
  );
}

/** Désactivation — jamais de suppression quand des dépenses existent. */
export function BoutonActivation({ id, actif }: { id: string; actif: boolean }) {
  const [etat, action, enCours] = useActionState(basculerActifFournisseur, INITIAL);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="actif" value={actif ? "false" : "true"} />
      <button
        type="submit"
        disabled={enCours}
        style={{
          minHeight: 48, padding: "0 18px", borderRadius: 12, border: BORDURE,
          backgroundColor: "#FFFFFF", color: actif ? "#A8453A" : "#1F6E5B",
          fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
        }}
      >
        {enCours ? "…" : actif ? "Désactiver" : "Réactiver"}
      </button>
      <Erreur texte={etat.erreur} />
    </form>
  );
}

export function BoutonSupprimerFournisseur({ id }: { id: string }) {
  const [etat, action, enCours] = useActionState(supprimerFournisseur, INITIAL);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={enCours}
        style={{
          minHeight: 48, padding: "0 18px", borderRadius: 12, border: BORDURE,
          backgroundColor: "#FFFFFF", color: "#A8453A", fontSize: 14, fontWeight: 700,
          fontFamily: "inherit", cursor: "pointer",
        }}
      >
        {enCours ? "…" : "Supprimer"}
      </button>
      <Erreur texte={etat.erreur} />
    </form>
  );
}
