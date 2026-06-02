import { createSupabaseServerClient } from "../../../../src/lib/supabase-server";
import { supabase } from "../../../../src/lib/supabase";
import Link from "next/link";

export default async function MesChiensPage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  const { data: client } = await supabase
    .from("clients")
    .select("*, chiens (*)")
    .eq("auth_user_id", user.id)
    .single();

  if (!client) return <div>Profil introuvable</div>;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto">

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold" style={{ color: "#1B2B5E" }}>
            🐶 Mes chiens
          </h1>
          <Link href="/mon-compte/chiens/nouveau"
            className="px-4 py-2 rounded-lg font-semibold text-white text-sm"
            style={{ backgroundColor: "#4AAEA0" }}>
            ➕ Ajouter
          </Link>
        </div>

        <div className="space-y-3">
          {client.chiens?.length === 0 && (
            <p className="text-gray-400">Aucun chien enregistré.</p>
          )}
          {client.chiens?.map((chien: any) => (
            <Link key={chien.id} href={`/mon-compte/chiens/${chien.id}`}
              className="block bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-bold text-lg" style={{ color: "#1B2B5E" }}>{chien.nom}</p>
                  <p className="text-gray-500 text-sm">{chien.race || "—"}</p>
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

        <div className="mt-6">
          <Link href="/mon-compte"
            className="text-sm font-semibold"
            style={{ color: "#4AAEA0" }}>
            ← Retour à mon compte
          </Link>
        </div>

      </div>
    </main>
  );
}