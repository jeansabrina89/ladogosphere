import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import BoutonImprimer from "./BoutonImprimer";
import Link from "next/link";

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

export default async function FicheSalairePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { id } = await params;
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role, email").eq("id", user.id).single();
  if (!["admin", "employe"].includes(profile?.role)) redirect("/");

  const { data: fiche } = await supabase
    .from("fiches_salaire")
    .select("*, employes_rh(prenom, nom, email, taux_travail, poste, poste_autre, adresse, telephone)")
    .eq("id", id)
    .single();

  if (!fiche) return <div>Fiche introuvable</div>;

  // Vérifier que l'employé ne voit que sa propre fiche
  if (profile?.role === "employe" && fiche.employes_rh?.email !== profile.email) {
    redirect("/employes/mon-espace");
  }

  const { data: deductions } = await supabase
    .from("fiche_salaire_deductions")
    .select("*")
    .eq("fiche_id", id)
    .order("ordre");

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
        {profile?.role === "admin" && (
          <Link href="/employes/fiches-salaire"
            className="px-4 py-2 rounded-xl font-semibold text-sm"
            style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
            ← Retour
          </Link>
        )}
        {profile?.role === "employe" && (
          <Link href="/employes/mon-espace/fiches-salaire"
            className="px-4 py-2 rounded-xl font-semibold text-sm"
            style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
            ← Retour
          </Link>
        )}
      </div>

      {/* Fiche */}
      <div className="max-w-3xl mx-auto bg-white p-10 shadow-sm mb-8">

        {/* En-tête */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <img src="/Logo.png" alt="La Dogosphère" style={{ height: "70px", marginBottom: "8px" }} />
            <p className="text-sm text-gray-500">Pension canine</p>
            <p className="text-sm text-gray-500">Sion, Valais</p>
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-bold mb-1" style={{ color: "#1B2B5E" }}>FICHE DE SALAIRE</h2>
            <p className="text-sm font-semibold">{MOIS[fiche.mois - 1]} {fiche.annee}</p>
          </div>
        </div>

        <div className="border-t-2 mb-6" style={{ borderColor: "#1B2B5E" }} />

        {/* Employé */}
<div className="mb-6">
  <h3 className="font-bold text-sm uppercase tracking-wide text-gray-400 mb-2">Employé</h3>
  <p className="font-bold text-lg" style={{ color: "#1B2B5E" }}>
    {fiche.employes_rh?.prenom} {fiche.employes_rh?.nom}
  </p>
  <p className="text-sm text-gray-500">
    {fiche.employes_rh?.poste === "Autre"
      ? fiche.employes_rh?.poste_autre || "Autre"
      : fiche.employes_rh?.poste || "—"}
    {" — "}{fiche.employes_rh?.taux_travail}%
  </p>
  {fiche.employes_rh?.adresse && (
    <p className="text-sm text-gray-500">📍 {fiche.employes_rh.adresse}</p>
  )}
  <p className="text-sm text-gray-500">✉️ {fiche.employes_rh?.email}</p>
  {fiche.employes_rh?.telephone && (
    <p className="text-sm text-gray-500">📞 {fiche.employes_rh.telephone}</p>
  )}
</div>

        {/* Tableau salaire */}
        <table className="w-full mb-6 text-sm">
          <thead>
            <tr style={{ backgroundColor: "#1B2B5E", color: "white" }}>
              <th className="px-4 py-3 text-left rounded-tl-lg">Description</th>
              <th className="px-4 py-3 text-right rounded-tr-lg">Montant</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b bg-green-50">
              <td className="px-4 py-3 font-semibold">Salaire brut</td>
              <td className="px-4 py-3 text-right font-bold text-green-700">
                CHF {Number(fiche.salaire_brut).toFixed(2)}
              </td>
            </tr>
            {deductions?.map((d: any) => (
              <tr key={d.id} className="border-b">
                <td className="px-4 py-3 text-gray-600">
                  {d.label}
                  <span className="ml-2 text-xs text-gray-400">
                    ({d.type === "pourcentage" ? `${d.valeur}%` : "fixe"})
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-red-600 font-semibold">
                  - CHF {Number(d.montant_calcule).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: "#F5F0E8" }}>
              <td className="px-4 py-3 font-bold text-sm uppercase">Total déductions</td>
              <td className="px-4 py-3 text-right text-red-600 font-bold">
                - CHF {Number(fiche.total_deductions).toFixed(2)}
              </td>
            </tr>
            <tr style={{ backgroundColor: "#1B2B5E" }}>
              <td className="px-4 py-3 font-bold text-white text-lg">SALAIRE NET</td>
              <td className="px-4 py-3 text-right font-bold text-white text-xl">
                CHF {Number(fiche.salaire_net).toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>

        {fiche.commentaire && (
          <div className="border rounded-xl p-4 mb-6 text-sm text-gray-600">
            <strong>Commentaire :</strong> {fiche.commentaire}
          </div>
        )}

        {/* Pied de page */}
        <div className="border-t pt-6 text-center text-xs text-gray-400">
          <p>La Dogosphère Sàrl — Pension canine — Sion, Valais</p>
          <p>Document confidentiel — {MOIS[fiche.mois - 1]} {fiche.annee}</p>
        </div>
      </div>
    </>
  );
}