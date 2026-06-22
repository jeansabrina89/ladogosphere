import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { getJoursFeries } from "@/src/lib/joursFeries";
import { aujourdhuiISO } from "@/src/lib/dates";
import { redirect } from "next/navigation";
import Link from "next/link";
import BoutonImprimer from "./BoutonImprimer";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";

const NOMS_MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const NOMS_JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const PALETTE: { bg: string; fg: string }[] = [
  { bg: "#DBEFEA", fg: "#1F6E5B" },
  { bg: "#F4EAC9", fg: "#6E5410" },
  { bg: "#FBE2DE", fg: "#A8453A" },
  { bg: "#E0E7FF", fg: "#283C7A" },
  { bg: "#EDE7F6", fg: "#5B3E8E" },
  { bg: "#E6F0D9", fg: "#3B6D11" },
  { bg: "#FDE8D0", fg: "#9A5B12" },
  { bg: "#E2EEF6", fg: "#185FA5" },
];
const STATUTS_PRESENCE = ["travail", "ferie_travaille"];
const STATUTS_VACANCES = ["vacances"];
const STATUTS_ABSENCE = ["maladie", "absent", "accident", "militaire"];
const ICONE_ABSENCE: Record<string, string> = { maladie: "🤒", absent: "❌", accident: "🩹", militaire: "🎖️" };
const LABEL_ABSENCE: Record<string, string> = { maladie: "Maladie", absent: "Absent", accident: "Accident", militaire: "Militaire" };

const STYLE_IMPRESSION = `
@media print {
  @page { size: landscape; margin: 8mm; }
  body { background: #ffffff !important; }
  body * { visibility: hidden; }
  #zone-impression, #zone-impression * { visibility: visible; }
  #zone-impression {
    position: absolute; left: 0; top: 0; width: 100%;
    padding: 0 !important;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .no-print { display: none !important; }
}
`;

