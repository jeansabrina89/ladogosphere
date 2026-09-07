import { notFound } from "next/navigation";
import Link from "next/link";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatDateFR, aujourdhuiISO } from "@/src/lib/dates";
import {
  libelleCategorie,
  libelleMode,
  ouvreEntreeStock,
  COMPTE_MATIERES,
} from "@/src/lib/depensesLogique";
import { mouvementsDeDepense, listerArticles } from "@/src/lib/boutique";
import { libelleMouvement, formatQuantite } from "@/src/lib/boutiqueLogique";
import { listerPieces } from "@/src/lib/pieces";
import { lireHistorique, libelleEvenement } from "@/src/lib/journalEvenements";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import BadgeStatut from "@/app/components/ui/BadgeStatut";
import PiecesJointes from "@/app/components/PiecesJointes";
import AjouterEntreeStock from "./AjouterEntreeStock";
import {
  BoutonValider,
  FormReglement,
  FormAnnulation,
  BoutonSupprimerBrouillon,
} from "./ActionsDepense";

export const dynamic = "force-dynamic";

const chf = (n: number) => `${n.toFixed(2)} CHF`;

const marine = "#1B2B5E";
const sousTexte = "rgba(27,43,94,0.55)";
const bordure = "1px solid rgba(27,43,94,0.12)";

function Ligne({ cle, valeur }: { cle: string; valeur: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: bordure }}>
      <span style={{ color: sousTexte, fontSize: 14 }}>{cle}</span>
      <span style={{ color: marine, fontSize: 14, fontWeight: 600, textAlign: "right" }}>{valeur}</span>
    </div>
  );
}

