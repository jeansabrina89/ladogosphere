import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatDateFR } from "@/src/lib/dates";
import { getCoordonneesPaiement } from "@/src/lib/coordonneesPaiement";
import { lireParametresTva, affichage } from "@/src/lib/tva";
import { piedTva, ventilerPanier, type LigneVentilable } from "@/src/lib/tvaLogique";
import { genererQrBillSvg } from "@/src/lib/qrFacture";
import { estMembreActif } from "@/src/lib/membre";
import { lireHistorique, libelleEvenement } from "@/src/lib/journalEvenements";
import { listerPieces } from "@/src/lib/pieces";
import PiecesJointes from "@/app/components/PiecesJointes";
import { libelleMode, libelleCompteProduit } from "@/src/lib/factureStatut";
import BadgeMembre from "@/app/components/BadgeMembre";
import NomClientLien from "@/app/components/NomClientLien";
import BadgeFacture from "../BadgeFacture";
import ActionsFacture from "./ActionsFacture";

const MARINE = "#1B2B5E";
const GRIS = "rgba(27,43,94,0.55)";
const chf = (n: number) => `CHF ${(Number(n) || 0).toFixed(2)}`;

type LigneFacture = {
  id: string; ordre: number; libelle: string;
  quantite: number | string; prix_unitaire: number | string; montant: number | string;
  compte_produit: string;
};

