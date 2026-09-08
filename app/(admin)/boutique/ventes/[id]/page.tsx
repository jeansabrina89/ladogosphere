import { notFound } from "next/navigation";
import Link from "next/link";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatDateFR } from "@/src/lib/dates";
import { lireVente, lignesDeVente, retoursDeVente } from "@/src/lib/caisse";
import { libelleModeVente, resteARendre, chf } from "@/src/lib/caisseLogique";
import { lireHistorique, libelleEvenement } from "@/src/lib/journalEvenements";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import ActionsVente from "./ActionsVente";

export const dynamic = "force-dynamic";

const marine = "#1B2B5E";
const sousTexte = "rgba(27,43,94,0.55)";
const bordure = "1px solid rgba(27,43,94,0.12)";

function Ligne({ cle, valeur }: { cle: string; valeur: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: bordure }}>
      <span style={{ color: sousTexte, fontSize: 15 }}>{cle}</span>
      <span style={{ color: marine, fontSize: 15, fontWeight: 600, textAlign: "right" }}>{valeur}</span>
    </div>
  );
}

export default async function VentePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerAccesAdmin("perm_boutique_vente");
  const { id } = await params;

  const vente = await lireVente(id);
  if (!vente) notFound();

  const [lignes, retours, historique] = await Promise.all([
    lignesDeVente(id),
    retoursDeVente(id),
    lireHistorique("vente", id),
  ]);

  const estRetour = !!vente.vente_origine_id;
  const reste = resteARendre(lignes, retours.lignes);

  const [{ data: client }, { data: vendeur }, { data: origine }, { data: facture }] = await Promise.all([
    vente.client_id
      ? supabaseAdmin.from("clients").select("id, prenom, nom, email").eq("id", vente.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    vente.vendu_par
      ? supabaseAdmin.from("profiles").select("prenom, nom").eq("id", vente.vendu_par).maybeSingle()
      : Promise.resolve({ data: null }),
    vente.vente_origine_id
      ? supabaseAdmin.from("ventes").select("id, numero").eq("id", vente.vente_origine_id).maybeSingle()
      : Promise.resolve({ data: null }),
    vente.facture_id
      ? supabaseAdmin.from("factures").select("id, numero, statut").eq("id", vente.facture_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Écritures de la vente, pour montrer noir sur blanc ce qui est parti au
  // grand livre. C'est de la lecture : rien ne s'y saisit.
  const { data: ecritures } = await supabaseAdmin
    .from("ecritures")
    .select("id, date_ecriture, libelle, ecritures_lignes (compte_numero, debit, credit)")
    .eq("piece_id", id)
    .in("piece_type", ["vente", "vente_retour"])
    .order("created_at");

  const total = Number(vente.montant_total);
  const arrondi = Number(vente.arrondi ?? 0);
  const recu = vente.montant_recu === null ? null : Number(vente.montant_recu);
  const aRegler = Math.round((total + arrondi) * 100) / 100;

  const factureEmise = !!facture?.numero;
  const toutRendu = Object.values(reste).every((q) => q <= 0);

  const messageRetourImpossible = estRetour
    ? "Un retour ne se rend pas."
    : vente.statut === "annulee" || toutRendu
      ? "Cette vente a été entièrement rendue."
      : factureEmise
        ? `La facture ${facture?.numero} est déjà émise : corrigez-la par un avoir plutôt que par un retour de caisse.`
        : null;

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto" style={{ display: "grid", gap: 16 }}>
        <EnTete
          titre={`${estRetour ? "↩" : "🧾"} ${vente.numero ?? "Vente"}`}
          sousTitre={
            estRetour && origine
              ? `Retour sur la vente ${origine.numero}`
              : new Date(vente.date_vente).toLocaleString("fr-CH")
          }
          action={<Bouton href="/boutique/ventes" variante="secondaire">← Ventes</Bouton>}
        />

        <Carte accent={vente.statut === "annulee" ? "or" : "aucun"}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ color: total < 0 ? "#A8453A" : marine, fontSize: 30, fontWeight: 700 }}>
              {chf(total)}
            </span>
            <span style={{ color: sousTexte, fontSize: 16 }}>{libelleModeVente(vente.mode_reglement)}</span>
          </div>

          {vente.statut === "annulee" && (
            <p style={{
              color: "#6E5410", backgroundColor: "#F4EAC9", border: "1px solid #C9A84C",
              borderRadius: 12, padding: "8px 12px", fontSize: 14, fontWeight: 600, margin: "0 0 8px",
            }}>
              Vente entièrement rendue — elle reste au journal, annulée.
            </p>
          )}

          <Ligne cle="Date" valeur={new Date(vente.date_vente).toLocaleString("fr-CH")} />
          {origine && (
            <Ligne
              cle="Vente d'origine"
              valeur={<Link href={`/boutique/ventes/${origine.id}`} style={{ color: "#1F6E5B" }}>{origine.numero}</Link>}
            />
          )}
          {vente.motif && <Ligne cle="Motif" valeur={vente.motif} />}
          <Ligne
            cle="Client"
            valeur={
              client ? (
                <Link href={`/clients/${client.id}`} style={{ color: "#1F6E5B" }}>
                  {`${client.prenom ?? ""} ${client.nom ?? ""}`.trim()}
                </Link>
              ) : "Au comptoir"
            }
          />
          {facture && (
            <Ligne
              cle="Portée sur la facture"
              valeur={
                <Link href={`/factures/${facture.id}`} style={{ color: "#1F6E5B" }}>
                  {facture.numero ?? "brouillon"}
                </Link>
              }
            />
          )}
          {vendeur && (
            <Ligne cle="Servi par" valeur={`${vendeur.prenom ?? ""} ${vendeur.nom ?? ""}`.trim()} />
          )}
          {arrondi !== 0 && (
            <Ligne cle="Arrondi des espèces" valeur={`${arrondi > 0 ? "+" : ""}${arrondi.toFixed(2)} CHF`} />
          )}
          {recu !== null && (
            <>
              <Ligne cle="Reçu" valeur={chf(recu)} />
              <Ligne cle="Rendu" valeur={chf(Math.round((recu - aRegler) * 100) / 100)} />
            </>
          )}
        </Carte>

        <Carte>
          <h2 className="font-bold mb-3" style={{ color: marine }}>Articles</h2>
          <div style={{ display: "grid", gap: 2 }}>
            {lignes.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: bordure }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", color: marine, fontSize: 15, fontWeight: 600, overflowWrap: "anywhere" }}>
                    {l.libelle}
                  </span>
                  <span style={{ display: "block", color: sousTexte, fontSize: 13 }}>
                    {Number(l.quantite)} × {chf(Number(l.prix_unitaire))}
                    {!estRetour && (reste[l.id] ?? 0) < Number(l.quantite) && (
                      <> · {Number(l.quantite) - (reste[l.id] ?? 0)} rendu(s)</>
                    )}
                  </span>
                </span>
                <span style={{ color: marine, fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {chf(Number(l.montant))}
                </span>
              </div>
            ))}
          </div>
          <p style={{ color: sousTexte, fontSize: 12, marginTop: 12, marginBottom: 0 }}>
            Libellés, prix et taux sont figés au moment de la vente : modifier un article aujourd&apos;hui
            ne change pas ce ticket.
          </p>
        </Carte>

        <Carte>
          <h2 className="font-bold mb-3" style={{ color: marine }}>Actions</h2>
          <ActionsVente
            venteId={id}
            lignes={lignes}
            reste={reste}
            avecClient={!!client?.email}
            retourPossible={!estRetour && vente.statut === "finalisee" && !toutRendu && !factureEmise}
            messageRetourImpossible={messageRetourImpossible}
          />
        </Carte>

        {retours.ventes.length > 0 && (
          <Carte>
            <h2 className="font-bold mb-3" style={{ color: marine }}>Retours passés</h2>
            <div style={{ display: "grid", gap: 2 }}>
              {retours.ventes.map((r) => (
                <Link key={r.id} href={`/boutique/ventes/${r.id}`}
                  style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: bordure, textDecoration: "none" }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", color: marine, fontSize: 15, fontWeight: 600 }}>{r.numero}</span>
                    <span style={{ display: "block", color: sousTexte, fontSize: 13 }}>
                      {formatDateFR(r.date_vente)} · {r.motif}
                    </span>
                  </span>
                  <span style={{ color: "#A8453A", fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {chf(Number(r.montant_total))}
                  </span>
                </Link>
              ))}
            </div>
          </Carte>
        )}

        {(ecritures ?? []).length > 0 && (
          <Carte>
            <h2 className="font-bold mb-3" style={{ color: marine }}>Au grand-livre</h2>
            <div style={{ display: "grid", gap: 14 }}>
              {(ecritures ?? []).map((e) => (
                <div key={e.id as string}>
                  <p style={{ color: sousTexte, fontSize: 13, margin: "0 0 4px" }}>
                    {formatDateFR(e.date_ecriture as string)} — {e.libelle as string}
                  </p>
                  <table className="w-full text-sm">
                    <tbody>
                      {(e.ecritures_lignes as unknown as { compte_numero: string; debit: number; credit: number }[]).map((l, i) => (
                        <tr key={i} style={{ borderTop: bordure }}>
                          <td className="py-1" style={{ color: marine }}>{l.compte_numero}</td>
                          <td className="py-1 text-right" style={{ color: sousTexte }}>
                            {Number(l.debit) ? Number(l.debit).toFixed(2) : ""}
                          </td>
                          <td className="py-1 text-right" style={{ color: sousTexte }}>
                            {Number(l.credit) ? Number(l.credit).toFixed(2) : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </Carte>
        )}

        {(vente.mode_reglement === "facture_client") && (
          <Carte>
            <p style={{ color: sousTexte, fontSize: 14, margin: 0 }}>
              Achat porté sur la facture du client : aucune trésorerie n&apos;a été encaissée au comptoir.
              Le produit sera reconnu à l&apos;émission de cette facture, comme pour toute autre ligne.
            </p>
          </Carte>
        )}

        {historique.length > 0 && (
          <Carte>
            <h2 className="font-bold mb-3" style={{ color: marine }}>Historique</h2>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {historique.map((h) => (
                <li key={h.id} style={{ borderTop: bordure, padding: "8px 0", fontSize: 14 }}>
                  <span style={{ color: marine, fontWeight: 600 }}>{libelleEvenement(h.evenement)}</span>
                  <span style={{ color: sousTexte }}>
                    {" "}— {new Date(h.created_at).toLocaleString("fr-CH")}
                    {h.auteur ? ` · ${h.auteur}` : ""}
                  </span>
                  {h.motif && <div style={{ color: sousTexte }}>{h.motif}</div>}
                </li>
              ))}
            </ul>
          </Carte>
        )}
      </div>
    </main>
  );
}
