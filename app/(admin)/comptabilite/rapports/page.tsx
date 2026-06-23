import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatDateFR } from "@/src/lib/dates";
import { construireRapport } from "@/src/lib/rapportsCompta";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import BoutonCloture from "./BoutonCloture";

const chf = (n: number) => `${n.toFixed(2)} CHF`;

export default async function RapportsPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const params = await searchParams;
  const annee = parseInt(params.annee || String(new Date().getFullYear()));
  const anneeCourante = new Date().getFullYear();

  const { data: comptes } = await supabaseAdmin
    .from("comptes").select("numero, libelle, type").order("numero");

  const { data: ecrituresAnnee } = await supabaseAdmin
    .from("ecritures")
    .select("date_ecriture, libelle, piece_type, ecritures_lignes (compte_numero, debit, credit)")
    .gte("date_ecriture", `${annee}-01-01`)
    .lte("date_ecriture", `${annee}-12-31`)
    .order("date_ecriture", { ascending: true })
    .order("created_at", { ascending: true });

  const { data: ecrituresAnterieures } = await supabaseAdmin
    .from("ecritures")
    .select("date_ecriture, libelle, piece_type, ecritures_lignes (compte_numero, debit, credit)")
    .lt("date_ecriture", `${annee}-01-01`);

  const { data: exercice } = await supabaseAdmin
    .from("exercices").select("statut, date_cloture").eq("annee", annee).maybeSingle();
  const exerciceCloture = exercice?.statut === "cloture";

  const rap = construireRapport({
    comptes: (comptes ?? []) as any,
    ecrituresAnnee: (ecrituresAnnee ?? []) as any,
    ecrituresAnterieures: (ecrituresAnterieures ?? []) as any,
    exerciceCloture,
  });

  const marine = "#1B2B5E";
  const sousTexte = "rgba(27,43,94,0.55)";
  const bordure = "1px solid rgba(27,43,94,0.12)";

  const dateClotureFr = exercice?.date_cloture
    ? new Date(exercice.date_cloture).toLocaleDateString("fr-CH")
    : null;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">
        <EnTete
          titre="📊 Rapports comptables"
          sousTitre={`Compte de résultat, bilan, balance et grand-livre — exercice ${annee}`}
          action={<Bouton href="/comptabilite" variante="secondaire">← Comptabilité</Bouton>}
        />

        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: marine }}>Exercice :</span>
          {[2025, 2026, 2027, 2028].map(a => (
            <a key={a} href={`/comptabilite/rapports?annee=${a}`}
              className="px-3 py-1 rounded-lg text-sm font-semibold transition"
              style={{ backgroundColor: a === annee ? marine : "white", color: a === annee ? "white" : marine, border: bordure }}>
              {a}
            </a>
          ))}
          <a href={`/api/comptabilite/rapports-export?annee=${annee}`}
            className="ml-auto px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: "#2E8B7E" }}>
            📥 Télécharger l&apos;exercice
          </a>
        </div>

        <div className="mb-6">
          {exerciceCloture ? (
            <div className="px-4 py-3 rounded-xl text-sm font-semibold" style={{ backgroundColor: "#DCEEE9", color: "#1F6E5B" }}>
              🔒 Exercice {annee} clôturé{dateClotureFr ? ` le ${dateClotureFr}` : ""}. Aucune écriture ne peut plus y être ajoutée.
            </div>
          ) : annee < anneeCourante ? (
            <div className="flex items-center gap-3 flex-wrap px-4 py-3 rounded-xl" style={{ backgroundColor: "#EAF0F6" }}>
              <span className="text-sm" style={{ color: marine }}>
                Exercice écoulé : tu peux le clôturer pour figer les comptes et reporter le résultat au compte « Report à nouveau ».
              </span>
              <BoutonCloture annee={annee} />
            </div>
          ) : (
            <div className="px-4 py-3 rounded-xl text-sm" style={{ backgroundColor: "#EAF0F6", color: marine }}>
              Exercice en cours — clôture possible une fois l&apos;année terminée.
            </div>
          )}
        </div>

        {rap.balance.length === 0 && rap.grandLivre.length === 0 ? (
          <Carte>
            <p className="text-sm" style={{ color: sousTexte }}>Aucune écriture pour l&apos;exercice {annee}.</p>
          </Carte>
        ) : (
          <div className="space-y-6">

            <Carte>
              <h2 className="font-bold mb-4" style={{ color: marine }}>Compte de résultat</h2>
              <table className="w-full text-sm">
                <tbody>
                  <tr><td colSpan={2} className="pt-1 pb-2 font-semibold" style={{ color: marine }}>Produits</td></tr>
                  {rap.produits.map(p => (
                    <tr key={p.numero}>
                      <td className="py-0.5" style={{ color: sousTexte }}>{p.numero} — {p.libelle}</td>
                      <td className="py-0.5 text-right" style={{ color: marine }}>{chf(p.montant)}</td>
                    </tr>
                  ))}
                  <tr><td className="py-1 font-semibold" style={{ color: marine }}>Total produits</td><td className="py-1 text-right font-semibold" style={{ color: marine }}>{chf(rap.totalProduits)}</td></tr>
                  <tr><td colSpan={2} className="pt-3 pb-2 font-semibold" style={{ color: marine }}>Charges</td></tr>
                  {rap.charges.map(c => (
                    <tr key={c.numero}>
                      <td className="py-0.5" style={{ color: sousTexte }}>{c.numero} — {c.libelle}</td>
                      <td className="py-0.5 text-right" style={{ color: marine }}>{chf(c.montant)}</td>
                    </tr>
                  ))}
                  <tr><td className="py-1 font-semibold" style={{ color: marine }}>Total charges</td><td className="py-1 text-right font-semibold" style={{ color: marine }}>{chf(rap.totalCharges)}</td></tr>
                </tbody>
              </table>
              <div className="mt-4 pt-3 flex justify-between items-center" style={{ borderTop: bordure }}>
                <span className="font-bold" style={{ color: marine }}>Résultat de l&apos;exercice</span>
                <span className="font-bold text-lg" style={{ color: rap.resultat >= 0 ? "#1F6E5B" : "#A8453A" }}>{chf(rap.resultat)}</span>
              </div>
            </Carte>

            <Carte>
              <h2 className="font-bold mb-1" style={{ color: marine }}>Bilan</h2>
              <p className="text-xs mb-4" style={{ color: sousTexte }}>Soldes d&apos;ouverture (report à nouveau) inclus.</p>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="font-semibold mb-2" style={{ color: marine }}>Actif</p>
                  <table className="w-full text-sm">
                    <tbody>
                      {rap.actifs.map(a => (
                        <tr key={a.numero}>
                          <td className="py-0.5" style={{ color: sousTexte }}>{a.numero} — {a.libelle}</td>
                          <td className="py-0.5 text-right" style={{ color: marine }}>{chf(a.montant)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-2 pt-2 flex justify-between font-bold" style={{ borderTop: bordure, color: marine }}>
                    <span>Total actif</span><span>{chf(rap.totalActif)}</span>
                  </div>
                </div>
                <div>
                  <p className="font-semibold mb-2" style={{ color: marine }}>Passif</p>
                  <table className="w-full text-sm">
                    <tbody>
                      {rap.passifs.map(p => (
                        <tr key={p.numero}>
                          <td className="py-0.5" style={{ color: sousTexte }}>{p.numero} — {p.libelle}</td>
                          <td className="py-0.5 text-right" style={{ color: marine }}>{chf(p.montant)}</td>
                        </tr>
                      ))}
                      {!rap.exerciceCloture && (
                        <tr>
                          <td className="py-0.5" style={{ color: sousTexte }}>Résultat de l&apos;exercice</td>
                          <td className="py-0.5 text-right" style={{ color: marine }}>{chf(rap.resultatAuBilan)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div className="mt-2 pt-2 flex justify-between font-bold" style={{ borderTop: bordure, color: marine }}>
                    <span>Total passif</span><span>{chf(rap.totalPassif)}</span>
                  </div>
                </div>
              </div>
              {Math.abs(rap.totalActif - rap.totalPassif) > 0.009 && (
                <p className="mt-3 text-xs" style={{ color: "#A8453A" }}>
                  ⚠️ Écart actif/passif de {chf(Math.round((rap.totalActif - rap.totalPassif) * 100) / 100)} — clôture des exercices antérieurs requise pour équilibrer.
                </p>
              )}
            </Carte>

            <Carte>
              <h2 className="font-bold mb-4" style={{ color: marine }}>Balance</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: sousTexte }}>
                      <th className="text-left py-1 font-semibold">Compte</th>
                      <th className="text-right py-1 font-semibold">Débit</th>
                      <th className="text-right py-1 font-semibold">Crédit</th>
                      <th className="text-right py-1 font-semibold">Solde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rap.balance.map(b => (
                      <tr key={b.numero} style={{ borderTop: bordure }}>
                        <td className="py-1" style={{ color: marine }}>{b.numero} — {b.libelle}</td>
                        <td className="py-1 text-right" style={{ color: sousTexte }}>{b.debit ? b.debit.toFixed(2) : ""}</td>
                        <td className="py-1 text-right" style={{ color: sousTexte }}>{b.credit ? b.credit.toFixed(2) : ""}</td>
                        <td className="py-1 text-right font-semibold" style={{ color: marine }}>{b.solde.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: `2px solid ${marine}` }}>
                      <td className="py-1 font-bold" style={{ color: marine }}>Totaux</td>
                      <td className="py-1 text-right font-bold" style={{ color: marine }}>{rap.totalDebit.toFixed(2)}</td>
                      <td className="py-1 text-right font-bold" style={{ color: marine }}>{rap.totalCredit.toFixed(2)}</td>
                      <td className="py-1 text-right font-bold" style={{ color: Math.abs(rap.totalDebit - rap.totalCredit) < 0.009 ? "#1F6E5B" : "#A8453A" }}>
                        {Math.abs(rap.totalDebit - rap.totalCredit) < 0.009 ? "équilibrée" : (rap.totalDebit - rap.totalCredit).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Carte>

            <Carte>
              <h2 className="font-bold mb-4" style={{ color: marine }}>Grand-livre</h2>
              <div className="space-y-5">
                {rap.grandLivre.map(g => (
                  <div key={g.numero}>
                    <p className="font-semibold mb-1" style={{ color: marine }}>{g.numero} — {g.libelle}</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ color: sousTexte }}>
                            <th className="text-left py-0.5 font-medium" style={{ width: 90 }}>Date</th>
                            <th className="text-left py-0.5 font-medium">Libellé</th>
                            <th className="text-right py-0.5 font-medium" style={{ width: 90 }}>Débit</th>
                            <th className="text-right py-0.5 font-medium" style={{ width: 90 }}>Crédit</th>
                            <th className="text-right py-0.5 font-medium" style={{ width: 100 }}>Solde</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.ouverture !== 0 && (
                            <tr style={{ borderTop: bordure }}>
                              <td className="py-0.5" style={{ color: sousTexte }}>—</td>
                              <td className="py-0.5 italic" style={{ color: sousTexte }}>À nouveau (report)</td>
                              <td className="py-0.5 text-right" style={{ color: sousTexte }}></td>
                              <td className="py-0.5 text-right" style={{ color: sousTexte }}></td>
                              <td className="py-0.5 text-right font-semibold" style={{ color: marine }}>{g.ouverture.toFixed(2)}</td>
                            </tr>
                          )}
                          {g.mvts.map((m, i) => (
                            <tr key={i} style={{ borderTop: bordure }}>
                              <td className="py-0.5" style={{ color: sousTexte }}>{formatDateFR(m.date)}</td>
                              <td className="py-0.5" style={{ color: marine }}>{m.libelle}</td>
                              <td className="py-0.5 text-right" style={{ color: sousTexte }}>{m.debit ? m.debit.toFixed(2) : ""}</td>
                              <td className="py-0.5 text-right" style={{ color: sousTexte }}>{m.credit ? m.credit.toFixed(2) : ""}</td>
                              <td className="py-0.5 text-right font-semibold" style={{ color: marine }}>{m.solde.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </Carte>

          </div>
        )}
      </div>
    </main>
  );
}
