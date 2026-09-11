import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatDateFR } from "@/src/lib/dates";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import FormEcriture from "./FormEcriture";
import { anneesExercices } from "@/src/lib/exercices";
import { entiteA } from "@/src/lib/entiteJuridique";
import { comptesSaisissables, renommerComptes } from "@/src/lib/entiteJuridiqueLogique";

const MOIS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const r2 = (n: number) => Math.round(n * 100) / 100;

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string; mois?: string }>;
}) {
  await exigerAdminPage();

  const params = await searchParams;
  const anneesDisponibles = await anneesExercices();
  const annee = parseInt(params.annee || String(new Date().getFullYear()));
  const moisFiltre = params.mois ? parseInt(params.mois) : null;
  const debut = moisFiltre ? `${annee}-${String(moisFiltre).padStart(2, "0")}-01` : `${annee}-01-01`;
  const fin = moisFiltre ? new Date(annee, moisFiltre, 0).toISOString().split("T")[0] : `${annee}-12-31`;

  const { data: comptesDb } = await supabaseAdmin
    .from("comptes").select("numero, libelle, type").eq("actif", true).order("numero");

  // La forme juridique en vigueur sur la période affichée : c’est elle qui
  // décide de l’étiquette du capital et de la présence du compte privé.
  const entite = await entiteA(fin);
  const comptes = renommerComptes(
    (comptesDb ?? []) as { numero: string; libelle: string; type: string }[],
    entite.forme
  );

  const { data: ecritures } = await supabaseAdmin
    .from("ecritures")
    .select("id, date_ecriture, libelle, piece_type, ecritures_lignes (compte_numero, debit, credit)")
    .gte("date_ecriture", debut)
    .lte("date_ecriture", fin)
    .order("date_ecriture", { ascending: true })
    .order("created_at", { ascending: true });

  const libelleCompte = new Map(comptes.map((c) => [c.numero, c.libelle]));

  let totalDebit = 0, totalCredit = 0;
  for (const e of (ecritures ?? []) as any[]) {
    for (const l of (e.ecritures_lignes ?? []) as any[]) {
      totalDebit += Number(l.debit) || 0;
      totalCredit += Number(l.credit) || 0;
    }
  }
  totalDebit = r2(totalDebit); totalCredit = r2(totalCredit);

  const marine = "#1B2B5E";
  const sousTexte = "rgba(27,43,94,0.55)";
  const bordure = "1px solid rgba(27,43,94,0.12)";
  const lienStyle = (actif: boolean, couleur: string) => ({
    backgroundColor: actif ? couleur : "white",
    color: actif ? "white" : marine,
    border: bordure,
  });

  const periode = moisFiltre ? `${MOIS[moisFiltre - 1]} ${annee}` : String(annee);
  const hrefBase = (a: number, m: number | null) => `/comptabilite/journal?annee=${a}${m ? `&mois=${m}` : ""}`;
  const exportHref = `/api/comptabilite/journal-export?annee=${annee}${moisFiltre ? `&mois=${moisFiltre}` : ""}`;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">
        <EnTete
          titre="📒 Journal comptable"
          sousTitre="Toutes tes écritures, créées automatiquement à chaque opération. Tu n'ajoutes à la main que les dépenses et frais."
          action={<Bouton href="/comptabilite" variante="secondaire">← Comptabilité</Bouton>}
        />

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: marine }}>Année :</span>
          {anneesDisponibles.map(a => (
            <a key={a} href={hrefBase(a, null)} className="px-3 py-1 rounded-lg text-sm font-semibold transition" style={lienStyle(a === annee, marine)}>{a}</a>
          ))}
        </div>
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: marine }}>Mois :</span>
          <a href={hrefBase(annee, null)} className="px-3 py-1 rounded-lg text-sm font-semibold transition" style={lienStyle(!moisFiltre, marine)}>Toute l&apos;année</a>
          {MOIS.map((m, idx) => (
            <a key={idx} href={hrefBase(annee, idx + 1)} className="px-3 py-1 rounded-lg text-sm font-semibold transition" style={lienStyle(moisFiltre === idx + 1, "#4AAEA0")}>{m}</a>
          ))}
        </div>

        {/* Le compte privé 2850 n’est proposé qu’en raison individuelle : une
            société ne fait pas de prélèvement privé. Il reste visible partout
            ailleurs — cacher un compte qui porte un solde cacherait de l’argent. */}
        <FormEcriture comptes={comptesSaisissables(comptes, entite.forme)} />

        <div className="mt-6">
          <Carte>
            <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
              <h2 className="font-bold" style={{ color: marine }}>
                Écritures — {periode}
                <span className="ml-2 text-sm font-normal" style={{ color: sousTexte }}>({ecritures?.length ?? 0})</span>
              </h2>
              <a href={exportHref} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: "#2E8B7E" }}>
                📥 Télécharger ce mois (Excel)
              </a>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-xl p-3 text-center" style={{ border: bordure }}>
                <p className="text-lg font-bold" style={{ color: marine }}>{totalDebit.toFixed(2)}</p>
                <p className="text-xs" style={{ color: sousTexte }}>Total débit</p>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ border: bordure }}>
                <p className="text-lg font-bold" style={{ color: marine }}>{totalCredit.toFixed(2)}</p>
                <p className="text-xs" style={{ color: sousTexte }}>Total crédit</p>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ border: bordure }}>
                <p className="text-lg font-bold" style={{ color: Math.abs(totalDebit - totalCredit) < 0.009 ? "#1F6E5B" : "#A8453A" }}>
                  {Math.abs(totalDebit - totalCredit) < 0.009 ? "équilibré" : (totalDebit - totalCredit).toFixed(2)}
                </p>
                <p className="text-xs" style={{ color: sousTexte }}>Contrôle</p>
              </div>
            </div>

            {(!ecritures || ecritures.length === 0) ? (
              <p className="text-sm" style={{ color: sousTexte }}>Aucune écriture pour cette période.</p>
            ) : (
              <div className="space-y-4">
                {ecritures.map((e: any) => (
                  <div key={e.id} className="rounded-xl p-3" style={{ border: bordure }}>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-semibold" style={{ color: marine }}>{e.libelle}</span>
                      <span style={{ color: sousTexte }}>{formatDateFR(e.date_ecriture)}</span>
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {(e.ecritures_lignes ?? []).map((l: any, i: number) => (
                          <tr key={i}>
                            <td className="py-0.5">{l.compte_numero} — {libelleCompte.get(l.compte_numero) ?? ""}</td>
                            <td className="py-0.5 text-right" style={{ width: 110 }}>{Number(l.debit) > 0 ? Number(l.debit).toFixed(2) : ""}</td>
                            <td className="py-0.5 text-right" style={{ width: 110 }}>{Number(l.credit) > 0 ? Number(l.credit).toFixed(2) : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </Carte>
        </div>
      </div>
    </main>
  );
}
