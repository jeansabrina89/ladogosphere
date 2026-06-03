import Link from "next/link";
import { supabase } from "../../src/lib/supabase";

export default async function ChiensPage() {
  const { data: chiens } = await supabase
    .from("chiens")
    .select(`*, clients (prenom, nom)`)
    .order("nom");

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-7xl mx-auto">

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-4xl font-bold" style={{ color: "#1B2B5E" }}>🐶 Chiens</h1>
          <Link href="/chiens/nouveau"
            className="px-4 py-2 rounded-xl font-semibold text-white"
            style={{ backgroundColor: "#4AAEA0" }}>
            ➕ Nouveau chien
          </Link>
        </div>

        <p className="font-semibold mb-4" style={{ color: "#1B2B5E" }}>
          {chiens?.length ?? 0} chien(s)
        </p>

        <div className="grid gap-4">
          {chiens?.map((chien: any) => (
            <Link key={chien.id} href={`/chiens/${chien.id}`}
              className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition">
              <div className="flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-lg" style={{ color: "#1B2B5E" }}>
                      {chien.sexe === "F" ? "♀️" : "♂️"} {chien.nom}
                    </p>
                    {!chien.actif && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">
                        Archivé
                      </span>
                    )}
                    {chien.journee_essai_invalide && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                        ❌ Essai invalide
                      </span>
                    )}
                    {chien.journee_essai_effectuee && !chien.journee_essai_invalide && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                        ✅ Essai effectué
                      </span>
                    )}
                    {!chien.journee_essai_effectuee && !chien.journee_essai_invalide && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                        ⏳ Essai à faire
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{chien.race || "—"}</p>
                  <p className="text-sm text-gray-400">
                    👤 {chien.clients?.prenom} {chien.clients?.nom}
                  </p>
                </div>
                <div className="text-right text-sm text-gray-500">
                  <p>{chien.poids ? `${chien.poids} kg` : "—"}</p>
                  <p>{
                    chien.categorie_poids === "moins_15kg" ? "🟢 Petit" :
                    chien.categorie_poids === "15_30kg" ? "🟡 Moyen" :
                    chien.categorie_poids === "30_40kg" ? "🔴 Grand" : "—"
                  }</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

      </div>
    </main>
  );
}