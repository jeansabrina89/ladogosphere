import { createSupabaseServerClient } from "../../../../src/lib/supabase-server";
import { redirect } from "next/navigation";
import { supabase } from "../../../../src/lib/supabase";
import BoutonImprimer from "../[id]/BoutonImprimer";
import Link from "next/link";

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export default async function CertificatSalaireAnnuelPage({
  searchParams,
}: {
  searchParams: Promise<{ employe_id?: string; annee?: string }>;
}) {
  const params = await searchParams;
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role, email").eq("id", user.id).single();
  if (!["admin", "employe"].includes(profile?.role)) redirect("/");

  const annee = parseInt(params.annee || new Date().getFullYear().toString());

  // Si employé, on prend son propre ID
  let employe_id = params.employe_id;
  if (profile?.role === "employe") {
    const { data: emp } = await supabase
      .from("employes_rh").select("id").eq("email", profile.email ?? "").single();
    employe_id = emp?.id;
  }

  if (!employe_id) {
    return (
      <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
        <div className="max-w-3xl mx-auto bg-white rounded-xl p-8">
          <p className="text-red-500">Employé non spécifié.</p>
          <Link href="/employes/fiches-salaire" className="text-blue-500">← Retour</Link>
        </div>
      </main>
    );
  }

  const { data: employe } = await supabase
    .from("employes_rh")
    .select("*")
    .eq("id", employe_id)
    .single();

  const { data: fiches } = await supabase
    .from("fiches_salaire")
    .select("*, fiche_salaire_deductions(*)")
    .eq("employe_id", employe_id)
    .eq("annee", annee)
    .order("mois", { ascending: true });

  if (!employe) return <div>Employé introuvable</div>;

  const totalBrut = fiches?.reduce((acc, f) => acc + Number(f.salaire_brut), 0) ?? 0;
  const totalNet = fiches?.reduce((acc, f) => acc + Number(f.salaire_net), 0) ?? 0;
  const totalDeductions = fiches?.reduce((acc, f) => acc + Number(f.total_deductions), 0) ?? 0;
  const dateGeneration = new Date().toLocaleDateString("fr-CH");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print { display: none !important; }
          nav { display: none !important; }
          header { display: none !important; }
          body { background: white !important; }
          @page { margin: 1.5cm; size: A4; }
        }
      `}} />

      {/* Boutons */}
      <div className="no-print p-4 flex gap-3">
        <BoutonImprimer />
        <Link href="/employes/fiches-salaire"
          className="px-4 py-2 rounded-xl font-semibold text-sm"
          style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
          ← Retour
        </Link>
      </div>

      {/* Certificat */}
      <div className="max-w-3xl mx-auto bg-white p-10 shadow-sm mb-8">

        {/* En-tête */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <img src="/Logo.png" alt="La Dogosphère" style={{ height: "70px", marginBottom: "8px" }} />
            <p className="text-sm text-gray-500">Pension canine</p>
            <p className="text-sm text-gray-500">Sion, Valais</p>
            <p className="text-sm text-gray-500">ladogosphere@gmail.com</p>
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-bold mb-1" style={{ color: "#1B2B5E" }}>
              CERTIFICAT DE SALAIRE
            </h2>
            <p className="text-sm font-semibold">Année {annee}</p>
            <p className="text-sm text-gray-500">Généré le {dateGeneration}</p>
          </div>
        </div>

        <div className="border-t-2 mb-6" style={{ borderColor: "#1B2B5E" }} />

        {/* Employé */}
        <div className="mb-6">
          <h3 className="font-bold text-sm uppercase tracking-wide text-gray-400 mb-2">Employé</h3>
          <p className="font-bold text-lg" style={{ color: "#1B2B5E" }}>
            {employe.prenom} {employe.nom}
          </p>
          <p className="text-sm text-gray-500">
            {employe.poste === "Autre" ? employe.poste_autre || "Autre" : employe.poste || "—"}
            {" — "}{employe.taux_travail}%
          </p>
          {employe.adresse && <p className="text-sm text-gray-500">📍 {employe.adresse}</p>}
          <p className="text-sm text-gray-500">✉️ {employe.email}</p>
          {employe.telephone && <p className="text-sm text-gray-500">📞 {employe.telephone}</p>}
          {employe.date_entree && (
            <p className="text-sm text-gray-500">
              Entrée : {new Date(employe.date_entree).toLocaleDateString("fr-CH")}
            </p>
          )}
        </div>

        {/* Tableau récapitulatif */}
        {fiches && fiches.length > 0 ? (
          <>
            <table className="w-full mb-6 text-sm">
              <thead>
                <tr style={{ backgroundColor: "#1B2B5E", color: "white" }}>
                  <th className="px-4 py-3 text-left rounded-tl-lg">Mois</th>
                  <th className="px-4 py-3 text-right">Brut</th>
                  <th className="px-4 py-3 text-right">Déductions</th>
                  <th className="px-4 py-3 text-right rounded-tr-lg">Net</th>
                </tr>
              </thead>
              <tbody>
                {fiches.map((f: any) => (
                  <tr key={f.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">{MOIS[f.mois - 1]}</td>
                    <td className="px-4 py-3 text-right">
                      CHF {Number(f.salaire_brut).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600">
                      - CHF {Number(f.total_deductions).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: "#1B2B5E" }}>
                      CHF {Number(f.salaire_net).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: "#F5F0E8" }}>
                  <td className="px-4 py-3 font-bold">Total {annee}</td>
                  <td className="px-4 py-3 text-right font-bold">
                    CHF {totalBrut.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-red-600">
                    - CHF {totalDeductions.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold" style={{ color: "#1B2B5E" }}>
                    CHF {totalNet.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Résumé */}
            <div className="bg-gray-50 rounded-xl p-4 mb-6 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Total brut</p>
                <p className="font-bold text-lg" style={{ color: "#4AAEA0" }}>
                  CHF {totalBrut.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Total déductions</p>
                <p className="font-bold text-lg text-red-500">
                  - CHF {totalDeductions.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Total net</p>
                <p className="font-bold text-lg" style={{ color: "#1B2B5E" }}>
                  CHF {totalNet.toFixed(2)}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
            <p className="text-yellow-700 text-sm">
              ⚠️ Aucune fiche de salaire trouvée pour l'année {annee}.
            </p>
          </div>
        )}

        {/* Signature */}
        <div className="mt-8 flex justify-between items-end">
          <div>
            <p className="text-sm text-gray-500 mb-6">Sion, le {dateGeneration}</p>
            <div style={{ borderTop: "1px solid #1B2B5E", width: "200px", paddingTop: "8px" }}>
              <p className="text-sm font-semibold" style={{ color: "#1B2B5E" }}>Sabrina Jean</p>
              <p className="text-xs text-gray-500">La Dogosphère Sàrl — Responsable</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Mois couverts : {fiches?.length ?? 0}/12</p>
            <p className="text-xs text-gray-400">Taux : {employe.taux_travail}%</p>
          </div>
        </div>

        {/* Pied de page */}
        <div className="border-t mt-8 pt-6 text-center text-xs text-gray-400">
          <p>La Dogosphère Sàrl — Pension canine — Sion, Valais</p>
          <p>Document confidentiel — Certificat de salaire {annee}</p>
        </div>

      </div>
    </>
  );
}