export default async function PlanningEquipePage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string; annee?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "employe"].includes(profile?.role ?? "")) redirect("/");

  const params = await searchParams;
  const maintenant = new Date();
  const mois = parseInt(params.mois || String(maintenant.getMonth() + 1));
  const annee = parseInt(params.annee || String(maintenant.getFullYear()));
  const moisPad = String(mois).padStart(2, "0");

  const debut = `${annee}-${moisPad}-01`;
  const fin = new Date(annee, mois, 0).toISOString().split("T")[0];
  const feries = getJoursFeries(annee);
  const aujourdhuiStr = aujourdhuiISO();

  const [{ data: employes }, { data: planning }] = await Promise.all([
    supabaseAdmin.from("employes_rh").select("id, prenom, nom").eq("actif", true).order("nom"),
    supabaseAdmin.from("planning_employes").select("employe_id, date, statut").gte("date", debut).lte("date", fin),
  ]);

  const couleurParId: Record<string, { bg: string; fg: string }> = {};
  const prenomParId: Record<string, string> = {};
  (employes ?? []).forEach((e: any, i: number) => {
    couleurParId[e.id] = PALETTE[i % PALETTE.length];
    prenomParId[e.id] = e.prenom;
  });

  const presentsParJour: Record<string, string[]> = {};
  const vacancesParJour: Record<string, string[]> = {};
  const absencesParJour: Record<string, { id: string; statut: string }[]> = {};
  (planning ?? []).forEach((r: any) => {
    if (STATUTS_PRESENCE.includes(r.statut)) {
      if (!presentsParJour[r.date]) presentsParJour[r.date] = [];
      if (!presentsParJour[r.date].includes(r.employe_id)) presentsParJour[r.date].push(r.employe_id);
    } else if (STATUTS_VACANCES.includes(r.statut)) {
      if (!vacancesParJour[r.date]) vacancesParJour[r.date] = [];
      if (!vacancesParJour[r.date].includes(r.employe_id)) vacancesParJour[r.date].push(r.employe_id);
    } else if (STATUTS_ABSENCE.includes(r.statut)) {
      if (!absencesParJour[r.date]) absencesParJour[r.date] = [];
      if (!absencesParJour[r.date].some((a) => a.id === r.employe_id)) absencesParJour[r.date].push({ id: r.employe_id, statut: r.statut });
    }
  });

  const nbJours = new Date(annee, mois, 0).getDate();
  const offset = (new Date(annee, mois - 1, 1).getDay() + 6) % 7;
  const cases: ({ jour: number; dateStr: string; weekend: boolean } | null)[] = [];
  for (let k = 0; k < offset; k++) cases.push(null);
  for (let d = 1; d <= nbJours; d++) {
    const dateStr = `${annee}-${moisPad}-${String(d).padStart(2, "0")}`;
    const js = new Date(annee, mois - 1, d).getDay();
    cases.push({ jour: d, dateStr, weekend: js === 0 || js === 6 });
  }

  const moisPrec = mois === 1 ? { m: 12, a: annee - 1 } : { m: mois - 1, a: annee };
  const moisSuiv = mois === 12 ? { m: 1, a: annee + 1 } : { m: mois + 1, a: annee };

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <style dangerouslySetInnerHTML={{ __html: STYLE_IMPRESSION }} />
      <div id="zone-impression" className="max-w-6xl mx-auto">
        <EnTete
          titre="👥 Planning de l'équipe"
          action={
            <div className="no-print" style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <BoutonImprimer />
              <Bouton href="/employes/mon-espace" variante="secondaire">← Mon espace</Bouton>
            </div>
          }
        />

        <div className="flex items-center justify-center gap-4 mb-6">
          <Link href={`/employes/planning-equipe?mois=${moisPrec.m}&annee=${moisPrec.a}`}
            className="no-print px-3 py-2 rounded-xl font-semibold" style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>←</Link>
          <span className="text-lg font-bold" style={{ color: "#1B2B5E" }}>{NOMS_MOIS[mois - 1]} {annee}</span>
          <Link href={`/employes/planning-equipe?mois=${moisSuiv.m}&annee=${moisSuiv.a}`}
            className="no-print px-3 py-2 rounded-xl font-semibold" style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>→</Link>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {NOMS_JOURS.map((j) => (
            <div key={j} className="text-center text-xs font-semibold py-1" style={{ color: "rgba(27,43,94,0.55)" }}>{j}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cases.map((c, i) => {
            if (!c) return <div key={`v${i}`} />;
            const presents = presentsParJour[c.dateStr] ?? [];
            const enConge = vacancesParJour[c.dateStr] ?? [];
            const absences = absencesParJour[c.dateStr] ?? [];
            const estFerie = feries.includes(c.dateStr);
            const estAujourdhui = c.dateStr === aujourdhuiStr;
            return (
              <div key={c.dateStr} className="rounded-lg p-1.5 flex flex-col gap-1"
                style={{ minHeight: 96, background: estFerie ? "#F8EFD3" : c.weekend ? "#EDE8DF" : "#FFFFFF", border: estAujourdhui ? "2px solid #2E8B7E" : estFerie ? "0.5px solid #C9A84C" : "0.5px solid rgba(27,43,94,0.12)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: estAujourdhui ? "#2E8B7E" : "rgba(27,43,94,0.55)", fontWeight: estAujourdhui ? 800 : 600 }}>{c.jour}</span>
                  {estAujourdhui
                    ? <span style={{ fontSize: 10, fontWeight: 700, color: "#2E8B7E" }}>Auj.</span>
                    : estFerie ? <span style={{ fontSize: 10, fontWeight: 700, color: "#6E5410" }}>Férié</span> : null}
                </div>
                {presents.map((id) => (
                  <span key={id} className="text-xs rounded-full px-2 truncate"
                    style={{ background: couleurParId[id]?.bg ?? "#EDE8DF", color: couleurParId[id]?.fg ?? "#1B2B5E", lineHeight: "1.6" }}>
                    {prenomParId[id] ?? "?"}
                  </span>
                ))}
                {absences.map((a) => (
                  <span key={`abs-${a.id}`} className="text-xs rounded-full px-2 truncate"
                    title={LABEL_ABSENCE[a.statut] ?? "Absence"}
                    style={{ background: "#FBE2DE", color: "#A8453A", lineHeight: "1.6" }}>
                    {ICONE_ABSENCE[a.statut] ?? "⚠️"} {prenomParId[a.id] ?? "?"}
                  </span>
                ))}
                {enConge.map((id) => (
                  <span key={`vac-${id}`} className="text-xs rounded-full px-2 truncate"
                    style={{ background: "#F1ECE3", color: "#9A8F7E", lineHeight: "1.6" }}>
                    🌴 {prenomParId[id] ?? "?"}
                  </span>
                ))}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3 mt-6">
          {(employes ?? []).map((e: any) => (
            <div key={e.id} className="flex items-center gap-2 text-sm" style={{ color: "#1B2B5E" }}>
              <span className="inline-block rounded-full" style={{ width: 12, height: 12, background: couleurParId[e.id]?.fg }} />
              {e.prenom} {e.nom}
            </div>
          ))}
          <div className="flex items-center gap-2 text-sm" style={{ color: "#A8453A" }}>
            <span className="inline-block rounded-full" style={{ width: 12, height: 12, background: "#FBE2DE", border: "1px solid #A8453A" }} />
            Absent / malade
          </div>
          <div className="flex items-center gap-2 text-sm" style={{ color: "#9A8F7E" }}>
            <span>🌴</span> En vacances
          </div>
          <div className="flex items-center gap-2 text-sm" style={{ color: "#6E5410" }}>
            <span className="inline-block rounded" style={{ width: 12, height: 12, background: "#F8EFD3", border: "1px solid #C9A84C" }} />
            Jour férié
          </div>
          <div className="flex items-center gap-2 text-sm" style={{ color: "#2E8B7E" }}>
            <span className="inline-block rounded" style={{ width: 12, height: 12, border: "2px solid #2E8B7E" }} />
            Aujourd'hui
          </div>
        </div>

        {(employes ?? []).length === 0 && (
          <p className="text-center mt-8 text-[rgba(27,43,94,0.45)]">Aucun employé actif.</p>
        )}
      </div>
    </main>
  );
}
