import {
  CHOIX_COHABITATION,
  LIBELLES_COHABITATION,
  MENTION_DECIDE_PAR_PENSION,
  type ChoixCohabitation as Choix,
} from "@/src/lib/cohabitation";

const AIDES: Record<Choix, string> = {
  partage: "Il peut être placé avec les chiens d'autres familles, selon les affinités.",
  famille: "Il ne partage son box qu'avec vos propres chiens. Réservé sans eux, il occupe le box entier et le tarif chien seul s'applique.",
  seul: "Il a son box pour lui : vous payez les deux places, au tarif chien seul en box.",
};

/**
 * Mode de cohabitation en box, déclaré par le propriétaire.
 * Quand la pension a tranché, le choix est affiché verrouillé.
 */
export default function ChoixCohabitationChamp({
  valeur,
  verrouille = false,
}: {
  valeur: Choix;
  verrouille?: boolean;
}) {
  if (verrouille) {
    return (
      <div style={{ backgroundColor: "#F5F0E8", border: "1px solid #C9A84C", borderRadius: 14, padding: 16 }}>
        <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 14, color: "#1B2B5E" }}>
          {LIBELLES_COHABITATION[valeur]}
        </p>
        <p style={{ margin: 0, fontSize: 12.5, color: "#6E5410", fontWeight: 600 }}>
          🔒 {MENTION_DECIDE_PAR_PENSION}
        </p>
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "rgba(27,43,94,0.6)" }}>
          {AIDES[valeur]}
        </p>
        {/* La valeur reste envoyée : l'action serveur la réimpose de toute façon. */}
        <input type="hidden" name="cohabitation" value={valeur} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {CHOIX_COHABITATION.map((c) => (
        <label
          key={c}
          style={{
            display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
            border: "1px solid rgba(27,43,94,0.15)", borderRadius: 14, padding: "12px 14px",
          }}
        >
          <input
            type="radio"
            name="cohabitation"
            value={c}
            defaultChecked={valeur === c}
            style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0, accentColor: "#4AAEA0" }}
          />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 600, fontSize: 14.5, color: "#1B2B5E" }}>
              {LIBELLES_COHABITATION[c]}
            </span>
            <span style={{ display: "block", fontSize: 12.5, color: "rgba(27,43,94,0.6)", marginTop: 2 }}>
              {AIDES[c]}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}
