"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { appliquerCategorie, appliquerPrestation } from "./actions";
import { GARDE_FOU_TAUX_LEGAUX, SECTEURS, libelleTaux } from "@/src/lib/tvaLogique";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.58)";
const BORDURE = "1px solid rgba(27,43,94,0.14)";

export type LigneCategorie = {
  categorie: string;
  libelle: string;
  articles: number;
  /** Le taux effectivement porté par les articles, ou null s'ils divergent. */
  taux: number | null;
  secteur: string | null;
  motif: string | null;
  /** Ce que la catégorie appelle par défaut. */
  tauxAttendu: number;
};

export type LignePrestation = {
  code: string;
  libelle: string;
  aide: string;
  taux: number;
  motif: string | null;
  /** Depuis quand ce taux s'applique. Les pièces d'avant gardent le leur. */
  dateDebut: string | null;
};

const champ: React.CSSProperties = {
  minHeight: 40, padding: "6px 8px", border: BORDURE, borderRadius: 10,
  fontSize: 14.5, color: MARINE, backgroundColor: "#FFFFFF", fontFamily: "inherit",
};

/**
 * Les taux facturés : par prestation, et par catégorie d'articles.
 *
 * Un taux se CHOISIT dans la liste légale — il ne se tape jamais. Un taux
 * inventé sur une facture est une faute, et un champ libre finit toujours par
 * en produire un.
 *
 * Rien ici ne touche une pièce déjà émise : les lignes ont figé le leur, et un
 * changement ne vaut que pour les pièces suivantes.
 */
