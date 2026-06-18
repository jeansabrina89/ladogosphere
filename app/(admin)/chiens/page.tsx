import Link from "next/link";
import { exigerPersonnelPage } from "@/src/lib/exigerPersonnelPage";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { getProfilePerms } from "@/src/lib/getProfilePerms";

export default async function ChiensPage() {
  await exigerPersonnelPage();
  const perms = await getProfilePerms();
  const supabase = supabaseAdmin;
  const { data: chiens } = await supabase
    .from("chiens")
    .select(`*, clients (prenom, nom)`)
    .order("nom");

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-7xl mx-auto">

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-4xl font-bold" style={{ color: "#1B2B5E" }}>🐶 Chiens</h1>
          {perms.perm_chiens_creer && (
            <Link href="/chiens/nouveau"
              className="px-4 py-2 rounded-xl font-semibold text-white"
              style={{ backgroundColor: "#4AAEA0" }}>
              ➕ Nouveau chien
            </Link>
          )}
        </div>

        <p className="font-semibold mb-4" style={{ color: "#1B2B5E" }}>
          {chiens?.length ?? 0} chien(s)
        </p>

        <div className="grid gap-4">
          {chiens?.map((chien: any) => (
            <Link key={chien.id} href={`/chiens/${chien.id}`}
              className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#DBEFEA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, overflow: "hidden", flex: "0 0 auto" }}>
                    {chien.photo_principale ? (
                      <img src={chien.photo_principale} alt={chien.nom} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      "🐕"
                    )}
                  </div>
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
                      {chien.sterilisation === "oui" ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                          Stérilisé
                        </span>
                      ) : chien.sterilisation === "chimique" ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                          Castré chim.
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                          Entier
                        </span>
                      )}
                      {chien.journee_essai_effectuee && !chien.journee_essai_invalide && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                          ✅ Essai validé
                        </span>
                      )}
                      {chien.journee_essai_effectuee && chien.journee_essai_invalide && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                          ❌ Essai non validé
                        </span>
                      )}
                      {!chien.journee_essai_effectuee && (
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
