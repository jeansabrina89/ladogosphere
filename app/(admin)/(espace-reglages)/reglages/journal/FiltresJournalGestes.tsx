"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FAMILLES, versParamsJournal, filtresDepuisParams } from "@/src/lib/journalGestesLogique";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.58)";
const BORDURE = "1px solid rgba(27,43,94,0.14)";

const champ: React.CSSProperties = {
  minHeight: 44, padding: "8px 12px", borderRadius: 12, border: BORDURE,
  fontSize: 15, color: MARINE, background: "#FFFFFF", fontFamily: "inherit",
  boxSizing: "border-box", width: "100%",
};

const etiquette: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600, color: SOUS, marginBottom: 4,
};

/**
 * Les filtres du journal : période, personne, type.
 *
 * Ils vivent dans l'ADRESSE, comme partout ailleurs dans cette application : un
 * lien filtré se partage avec le comptable, le retour arrière refait le chemin
 * en sens inverse, et un rechargement ne perd rien.
 *
 * Changer un filtre ramène TOUJOURS à la page 1 : rester en page 7 après avoir
 * réduit la liste à trois lignes afficherait une page vide, et on croirait
 * qu'il n'y a rien.
 */
export default function FiltresJournalGestes({
  personnes,
}: {
  personnes: { id: string; nom: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const actuels = filtresDepuisParams(Object.fromEntries(params.entries()));

  function changer(champ: "du" | "au" | "personne" | "famille", valeur: string) {
    const suivants = { ...actuels, [champ]: valeur === "" ? null : valeur, page: 1 };
    const qs = versParamsJournal(suivants).toString();
    router.push(qs ? `?${qs}` : "/reglages/journal");
  }

  const actifs = [actuels.du, actuels.au, actuels.personne, actuels.famille].filter(Boolean).length;

  return (
    <section
      aria-label="Filtrer le journal"
      style={{
        border: BORDURE, borderRadius: 16, background: "#FFFFFF",
        padding: 14, marginBottom: 16, display: "grid", gap: 12,
      }}
    >
      <div
        style={{
          display: "grid", gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        }}
      >
        <label>
          <span style={etiquette}>Du</span>
          <input
            type="date"
            value={actuels.du ?? ""}
            onChange={(e) => changer("du", e.target.value)}
            style={champ}
          />
        </label>
        <label>
          <span style={etiquette}>Au</span>
          <input
            type="date"
            value={actuels.au ?? ""}
            onChange={(e) => changer("au", e.target.value)}
            style={champ}
          />
        </label>
        <label>
          <span style={etiquette}>Personne</span>
          <select
            value={actuels.personne ?? ""}
            onChange={(e) => changer("personne", e.target.value)}
            style={champ}
          >
            <option value="">Tout le monde</option>
            {personnes.map((p) => (
              <option key={p.id} value={p.id}>{p.nom}</option>
            ))}
          </select>
        </label>
        <label>
          <span style={etiquette}>Type</span>
          <select
            value={actuels.famille ?? ""}
            onChange={(e) => changer("famille", e.target.value)}
            style={champ}
          >
            <option value="">Tous les types</option>
            {FAMILLES.map((f) => (
              <option key={f.valeur} value={f.valeur}>{f.libelle}</option>
            ))}
          </select>
        </label>
      </div>

      {actifs > 0 && (
        <button
          type="button"
          onClick={() => router.push("/reglages/journal")}
          style={{
            justifySelf: "start", minHeight: 44, padding: "8px 16px", borderRadius: 12,
            border: BORDURE, background: "#EDE8DF", color: MARINE,
            fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
          }}
        >
          Tout effacer ({actifs})
        </button>
      )}
    </section>
  );
}