export default function CategoriesTva({
  prestations,
  lignes,
  tauxLegaux,
}: {
  prestations: LignePrestation[];
  lignes: LigneCategorie[];
  tauxLegaux: number[];
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function envoyer(cle: string, fd: FormData, action: (f: FormData) => Promise<{ error?: string; message?: string }>) {
    setEnCours(cle);
    setMessage(null);
    const res = await action(fd);
    setEnCours(null);
    setMessage(res.error ?? res.message ?? null);
    if (!res.error) router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {message && (
        <p role="status" style={{ color: SOUS, fontSize: 14.5, margin: 0 }}>{message}</p>
      )}

      {/*
        Le garde-fou, à l'endroit exact où la confusion se produit : les deux
        réglages vivent sur le même écran, et rien dans leur apparence ne dit
        qu'ils ne se remplissent pas de la même façon.
      */}
      <p style={{
        backgroundColor: "#F4EAC9", color: "#6E5410", border: "1px solid #C9A84C",
        borderRadius: 12, padding: "10px 12px", fontSize: 14.5, fontWeight: 600, margin: 0,
      }}>
        ⚠️ {GARDE_FOU_TAUX_LEGAUX}
      </p>

      <section style={{ display: "grid", gap: 8 }}>
        <h3 style={{ color: MARINE, fontSize: 16, fontWeight: 700, margin: 0 }}>Prestations</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr style={{ textAlign: "left", color: SOUS, fontSize: 13 }}>
                <th style={{ padding: "6px 8px" }}>Prestation</th>
                <th style={{ padding: "6px 8px" }}>Taux</th>
                <th style={{ padding: "6px 8px" }}>Motif (à 0 %)</th>
                <th style={{ padding: "6px 8px" }}>Depuis</th>
                <th style={{ padding: "6px 8px" }} />
              </tr>
            </thead>
            <tbody>
              {prestations.map((p) => (
                <LignePrestationForm
                  key={p.code}
                  ligne={p}
                  tauxLegaux={tauxLegaux}
                  enCours={enCours === `p-${p.code}`}
                  onEnvoyer={(fd) => envoyer(`p-${p.code}`, fd, appliquerPrestation)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ display: "grid", gap: 8 }}>
        <h3 style={{ color: MARINE, fontSize: 16, fontWeight: 700, margin: 0 }}>
          Catégories d&apos;articles
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr style={{ textAlign: "left", color: SOUS, fontSize: 13 }}>
                <th style={{ padding: "6px 8px" }}>Catégorie</th>
                <th style={{ padding: "6px 8px" }}>Articles</th>
                <th style={{ padding: "6px 8px" }}>Taux</th>
                <th style={{ padding: "6px 8px" }}>Motif (à 0 %)</th>
                <th style={{ padding: "6px 8px" }}>Secteur</th>
                <th style={{ padding: "6px 8px" }} />
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <LigneCategorieForm
                  key={l.categorie}
                  ligne={l}
                  tauxLegaux={tauxLegaux}
                  enCours={enCours === `c-${l.categorie}`}
                  onEnvoyer={(fd) => envoyer(`c-${l.categorie}`, fd, appliquerCategorie)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SelectTaux({
  valeur, onChange, tauxLegaux, etiquette,
}: {
  valeur: string;
  onChange: (v: string) => void;
  tauxLegaux: number[];
  etiquette: string;
}) {
  return (
    <select value={valeur} onChange={(e) => onChange(e.target.value)} style={champ} aria-label={etiquette}>
      {tauxLegaux.map((t) => (
        <option key={t} value={t}>{libelleTaux(t)}</option>
      ))}
    </select>
  );
}

function BoutonAppliquer({ change, enCours, onClick }: {
  change: boolean; enCours: boolean; onClick: () => void;
}) {
  return (
    <button type="button" disabled={enCours || !change} onClick={onClick} style={{
      minHeight: 40, padding: "0 14px", borderRadius: 10, border: BORDURE,
      backgroundColor: change ? "#FFFFFF" : "#F2F0EC",
      color: change ? "#1F6E5B" : "rgba(27,43,94,0.35)",
      fontSize: 14, fontWeight: 600, fontFamily: "inherit",
      cursor: change && !enCours ? "pointer" : "not-allowed",
    }}>
      {enCours ? "…" : "Appliquer"}
    </button>
  );
}

function LignePrestationForm({
  ligne, tauxLegaux, enCours, onEnvoyer,
}: {
  ligne: LignePrestation;
  tauxLegaux: number[];
  enCours: boolean;
  onEnvoyer: (fd: FormData) => void;
}) {
  const [taux, setTaux] = useState(String(ligne.taux));
  const [motif, setMotif] = useState(ligne.motif ?? "");

  const change = Number(taux) !== ligne.taux || (Number(taux) === 0 && motif !== (ligne.motif ?? ""));

  return (
    <tr style={{ borderTop: BORDURE }}>
      <td style={{ padding: "8px", color: MARINE, fontSize: 14.5, fontWeight: 600 }}>
        {ligne.libelle}
        <span style={{ display: "block", color: SOUS, fontSize: 13, fontWeight: 400 }}>
          {ligne.aide}
        </span>
      </td>
      <td style={{ padding: "8px" }}>
        <SelectTaux valeur={taux} onChange={setTaux} tauxLegaux={tauxLegaux}
          etiquette={`Taux de ${ligne.libelle}`} />
      </td>
      <td style={{ padding: "8px" }}>
        {Number(taux) === 0 ? (
          <input type="text" value={motif} onChange={(e) => setMotif(e.target.value)}
            maxLength={120} placeholder="TVA non applicable (art. 21 LTVA)"
            aria-label={`Motif du 0 % de ${ligne.libelle}`}
            style={{ ...champ, minWidth: 220 }} />
        ) : (
          <span style={{ color: SOUS, fontSize: 13.5 }}>—</span>
        )}
      </td>
      <td style={{ padding: "8px", color: SOUS, fontSize: 13.5, whiteSpace: "nowrap" }}>
        {ligne.dateDebut ?? "—"}
      </td>
      <td style={{ padding: "8px" }}>
        <BoutonAppliquer change={change} enCours={enCours} onClick={() => {
          const fd = new FormData();
          fd.set("code", ligne.code);
          fd.set("taux_tva", taux);
          fd.set("motif_tva", motif);
          onEnvoyer(fd);
        }} />
      </td>
    </tr>
  );
}

function LigneCategorieForm({
  ligne, tauxLegaux, enCours, onEnvoyer,
}: {
  ligne: LigneCategorie;
  tauxLegaux: number[];
  enCours: boolean;
  onEnvoyer: (fd: FormData) => void;
}) {
  const [taux, setTaux] = useState(String(ligne.taux ?? ligne.tauxAttendu));
  const [secteur, setSecteur] = useState(ligne.secteur ?? "commerce");
  const [motif, setMotif] = useState(ligne.motif ?? "");

  const divergent = ligne.taux === null;
  const change =
    Number(taux) !== ligne.taux || secteur !== ligne.secteur ||
    (Number(taux) === 0 && motif !== (ligne.motif ?? ""));

  return (
    <tr style={{ borderTop: BORDURE }}>
      <td style={{ padding: "8px", color: MARINE, fontSize: 14.5, fontWeight: 600 }}>
        {ligne.libelle}
        {divergent && (
          <span style={{ display: "block", color: "#6E5410", fontSize: 13, fontWeight: 500 }}>
            Taux différents d&apos;un article à l&apos;autre
          </span>
        )}
      </td>
      <td style={{ padding: "8px", color: SOUS, fontSize: 14 }}>{ligne.articles}</td>
      <td style={{ padding: "8px" }}>
        <SelectTaux valeur={taux} onChange={setTaux} tauxLegaux={tauxLegaux}
          etiquette={`Taux de ${ligne.libelle}`} />
      </td>
      <td style={{ padding: "8px" }}>
        {Number(taux) === 0 ? (
          <input type="text" value={motif} onChange={(e) => setMotif(e.target.value)}
            maxLength={120} placeholder="TVA non applicable (art. 21 LTVA)"
            aria-label={`Motif du 0 % de ${ligne.libelle}`}
            style={{ ...champ, minWidth: 200 }} />
        ) : (
          <span style={{ color: SOUS, fontSize: 13.5 }}>—</span>
        )}
      </td>
      <td style={{ padding: "8px" }}>
        <select value={secteur} onChange={(e) => setSecteur(e.target.value)} style={champ}
          aria-label={`Secteur de ${ligne.libelle}`}>
          {SECTEURS.map((s) => (
            <option key={s.valeur} value={s.valeur}>{s.libelle}</option>
          ))}
        </select>
      </td>
      <td style={{ padding: "8px" }}>
        <BoutonAppliquer change={change} enCours={enCours} onClick={() => {
          const fd = new FormData();
          fd.set("categorie", ligne.categorie);
          fd.set("taux_tva", taux);
          fd.set("motif_tva", motif);
          fd.set("secteur_tdfn", secteur);
          onEnvoyer(fd);
        }} />
      </td>
    </tr>
  );
}