export default async function FacturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const acces = await exigerAccesAdmin("perm_factures");
  const peutEncaisser = acces.isAdmin || acces.permissions.perm_encaissements;

  const { id } = await params;

  const { data: facture } = await supabaseAdmin
    .from("factures")
    .select(`
      id, numero, type, statut, date_facture, date_echeance, motif, pdf_path,
      montant_total, montant_paye, montant_restant, reference_qr, facture_origine_id,
      clients (id, prenom, nom, adresse, email, telephone, membre)
    `)
    .eq("id", id)
    .maybeSingle();

  if (!facture) return <div className="p-8">Facture introuvable.</div>;

  const client = facture.clients as unknown as
    { id: string; prenom?: string; nom?: string; adresse?: string; email?: string; telephone?: string; membre?: boolean } | null;

  const [{ data: lignesDb }, coords, paramsTV, historique] = await Promise.all([
    supabaseAdmin.from("facture_lignes")
      .select("id, ordre, libelle, quantite, prix_unitaire, montant, compte_produit, taux_tva, motif_tva")
      .eq("facture_id", id).order("ordre"),
    // L’identité de la DATE de la pièce : l’écran doit montrer la même
    // raison sociale que le PDF, quel que soit le jour où on le relit.
    getCoordonneesPaiement(
      supabaseAdmin,
      facture.date_facture ? String(facture.date_facture).split("T")[0] : null
    ),
    lireParametresTva(facture.date_facture ? String(facture.date_facture).split("T")[0] : null),
    lireHistorique("facture", id),
  ]);
  const lignes = (lignesDb ?? []) as LigneFacture[];

  const piecesFacture = await listerPieces("facture", id);

  const { data: paiements } = await supabaseAdmin
    .from("paiements_resa")
    .select("id, date_paiement, mode, montant, arrondi, motif")
    .eq("facture_id", id)
    .order("date_paiement");

  // Justificatifs rattachés aux encaissements (un reçu, une confirmation…).
  const idsPaiements = (paiements ?? []).map((p) => String(p.id));
  const { data: piecesPaiements } = idsPaiements.length
    ? await supabaseAdmin
        .from("pieces")
        .select("id, entite_id, nom_fichier, mime, taille, created_at")
        .eq("entite", "paiement")
        .in("entite_id", idsPaiements)
        .order("created_at")
    : { data: [] as { id: string; entite_id: string; nom_fichier: string; mime: string; taille: number; created_at: string }[] };

  const piecesParPaiement = new Map<string, { id: string; nom_fichier: string; mime: string; taille: number; created_at: string }[]>();
  for (const piece of piecesPaiements ?? []) {
    const cle = String(piece.entite_id);
    const liste = piecesParPaiement.get(cle) ?? [];
    liste.push({
      id: String(piece.id), nom_fichier: String(piece.nom_fichier),
      mime: String(piece.mime), taille: Number(piece.taille),
      created_at: String(piece.created_at),
    });
    piecesParPaiement.set(cle, liste);
  }

  // Avoirs déjà émis sur cette facture.
  const { data: avoirs } = await supabaseAdmin
    .from("factures")
    .select("id, numero, date_facture, montant_total, motif")
    .eq("facture_origine_id", id).not("numero", "is", null);

  const dateISO = facture.date_facture ? String(facture.date_facture).split("T")[0] : null;
  // La ventilation se lit sur les LIGNES, chacune avec son taux figé — jamais
  // en appliquant un taux unique au total de la pièce.
  const tvaData = piedTva(
    affichage(paramsTV),
    ventilerPanier({ lignes: (lignesDb ?? []) as unknown as LigneVentilable[] }),
    dateISO,
    ((lignesDb ?? []) as unknown as { motif_tva: string | null }[]).map((l) => l.motif_tva)
  );
  const membreAJour = client?.id ? await estMembreActif(supabaseAdmin, client.id, dateISO ?? undefined) : false;

  const estAvoir = facture.type === "avoir";
  const estBrouillon = !facture.numero;
  const estClose = facture.statut === "annulee" || facture.statut === "annulee_par_avoir";
  const reste = Number(facture.montant_restant ?? 0);
  const aujourdhui = new Date().toISOString().split("T")[0];

  const nomClient = `${client?.prenom ?? ""} ${client?.nom ?? ""}`.trim();
  const adresseClient = (client?.adresse ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

  const qrBillSvg = !estAvoir && !estBrouillon && !estClose && reste > 0
    ? genererQrBillSvg({
        iban: coords.iban, titulaire: coords.titulaire, adresse: coords.adresse,
        montant: reste, numeroFacture: facture.numero as string,
        referenceStockee: (facture.reference_qr as string) ?? null,
        debiteur: adresseClient.length > 0 ? { nom: nomClient || "Client", adresse: adresseClient } : null,
      })
    : null;

  const titre = estAvoir ? "AVOIR" : facture.type === "acompte" ? "FACTURE D'ACOMPTE" : "FACTURE";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
  @media print {
    .no-print { display: none !important; }
    nav, header { display: none !important; }
    body { background: white !important; }
    .facture { box-shadow: none !important; border: none !important; }
  }
  @page { margin: 1cm; size: A4; }
  .qrbill-wrap svg { width: 100%; height: auto; max-width: 820px; display: block; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
` }} />

      <main className="min-h-screen p-6" style={{ backgroundColor: "#F5F0E8" }}>
        <div className="max-w-6xl mx-auto flex gap-6 items-start flex-wrap lg:flex-nowrap">

          {/* ── Document ────────────────────────────────────────────────── */}
          <div className="facture bg-white p-10 shadow-sm rounded-2xl flex-1" style={{ minWidth: 320 }}>
            <div className="flex justify-between items-start mb-8">
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/Logo.png" alt="La Dogosphère" style={{ height: 76, marginBottom: 8 }} />
                <p className="text-sm" style={{ color: GRIS }}>{coords.titulaire}</p>
                {[coords.adresse.rue, coords.adresse.numero].filter(Boolean).length > 0 && (
                  <p className="text-sm" style={{ color: GRIS }}>
                    {[coords.adresse.rue, coords.adresse.numero].filter(Boolean).join(" ")}
                  </p>
                )}
                {[coords.adresse.npa, coords.adresse.ville].filter(Boolean).length > 0 && (
                  <p className="text-sm" style={{ color: GRIS }}>
                    {[coords.adresse.npa, coords.adresse.ville].filter(Boolean).join(" ")}
                  </p>
                )}
                {paramsTV.assujettie && paramsTV.numero && (
                  <p className="text-sm" style={{ color: GRIS }}>N° TVA : {paramsTV.numero}</p>
                )}
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-bold mb-2" style={{ color: MARINE }}>{titre}</h2>
                <p className="text-sm"><strong>N° :</strong> {facture.numero ?? "brouillon"}</p>
                <p className="text-sm"><strong>Date :</strong> {facture.date_facture ? formatDateFR(facture.date_facture) : "—"}</p>
                {!estAvoir && facture.date_echeance && (
                  <p className="text-sm"><strong>Échéance :</strong> {formatDateFR(facture.date_echeance)}</p>
                )}
                <div className="mt-2"><BadgeFacture facture={facture} aujourdhui={aujourdhui} /></div>
              </div>
            </div>

            <div className="border-t-2 mb-8" style={{ borderColor: MARINE }} />

            <div className="mb-8">
              <h3 className="font-bold text-xs uppercase tracking-wide mb-2" style={{ color: "rgba(27,43,94,0.4)" }}>
                Facturé à
              </h3>
              <p className="font-bold text-lg" style={{ color: MARINE }}>
                <NomClientLien id={client?.id} prenom={client?.prenom} nom={client?.nom} />{" "}
                <BadgeMembre membre={!!client?.membre} aJour={membreAJour} />
              </p>
              {adresseClient.map((l, i) => <p key={i} className="text-sm" style={{ color: GRIS }}>{l}</p>)}
              {client?.email && <p className="text-sm" style={{ color: GRIS }}>{client.email}</p>}
              {client?.telephone && <p className="text-sm" style={{ color: GRIS }}>{client.telephone}</p>}
            </div>

            <table className="w-full mb-6 text-sm">
              <thead>
                <tr style={{ backgroundColor: MARINE, color: "white" }}>
                  <th className="px-4 py-3 text-left rounded-tl-lg">Désignation</th>
                  <th className="px-4 py-3 text-right">Qté</th>
                  <th className="px-4 py-3 text-right">Prix unitaire</th>
                  <th className="px-4 py-3 text-right rounded-tr-lg">Montant</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.id} className="border-b">
                    <td className="px-4 py-3" style={{ color: MARINE }}>
                      {l.libelle}
                      <span className="block text-xs" style={{ color: "rgba(27,43,94,0.4)" }}>
                        {libelleCompteProduit(l.compte_produit)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: GRIS }}>{Number(l.quantite)}</td>
                    <td className="px-4 py-3 text-right" style={{ color: GRIS }}>{chf(Number(l.prix_unitaire))}</td>
                    <td className="px-4 py-3 text-right font-semibold">{chf(Number(l.montant))}</td>
                  </tr>
                ))}
                {lignes.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center" style={{ color: GRIS }}>
                    Aucune ligne : cette facture ne peut pas être émise.
                  </td></tr>
                )}
              </tbody>
              <tfoot>
                {tvaData && tvaData.lignes.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right text-sm" style={{ color: GRIS }}>Total HT</td>
                      <td className="px-4 py-2 text-right text-sm font-semibold">{chf(tvaData.totalHt)}</td>
                    </tr>
                    {tvaData.motifs.map((m) => (
                      <tr key={m}>
                        <td colSpan={4} className="px-4 py-2 text-right text-sm" style={{ color: GRIS }}>
                          {m}
                        </td>
                      </tr>
                    ))}
                    {tvaData.lignes.map((t) => (
                      <tr key={t.taux}>
                        <td colSpan={3} className="px-4 py-2 text-right text-sm" style={{ color: GRIS }}>
                          {t.etiquette} sur {chf(t.base)}
                        </td>
                        <td className="px-4 py-2 text-right text-sm font-semibold">{chf(t.tva)}</td>
                      </tr>
                    ))}
                  </>
                )}
                <tr style={{ backgroundColor: "#F5F0E8" }}>
                  <td colSpan={3} className="px-4 py-3 font-bold text-right">Total</td>
                  <td className="px-4 py-3 font-bold text-right text-lg" style={{ color: MARINE }}>
                    {chf(Number(facture.montant_total))}
                  </td>
                </tr>
                {Number(facture.montant_paye) > 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-right text-sm" style={{ color: GRIS }}>Déjà payé</td>
                    <td className="px-4 py-2 text-right text-sm font-semibold" style={{ color: "#1F6E5B" }}>
                      − {chf(Number(facture.montant_paye))}
                    </td>
                  </tr>
                )}
                {!estAvoir && reste > 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-right text-sm" style={{ color: GRIS }}>Reste à payer</td>
                    <td className="px-4 py-2 text-right text-sm font-semibold" style={{ color: "#A8453A" }}>
                      {chf(reste)}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>

            {facture.motif && (
              <div className="rounded-xl p-4 mb-6 text-sm" style={{ backgroundColor: "#F5F0E8" }}>
                <p className="font-bold" style={{ color: MARINE }}>Motif</p>
                <p style={{ color: GRIS }}>{facture.motif}</p>
              </div>
            )}

            {!paramsTV.assujettie && (
              <p className="text-xs mb-6" style={{ color: GRIS }}>
                TVA non applicable — entreprise non assujettie (art. 10 LTVA).
              </p>
            )}

            {qrBillSvg ? (
              <div className="mb-4">
                <p className="font-bold mb-2 no-print" style={{ color: MARINE }}>Bulletin de versement QR</p>
                <div className="qrbill-wrap" style={{ width: "100%", overflowX: "auto" }}
                     dangerouslySetInnerHTML={{ __html: qrBillSvg }} />
              </div>
            ) : !estAvoir && !estBrouillon && !estClose && reste > 0 ? (
              <div className="border rounded-xl p-4 mb-4 text-sm"
                   style={{ borderColor: "#C9A84C", backgroundColor: "#FFFBF0" }}>
                <p className="font-bold mb-2" style={{ color: MARINE }}>Coordonnées de paiement</p>
                {coords.ibanConfigure ? (
                  <>
                    <p><strong>Virement :</strong> IBAN {coords.iban}</p>
                    <p><strong>Titulaire :</strong> {coords.titulaire}</p>
                    <p className="mt-1" style={{ color: GRIS }}>
                      Merci d&apos;indiquer le numéro de facture {facture.numero} en référence.
                    </p>
                  </>
                ) : (
                  <p>Coordonnées de paiement communiquées prochainement.</p>
                )}
              </div>
            ) : null}
          </div>

          {/* ── Actions ─────────────────────────────────────────────────── */}
          <aside className="no-print w-full lg:w-80 flex-shrink-0 space-y-4">
            <ActionsFacture
              factureId={facture.id}
              numero={facture.numero as string | null}
              type={facture.type as string}
              estClose={estClose}
              reste={reste}
              peutEncaisser={peutEncaisser}
              aUnPdf={!!facture.pdf_path}
              aUnEmail={!!client?.email}
              nbLignes={lignes.length}
              lignes={lignes.map((l) => ({
                id: l.id, libelle: l.libelle,
                quantite: Number(l.quantite), prix_unitaire: Number(l.prix_unitaire),
              }))}
            />

            <Bloc titre="Pièces jointes">
              <PiecesJointes entite="facture" entiteId={id} pieces={piecesFacture} titre="" />
            </Bloc>

            {(paiements ?? []).length > 0 && (
              <Bloc titre="Encaissements">
                {(paiements ?? []).map((p: Record<string, unknown>) => (
                  <div key={String(p.id)} className="flex justify-between items-baseline flex-wrap py-1.5 border-b last:border-0"
                       style={{ borderColor: "rgba(27,43,94,0.08)" }}>
                    <div>
                      <span className="text-sm font-semibold" style={{ color: MARINE }}>
                        {chf(Number(p.montant))}
                      </span>
                      <span className="text-xs ml-2" style={{ color: GRIS }}>{libelleMode(p.mode as string)}</span>
                      {Number(p.arrondi ?? 0) !== 0 && (
                        <span className="text-xs ml-2" style={{ color: "#6E5410" }}>
                          arrondi {Number(p.arrondi) > 0 ? "+" : ""}{Number(p.arrondi).toFixed(2)}
                        </span>
                      )}
                    </div>
                    <span className="text-xs" style={{ color: GRIS }}>
                      {formatDateFR(p.date_paiement as string)}
                    </span>
                    <div style={{ flexBasis: "100%", marginTop: 8 }}>
                      <PiecesJointes
                        entite="paiement"
                        entiteId={String(p.id)}
                        pieces={piecesParPaiement.get(String(p.id)) ?? []}
                        titre=""
                      />
                    </div>
                  </div>
                ))}
              </Bloc>
            )}

            {(avoirs ?? []).length > 0 && (
              <Bloc titre="Avoirs">
                {(avoirs ?? []).map((a: Record<string, unknown>) => (
                  <a key={String(a.id)} href={`/factures/${a.id}`}
                     className="flex justify-between items-baseline py-1.5 border-b last:border-0"
                     style={{ borderColor: "rgba(27,43,94,0.08)" }}>
                    <span className="text-sm font-semibold" style={{ color: "#0369A1" }}>{String(a.numero)}</span>
                    <span className="text-sm" style={{ color: MARINE }}>{chf(Number(a.montant_total))}</span>
                  </a>
                ))}
              </Bloc>
            )}

            {facture.facture_origine_id && (
              <Bloc titre="Avoir sur">
                <a href={`/factures/${facture.facture_origine_id}`} className="text-sm font-semibold"
                   style={{ color: MARINE }}>
                  Voir la facture d&apos;origine →
                </a>
              </Bloc>
            )}

            <Bloc titre="Historique">
              {historique.length === 0 ? (
                <p className="text-sm" style={{ color: GRIS }}>Aucun évènement.</p>
              ) : (
                historique.map((h) => (
                  <div key={h.id} className="py-1.5 border-b last:border-0" style={{ borderColor: "rgba(27,43,94,0.08)" }}>
                    <p className="text-sm font-semibold" style={{ color: MARINE }}>{libelleEvenement(h.evenement)}</p>
                    <p className="text-xs" style={{ color: GRIS }}>
                      {new Date(h.created_at).toLocaleString("fr-CH")}
                      {h.auteur ? ` — ${h.auteur}` : ""}
                    </p>
                    {h.motif && <p className="text-xs italic" style={{ color: GRIS }}>{h.motif}</p>}
                  </div>
                ))
              )}
            </Bloc>
          </aside>
        </div>
      </main>
    </>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: "rgba(27,43,94,0.12)" }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "rgba(27,43,94,0.5)" }}>
        {titre}
      </p>
      {children}
    </div>
  );
}
