import Link from "next/link";
import Carte from "@/app/components/ui/Carte";
import EtatVide from "@/app/components/ui/EtatVide";
import { libelleCategorie } from "@/src/lib/depensesLogique";
import { infoUsage, usageDuCompte } from "@/src/lib/usagesFournisseurs";
import { domainesDe, infoDomaine } from "@/src/lib/domainesFournisseurs";

/**
 * APP 73 — la liste des fournisseurs, partagée par les trois espaces qui la
 * montrent : Boutique (domaine boutique), Atelier (domaine atelier) et
 * Comptabilité (tous).
 *
 * Ce qui relève de la COMPTABILITÉ — catégorie de charge, nombre de dépenses,
 * total dépensé — ne s'affiche que si la page le lui passe : la page de la
 * boutique ne le lit même pas. Une donnée qu'on ne doit pas voir ne doit pas
 * partir de la base.
 *
 * Le lien vers la fiche n'apparaît qu'à qui peut l'ouvrir (garde « Dépenses »
 * de la fiche, inchangée) : pas de porte qui se referme.
 */

export type LigneFournisseur = {
  id: string;
  nom: string;
  localite: string | null;
  email: string | null;
  telephone: string | null;
  actif: boolean;
  domaines?: unknown;
  compte_charge_defaut?: string | null;
};

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.12)";
const chf = (n: number) => `${n.toFixed(2)} CHF`;

function Pastille({ fond, texte, libelle }: { fond: string; texte: string; libelle: string }) {
  return (
    <span style={{
      display: "inline-block", marginLeft: 6, fontSize: 11, fontWeight: 600,
      padding: "1px 8px", borderRadius: 999, backgroundColor: fond, color: texte, whiteSpace: "nowrap",
    }}>
      {libelle}
    </span>
  );
}

export default function TableFournisseurs({
  liste,
  lienFiche,
  totaux,
  vide,
}: {
  liste: LigneFournisseur[];
  /** La fiche (/comptabilite/fournisseurs/[id]) s'ouvre-t-elle pour cette personne ? */
  lienFiche: boolean;
  /** Comptabilité seulement : dépenses par fournisseur. Absent = colonnes absentes. */
  totaux?: Map<string, { total: number; nb: number }>;
  vide: { titre: string; message: string };
}) {
  if (liste.length === 0) {
    return (
      <Carte>
        <EtatVide icone="🏢" titre={vide.titre} message={vide.message} />
      </Carte>
    );
  }
  const compta = !!totaux;

  return (
    <Carte>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: compta ? 620 : 480 }}>
          <thead>
            <tr style={{ color: SOUS, textAlign: "left" }}>
              <th className="py-2 font-medium">Nom</th>
              <th className="py-2 font-medium">Localité</th>
              {compta ? (
                <>
                  <th className="py-2 font-medium">Catégorie habituelle</th>
                  <th className="py-2 font-medium text-right">Dépenses</th>
                  <th className="py-2 font-medium text-right">Total</th>
                </>
              ) : (
                <th className="py-2 font-medium">Contact</th>
              )}
            </tr>
          </thead>
          <tbody>
            {liste.map((f) => {
              const t = totaux?.get(f.id) ?? { total: 0, nb: 0 };
              return (
                <tr key={f.id} style={{ borderTop: BORDURE, opacity: f.actif ? 1 : 0.5 }}>
                  <td className="py-2">
                    {lienFiche ? (
                      <Link href={`/comptabilite/fournisseurs/${f.id}`} style={{ color: MARINE, fontWeight: 700 }}>
                        {f.nom}
                      </Link>
                    ) : (
                      <span style={{ color: MARINE, fontWeight: 700 }}>{f.nom}</span>
                    )}
                    {!f.actif && <span style={{ color: SOUS, fontSize: 12 }}> — désactivé</span>}
                    {domainesDe(f).map((d) => {
                      const i = infoDomaine(d);
                      return <Pastille key={d} fond={i.fond} texte={i.texte} libelle={i.court} />;
                    })}
                    {compta && (() => {
                      const u = infoUsage(usageDuCompte(f.compte_charge_defaut ?? null));
                      return <Pastille fond={u.fond} texte={u.texte} libelle={u.libelle} />;
                    })()}
                  </td>
                  <td className="py-2" style={{ color: SOUS }}>{f.localite ?? "—"}</td>
                  {compta ? (
                    <>
                      <td className="py-2" style={{ color: SOUS }}>
                        {f.compte_charge_defaut
                          ? `${libelleCategorie(f.compte_charge_defaut)} (${f.compte_charge_defaut})`
                          : "—"}
                      </td>
                      <td className="py-2 text-right" style={{ color: SOUS }}>{t.nb}</td>
                      <td className="py-2 text-right" style={{ color: MARINE, fontWeight: 600, whiteSpace: "nowrap" }}>
                        {chf(t.total)}
                      </td>
                    </>
                  ) : (
                    <td className="py-2" style={{ color: SOUS }}>
                      {[f.telephone, f.email].filter(Boolean).join(" · ") || "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Carte>
  );
}
