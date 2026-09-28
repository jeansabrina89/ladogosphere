import Link from "next/link";
import { formatHorodatage } from "@/src/lib/dates";
import AuteurGeste from "@/app/components/AuteurGeste";
import { differences } from "@/src/lib/journalGestesLogique";
import type { LigneJournal } from "@/src/lib/journalGestes";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.58)";
const VERT = "#1F6E5B";

/**
 * Une ligne du journal, et son détail dépliable.
 *
 * ── LE DÉTAIL NE MONTRE JAMAIS DE JSON ────────────────────────────────────
 *
 * « {"statut":"payee","montant":226.5} » n'est pas une information : c'est une
 * donnée qu'on demande à quelqu'un de décoder. Chaque champ se lit
 * « statut : impayee → payee », et seuls les champs qui ont BOUGÉ figurent —
 * une liste de vingt lignes dont deux ont changé cache les deux qui comptent.
 *
 * Le repli est un `<details>` du navigateur : aucun état, aucun JavaScript, et
 * il fonctionne avant même que la page soit hydratée.
 */
export default function LigneJournalGeste({ ligne }: { ligne: LigneJournal }) {
  const detail = differences(ligne.avant, ligne.apres);

  return (
    <li
      style={{
        padding: "10px 0",
        borderBottom: "1px solid rgba(27,43,94,0.08)",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", alignItems: "baseline" }}>
        <span style={{ color: SOUS, fontSize: 13.5, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {formatHorodatage(ligne.createdAt)}
        </span>
        <AuteurGeste auteur={ligne.auteur} />
        <span style={{ color: MARINE, fontSize: 15, fontWeight: 700 }}>{ligne.libelle}</span>
        {/*
          * L'objet concerné : un lien s'il existe encore, du texte sinon.
          *
          * Un article supprimé (APP 32) n'a plus de fiche — sa référence et son
          * nom viennent de la trace. Sans cela, « Article supprimé » ne dirait
          * pas lequel, et c'est justement la ligne qu'on vient relire.
          */}
        {ligne.concerne && (
          ligne.lien ? (
            <Link href={ligne.lien} style={{ color: VERT, fontSize: 15, fontWeight: 600 }}>
              {ligne.concerne}
            </Link>
          ) : (
            <span style={{ color: MARINE, fontSize: 15 }}>{ligne.concerne}</span>
          )
        )}
      </div>

      {ligne.motif && (
        <p style={{ color: SOUS, fontSize: 14, margin: "4px 0 0" }}>{ligne.motif}</p>
      )}

      {detail.length > 0 && (
        <details style={{ marginTop: 4 }}>
          <summary
            style={{ color: VERT, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
          >
            Voir le détail
          </summary>
          <dl
            style={{
              margin: "6px 0 0", display: "grid", gap: 2,
              gridTemplateColumns: "minmax(120px, auto) 1fr",
              fontSize: 13.5,
            }}
          >
            {detail.map((d) => (
              <div key={d.champ} style={{ display: "contents" }}>
                <dt style={{ color: SOUS, fontWeight: 600 }}>{d.champ}</dt>
                <dd style={{ margin: 0, color: MARINE, overflowWrap: "anywhere" }}>
                  {d.avant !== null && (
                    <span style={{ color: SOUS, textDecoration: d.sensible ? "none" : "line-through" }}>
                      {d.avant}
                    </span>
                  )}
                  {d.avant !== null && d.apres !== null && " → "}
                  {d.apres !== null && <span>{d.apres}</span>}
                  {d.avant === null && d.apres === null && "—"}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </li>
  );
}
