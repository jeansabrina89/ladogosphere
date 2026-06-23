import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatDateFR } from "@/src/lib/dates";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";

const r2 = (n: number) => Math.round(n * 100) / 100;
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

  const { data: comptes } = await supabaseAdmin
    .from("comptes").select("numero, libelle, type").order("numero");

  const { data: ecritures } = await supabaseAdmin
    .from("ecritures")
    .select("id, date_ecriture, libelle, ecritures_lignes (compte_numero, debit, credit)")
    .gte("date_ecriture", `${annee}-01-01`)
    .lte("date_ecriture", `${annee}-12-31`)
    .order("date_ecriture", { ascending: true })
    .order("created_at", { ascending: true });

  const meta = new Map((comptes ?? []).map((c: any) => [c.numero, { libelle: c.libelle, type: c.type }]));

  type Ligne = { compte: string; date: string; libelle: string; debit: number; credit: number };
  const lignes: Ligne[] = [];
  for (const e of (ecritures ?? []) as any[]) {
    for (const l of (e.ecritures_lignes ?? []) as any[]) {
      lignes.push({
        compte: l.compte_numero,
        date: e.date_ecriture,
        libelle: e.libelle,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      });
    }
  }

  const parCompte = new Map<string, { debit: number; credit: number; lignes: Ligne[] }>();
  for (const l of lignes) {
    if (!parCompte.has(l.compte)) parCompte.set(l.compte, { debit: 0, credit: 0, lignes: [] });
    const acc = parCompte.get(l.compte)!;
    acc.debit += l.debit; acc.credit += l.credit; acc.lignes.push(l);
  }

  const balance = [...parCompte.entries()].map(([numero, v]) => ({
    numero,
    libelle: meta.get(numero)?.libelle ?? "",
    type: meta.get(numero)?.type ?? "",
    debit: r2(v.debit),
    credit: r2(v.credit),
    solde: r2(v.debit - v.credit),
  })).sort((a, b) => a.numero.localeCompare(b.numero));

  const totalDebit = r2(balance.reduce((s, b) => s + b.debit, 0));
  const totalCredit = r2(balance.reduce((s, b) => s + b.credit, 0));

  const produits = balance.filter(b => b.type === "produit").map(b => ({ ...b, montant: r2(b.credit - b.debit) }));
  const charges = balance.filter(b => b.type === "charge").map(b => ({ ...b, montant: r2(b.debit - b.credit) }));
  const totalProduits = r2(produits.reduce((s, p) => s + p.montant, 0));
  const totalCharges = r2(charges.reduce((s, c) => s + c.montant, 0));
  const resultat = r2(totalProduits - totalCharges);

  const actifs = balance.filter(b => b.type === "actif").map(b => ({ ...b, montant: r2(b.debit - b.credit) }));
  const passifs = balance.filter(b => b.type === "passif").map(b => ({ ...b, montant: r2(b.credit - b.debit) }));
  const totalActif = r2(actifs.reduce((s, a) => s + a.montant, 0));
  const totalPassifHorsResultat = r2(passifs.reduce((s, p) => s + p.montant, 0));
  const totalPassif = r2(totalPassifHorsResultat + resultat);

  const grandLivre = balance.map(b => {
    let solde = 0;
    const mvts = (parCompte.get(b.numero)?.lignes ?? []).map(l => {
      solde = r2(solde + l.debit - l.credit);
      return { ...l, solde };
    });
    return { numero: b.numero, libelle: b.libelle, mvts };
  });

  const marine = "#1B2B5E";
  const sousTexte = "rgba(27,43,94,0.55)";
  const bordure = "1px solid rgba(27,43,94,0.12)";

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">
        <EnTete
          titre="📊 Rapports comptables"
          sousTitre={`Compte de résultat, bilan, balance et grand-livre — exercice ${annee}`}
          action={<Bouton href="/comptabilite" variante="secondaire">← Comptabilité</Bouton>}
        />

        <div className="flex items-center gap-2 mb-6">
          <span className="text-sm font-semibold" style={{ color: marine }}>Exercice :</span>
          {[2025, 2026, 2027, 2028].map(a => (
            <a key={a} href={`/comptabilite/rapports?annee=${a}`}
              className="px-3 py-1 rounded-lg text-sm font-semibold transition"
              style={{ backgroundColor: a === annee ? marine : "white", color: a === annee ? "white" : marine, border: bordure }}>
              {a}
            </a>
          ))}
        </div>

        {balance.length === 0 ? (
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
                  {produits.map(p => (
                    <tr key={p.numero}>
                      <td className="py-0.5" style={{ color: sousTexte }}>{p.numero} — {p.libelle}</td>
                      <td className="py-0.5 text-right" style={{ color: marine }}>{chf(p.montant)}</td>
                    </tr>
                  ))}
                  <tr><td className="py-1 font-semibold" style={{ color: marine }}>Total produits</td><td className="py-1 text-right font-semibold" style={{ color: marine }}>{chf(totalProduits)}</td></tr>
                  <tr><td colSpan={2} className="pt-3 pb-2 font-semibold" style={{ color: marine }}>Charges</td></tr>
                  {charges.map(c => (
                    <tr key={c.numero}>
                      <td className="py-0.5" style={{ color: sousTexte }}>{c.numero} — {c.libelle}</td>
                      <td className="py-0.5 text-right" style={{ color: marine }}>{chf(c.montant)}</td>
                    </tr>
                  ))}
                  <tr><td className="py-1 font-semibold" style={{ color: marine }}>Total charges</td><td className="py-1 text-right font-semibold" style={{ color: marine }}>{chf(totalCharges)}</td></tr>
                </tbody>
              </table>
              <div className="mt-4 pt-3 flex justify-between items-center" style={{ borderTop: bordure }}>
                <span className="font-bold" style={{ color: marine }}>Résultat de l&apos;exercice</span>
                <span className="font-bold text-lg" style={{ color: resultat >= 0 ? "#1F6E5B" : "#A8453A" }}>{chf(resultat)}</span>
              </div>
            </Carte>

            <Carte>
              <h2 className="font-bold mb-4" style={{ color: marine }}>Bilan</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="font-semibold mb-2" style={{ color: marine }}>Actif</p>
                  <table className="w-full text-sm">
                    <tbody>
                      {actifs.map(a => (
                        <tr key={a.numero}>
                          <td className="py-0.5" style={{ color: sousTexte }}>{a.numero} — {a.libelle}</td>
                          <td className="py-0.5 text-right" style={{ color: marine }}>{chf(a.montant)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-2 pt-2 flex justify-between font-bold" style={{ borderTop: bordure, color: marine }}>
                    <span>Total actif</span><span>{chf(totalActif)}</span>
                  </div>
                </div>
                <div>
                  <p className="font-semibold mb-2" style={{ color: marine }}>Passif</p>
                  <table className="w-full text-sm">
                    <tbody>
                      {passifs.map(p => (
                        <tr key={p.numero}>
                          <td className="py-0.5" style={{ color: sousTexte }}>{p.numero} — {p.libelle}</td>
                          <td className="py-0.5 text-right" style={{ color: marine }}>{chf(p.montant)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="py-0.5" style={{ color: sousTexte }}>Résultat de l&apos;exercice</td>
                        <td className="py-0.5 text-right" style={{ color: marine }}>{chf(resultat)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="mt-2 pt-2 flex justify-between font-bold" style={{ borderTop: bordure, color: marine }}>
                    <span>Total passif</span><span>{chf(totalPassif)}</span>
                  </div>
                </div>
              </div>
              {Math.abs(totalActif - totalPassif) > 0.009 && (
                <p className="mt-3 text-xs" style={{ color: "#A8453A" }}>
                  ⚠️ Écart actif/passif de {chf(r2(totalActif - totalPassif))} — à vérifier.
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
                    {balance.map(b => (
                      <tr key={b.numero} style={{ borderTop: bordure }}>
                        <td className="py-1" style={{ color: marine }}>{b.numero} — {b.libelle}</td>
                        <td className="py-1 text-right" style={{ color: sousTexte }}>{b.debit ? b.debit.toFixed(2) : ""}</td>
                        <td className="py-1 text-right" style={{ color: sousTexte }}>{b.credit ? b.credit.toFixed(2) : ""}</td>
                        <td className="py-1 text-right font-semibold" style={{ color: marine }}>{b.solde.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: `2px solid ${marine}` }}>
                      <td className="py-1 font-bold" style={{ color: marine }}>Totaux</td>
                      <td className="py-1 text-right font-bold" style={{ color: marine }}>{totalDebit.toFixed(2)}</td>
                      <td className="py-1 text-right font-bold" style={{ color: marine }}>{totalCredit.toFixed(2)}</td>
                      <td className="py-1 text-right font-bold" style={{ color: Math.abs(totalDebit - totalCredit) < 0.009 ? "#1F6E5B" : "#A8453A" }}>
                        {Math.abs(totalDebit - totalCredit) < 0.009 ? "équilibrée" : (totalDebit - totalCredit).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Carte>

            <Carte>
              <h2 className="font-bold mb-4" style={{ color: marine }}>Grand-livre</h2>
              <div className="space-y-5">
                {grandLivre.map(g => (
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
