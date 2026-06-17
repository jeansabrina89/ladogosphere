import { exigerPersonnelPage } from "@/src/lib/exigerPersonnelPage";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatDateFR } from "@/src/lib/dates";
import { bloquerPeriodeEssai, debloquerPeriodeEssai } from "./actions";

export default async function CalendrierEssaisPage() {
  await exigerPersonnelPage();
  const perms = await getProfilePerms();

  if (!perms.perm_journee_essai) {
    return (
      <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
        <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-4xl mb-4">🔒</p>
          <h1 className="text-2xl font-bold mb-2" style={{ color: "#1B2B5E" }}>Accès non autorisé</h1>
          <p className="text-gray-600">Tu n'as pas la permission de gérer les journées d'essai.</p>
          <a href="/" className="inline-block mt-4 px-6 py-3 rounded-xl font-semibold text-white" style={{ backgroundColor: "#4AAEA0" }}>
            ← Retour
          </a>
        </div>
      </main>
    );
  }

  const { data: periodes } = await supabaseAdmin
    .from("fermetures_essai")
    .select("id, date_debut, date_fin, motif")
    .order("date_debut", { ascending: true });

  const aujourdHui = new Date().toISOString().split("T")[0];

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto space-y-6">

        <div>
          <h1 className="text-4xl font-bold mb-1" style={{ color: "#1B2B5E" }}>
            🚫 Journées d'essai fermées
          </h1>
          <p className="text-gray-600">
            Bloque des périodes pendant lesquelles aucune journée d'essai ne peut être réservée
            (vacances, fermeture…). Les séjours et la garderie ne sont pas affectés.
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="font-bold text-lg mb-4" style={{ color: "#1B2B5E" }}>Bloquer une période</h2>
          <form action={bloquerPeriodeEssai} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Du *</label>
                <input name="date_debut" type="date" required min={aujourdHui} className="w-full border rounded-xl p-3" />
              </div>
              <div>
                <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Au *</label>
                <input name="date_fin" type="date" required min={aujourdHui} className="w-full border rounded-xl p-3" />
              </div>
            </div>
            <div>
              <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Motif (optionnel)</label>
              <input name="motif" type="text" placeholder="Ex : vacances d'été" className="w-full border rounded-xl p-3" />
            </div>
            <button type="submit"
              className="px-6 py-3 rounded-xl font-semibold text-white"
              style={{ backgroundColor: "#2E8B7E" }}>
              🚫 Bloquer cette période
            </button>
          </form>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="font-bold text-lg mb-4" style={{ color: "#1B2B5E" }}>Périodes bloquées</h2>

          {(!periodes || periodes.length === 0) ? (
            <p className="text-gray-500">Aucune période bloquée pour l'instant.</p>
          ) : (
            <div className="space-y-3">
              {periodes.map((p) => {
                const passee = p.date_fin < aujourdHui;
                return (
                  <div key={p.id}
                    className="flex items-center justify-between gap-4 border rounded-xl p-4"
                    style={{ opacity: passee ? 0.5 : 1 }}>
                    <div>
                      <p className="font-semibold" style={{ color: "#1B2B5E" }}>
                        {p.date_debut === p.date_fin
                          ? formatDateFR(p.date_debut)
                          : `${formatDateFR(p.date_debut)} → ${formatDateFR(p.date_fin)}`}
                        {passee && <span className="ml-2 text-xs font-normal text-gray-400">(passée)</span>}
                      </p>
                      {p.motif && <p className="text-sm text-gray-500">{p.motif}</p>}
                    </div>
                    <form action={debloquerPeriodeEssai.bind(null, p.id)}>
                      <button type="submit"
                        className="px-4 py-2 rounded-lg font-semibold text-sm"
                        style={{ backgroundColor: "#FBE2DE", color: "#A8453A" }}>
                        Débloquer
                      </button>
                    </form>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
