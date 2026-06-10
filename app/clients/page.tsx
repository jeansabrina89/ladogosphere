import Link from "next/link";
import { createClient } from "../../src/utils/supabase/server";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select(`
      *,
      chiens (id)
    `)
    .order("nom");

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-7xl mx-auto">

        <h1 className="text-4xl font-bold mb-2">👤 Clients</h1>
        <p className="text-gray-600 mb-2">Liste des clients enregistrés</p>
        <p className="font-semibold mb-6">Total : {clients?.length ?? 0} client(s)</p>

        <div className="mb-6">
          <Link href="/clients/nouveau"
            className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700">
            ➕ Ajouter un client
          </Link>
        </div>

        <div className="grid gap-4">
          {clients?.map(client => (
            <Link key={client.id} href={`/clients/${client.id}`}
              className="bg-white rounded-xl p-6 shadow hover:shadow-md transition flex justify-between items-center">
              <div>
                <p className="text-xl font-bold">
                  {client.prenom} {client.nom}
                </p>
                <p className="text-gray-500 text-sm">{client.email}</p>
                <p className="text-gray-500 text-sm">{client.telephone || "—"}</p>
              </div>
              <div className="text-right">
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  client.membre
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-600"
                }`}>
                  {client.membre ? "⭐ Membre" : "Standard"}
                </span>
                <p className="text-gray-400 text-sm mt-1">
                  {client.chiens?.length ?? 0} chien(s)
                </p>
              </div>
            </Link>
          ))}
        </div>

      </div>
    </main>
  );
}