export default async function DepensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const acces = await exigerAccesAdmin("perm_depenses");
  const { id } = await params;

  const { data: depense } = await supabaseAdmin
    .from("depenses")
    .select(`
      id, numero, date_depense, libelle, montant, compte_charge, mode_paiement, date_paiement,
      statut, exercice, ecriture_id, ecriture_paiement_id, motif_annulation, created_at,
      fournisseurs (id, nom)
    `)
    .eq("id", id)
    .maybeSingle();
  if (!depense) notFound();

  const fournisseur = depense.fournisseurs as unknown as { id: string; nom: string } | null;
  const pieces = await listerPieces("depense", id);
  const historique = await lireHistorique("depense", id);

  // Écritures de la dépense, pour montrer noir sur blanc ce qui est parti au
  // grand-livre. C'est de la lecture : rien ne s'y saisit.
  const { data: ecritures } = await supabaseAdmin
    .from("ecritures")
    .select("id, date_ecriture, libelle, piece_type, ecritures_lignes (compte_numero, debit, credit)")
    .eq("piece_id", id)
    .in("piece_type", ["depense", "depense_paiement", "depense_annulation"])
    .order("created_at", { ascending: true });

  // Matières ou marchandises : le stock que cet achat a produit.
  const avecStock = ouvreEntreeStock(depense.compte_charge);
  const estMatieres = depense.compte_charge === COMPTE_MATIERES;
  const mouvements = avecStock ? await mouvementsDeDepense(id) : [];
  const catalogue = avecStock ? await listerArticles() : [];
  const nomArticle = new Map(catalogue.map((a) => [a.id, { nom: a.nom, unite: a.unite }]));
  const articlesEntree =
    avecStock && acces.permissions.perm_boutique && depense.statut !== "annulee"
      ? catalogue
          .filter((a) => a.actif)
          .map((a) => ({
            id: a.id, nom: a.nom, reference: a.reference, unite: a.unite,
            categorie: a.categorie, composant: a.composant,
          }))
      : [];

  const estBrouillon = depense.statut === "brouillon";
  const aRegler = depense.statut === "validee" && depense.mode_paiement === "a_payer";
  const estAnnulee = depense.statut === "annulee";

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto" style={{ display: "grid", gap: 16 }}>
        <EnTete
          titre={depense.numero ? `🧾 ${depense.numero}` : "🧾 Dépense (brouillon)"}
          sousTitre={depense.libelle}
          action={<Bouton href="/comptabilite/depenses" variante="secondaire">← Dépenses</Bouton>}
        />

        <Carte>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
            <span style={{ color: marine, fontSize: 30, fontWeight: 700 }}>
              {chf(Number(depense.montant))}
            </span>
            <BadgeStatut statut={depense.statut} />
          </div>

          <Ligne cle="Date" valeur={formatDateFR(depense.date_depense)} />
          <Ligne
            cle="Fournisseur"
            valeur={
              fournisseur ? (
                <Link href={`/comptabilite/fournisseurs/${fournisseur.id}`} style={{ color: "#1F6E5B" }}>
                  {fournisseur.nom}
                </Link>
              ) : "—"
            }
          />
          <Ligne
            cle="Catégorie"
            valeur={
              <>
                {libelleCategorie(depense.compte_charge)}
                <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: sousTexte }}>
                  Compte {depense.compte_charge}
                </span>
              </>
            }
          />
          <Ligne cle="Payé par" valeur={libelleMode(depense.mode_paiement)} />
          {depense.date_paiement && (
            <Ligne cle="Réglée le" valeur={formatDateFR(depense.date_paiement)} />
          )}
          {depense.exercice && <Ligne cle="Exercice" valeur={String(depense.exercice)} />}
          {depense.motif_annulation && (
            <Ligne cle="Motif de l'annulation" valeur={depense.motif_annulation} />
          )}
        </Carte>

        <Carte>
          <PiecesJointes
            entite="depense"
            entiteId={id}
            pieces={pieces}
            lectureSeule={!estBrouillon}
            titre="Justificatif"
          />
          {!estBrouillon && (
            <p style={{ color: sousTexte, fontSize: 12, marginTop: 10, marginBottom: 0 }}>
              La dépense est validée : son justificatif fait partie de la pièce comptable et ne change plus.
            </p>
          )}
        </Carte>

        {avecStock && (
          <Carte>
            <h2 className="font-bold mb-1" style={{ color: marine }}>Entrée en stock</h2>
            <p style={{ color: sousTexte, fontSize: 13, marginTop: 0 }}>
              Le stock ne compte que des quantités : l&apos;achat est déjà passé en charge sur le
              compte {estMatieres ? "4000" : "4200"}, aucune écriture ne s&apos;y ajoute.
            </p>

            {mouvements.length > 0 && (
              <ul style={{ listStyle: "none", margin: "0 0 14px", padding: 0 }}>
                {mouvements.map((m) => {
                  const article = nomArticle.get(m.article_id);
                  return (
                    <li key={m.id} style={{ borderTop: bordure, padding: "8px 0", fontSize: 14 }}>
                      <Link href={`/boutique/articles/${m.article_id}`} style={{ color: marine, fontWeight: 600 }}>
                        {article?.nom ?? "Article"}
                      </Link>
                      <span style={{ color: sousTexte }}>
                        {" "}— {libelleMouvement(m.type)} de {formatQuantite(m.quantite)} {article?.unite ?? ""}
                        {m.date_peremption ? ` · à consommer avant le ${formatDateFR(m.date_peremption)}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {articlesEntree.length > 0 && !estBrouillon ? (
              <AjouterEntreeStock depenseId={id} articles={articlesEntree}
                privilegie={estMatieres ? "composants" : "vendables"} />
            ) : (
              mouvements.length === 0 && (
                <p style={{ color: sousTexte, fontSize: 14, margin: 0 }}>
                  {estBrouillon
                    ? "Les entrées en stock s'enregistrent à la validation de la dépense."
                    : "Aucune entrée en stock rattachée à cet achat."}
                </p>
              )
            )}
          </Carte>
        )}

        {estBrouillon && (
          <Carte>
            <div style={{ display: "grid", gap: 12 }}>
              <BoutonValider id={id} nbPieces={pieces.length} />
              <BoutonSupprimerBrouillon id={id} />
            </div>
          </Carte>
        )}

        {aRegler && (
          <Carte accent="or">
            <h2 className="font-bold mb-3" style={{ color: marine }}>Règlement</h2>
            <p style={{ color: sousTexte, fontSize: 14, marginTop: 0 }}>
              Cette dépense est enregistrée au compte Créanciers (2000). Son règlement le soldera.
            </p>
            <FormReglement id={id} dateDuJour={aujourdhuiISO()} />
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

        {!estBrouillon && !estAnnulee && (
          <Carte>
            <h2 className="font-bold mb-3" style={{ color: marine }}>Annuler</h2>
            <FormAnnulation id={id} />
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
