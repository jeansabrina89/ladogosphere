import { notFound } from "next/navigation";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { lireCommande, lignesDeCommande } from "@/src/lib/venteEnLigne";
import { libelleModeRemise, formatAdresse } from "@/src/lib/venteEnLigneLogique";
import { formatDateFR } from "@/src/lib/dates";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "#5B6478";
const BORDURE = "1px solid rgba(27,43,94,0.25)";

/**
 * Bon de préparation : ce qu'on emporte dans le magasin pour rassembler la
 * commande. Sur papier, en noir sur blanc, avec des cases à cocher — on le
 * pose sur le carton, on coche, on n'oublie rien.
 *
 * L'emplacement est la référence de l'article : c'est ce qui est écrit sur
 * l'étagère, la boutique n'a pas d'autre plan de rangement.
 */
export default async function BonPreparationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerAccesAdmin("perm_boutique_vente");
  const { id } = await params;

  const commande = await lireCommande(id);
  if (!commande) notFound();

  const [lignes, { data: client }] = await Promise.all([
    lignesDeCommande(id),
    supabaseAdmin.from("clients").select("prenom, nom, telephone").eq("id", commande.client_id).maybeSingle(),
  ]);

  const { data: articles } = lignes.length
    ? await supabaseAdmin
        .from("articles").select("id, reference, unite")
        .in("id", [...new Set(lignes.map((l) => l.article_id))])
    : { data: [] };
  const parArticle = new Map(
    ((articles ?? []) as unknown as { id: string; reference: string; unite: string }[])
      .map((a) => [a.id, a])
  );

  return (
    <main style={{ backgroundColor: "#FFFFFF", color: MARINE, padding: 24, minHeight: "100vh" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px" }}>
          Bon de préparation — {commande.numero ?? "commande"}
        </h1>
        <p style={{ color: SOUS, fontSize: 14, margin: "0 0 4px" }}>
          {client ? `${client.prenom ?? ""} ${client.nom ?? ""}`.trim() : "Client"}
          {client?.telephone ? ` · ${client.telephone}` : ""}
        </p>
        <p style={{ color: SOUS, fontSize: 14, margin: "0 0 18px" }}>
          {libelleModeRemise(commande.mode_remise)}
          {commande.confirmee_le ? ` · commandée le ${formatDateFR(commande.confirmee_le.slice(0, 10))}` : ""}
        </p>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
          <thead>
            <tr>
              <th style={{ ...cellule, width: 40 }}>✓</th>
              <th style={{ ...cellule, textAlign: "left" }}>Article</th>
              <th style={{ ...cellule, width: 110, textAlign: "left" }}>Emplacement</th>
              <th style={{ ...cellule, width: 70, textAlign: "right" }}>Qté</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => {
              const a = parArticle.get(l.article_id);
              return (
                <tr key={l.id}>
                  <td style={{ ...cellule, textAlign: "center", fontSize: 20 }}>☐</td>
                  <td style={{ ...cellule, textAlign: "left" }}>
                    {l.libelle}
                    {l.commande_personnalisee_id && (
                      <span style={{ display: "block", color: SOUS, fontSize: 13 }}>
                        Sur mesure — à prendre à l&apos;atelier
                      </span>
                    )}
                  </td>
                  <td style={{ ...cellule, textAlign: "left", color: SOUS }}>
                    {a?.reference ?? "—"}
                  </td>
                  <td style={{ ...cellule, textAlign: "right", fontWeight: 700 }}>
                    {Number(l.quantite)} {a?.unite ?? ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {commande.mode_remise === "postal" && commande.adresse_livraison && (
          <div style={{ marginTop: 24, border: BORDURE, borderRadius: 8, padding: 14 }}>
            <p style={{ color: SOUS, fontSize: 13, margin: "0 0 6px" }}>Étiquette d&apos;expédition</p>
            <p style={{ fontSize: 16, margin: 0, whiteSpace: "pre-line", lineHeight: 1.5 }}>
              {formatAdresse(commande.adresse_livraison)}
            </p>
          </div>
        )}

        <p style={{ color: SOUS, fontSize: 13, marginTop: 24 }}>
          Le stock est déjà réservé pour cette commande. Il ne sortira vraiment qu&apos;à la remise.
        </p>
      </div>
    </main>
  );
}

const cellule: React.CSSProperties = {
  border: BORDURE,
  padding: "10px 8px",
  verticalAlign: "top",
};
