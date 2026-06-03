import Link from "next/link";
import { supabase } from "../../../src/lib/supabase";
import BoutonArchiverClient from "./BoutonArchiverClient";
import BoutonSupprimerClient from "./BoutonSupprimerClient";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: client } = await supabase
    .from("clients")
    .select(`*, chiens (id, nom, race, poids, categorie_poids, sexe, sterilise)`)
    .eq("id", id)
    .single();

  if (!client) return <div>Client introuvable</div>;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto bg-white rounded-xl p-8 shadow-sm">

        {client.actif === false && (
          <div className="bg-yellow-100 text-yellow-800 px-4 py-2 rounded-xl mb-6 font-semibold">
            🗄️ Ce client est archivé
          </div>
        )}

        <div className="flex justify-between items-start mb-6">
          <h1 className="text-4xl font-bold" style={{ color: "#1B2B5E" }}>
            👤 {client.prenom} {client.nom}
          </h1>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
            client.membre ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
          }`}>
            {client.membre ? "⭐ Membre" : "Standard"}
          </span>
        </div>

        {/* Infos principales */}
        <div className="space-y-2 mb-8">
          <p><strong>Email :</strong> {client.email}</p>
          <p><strong>Téléphone :</strong> {client.telephone || "—"}</p>
          <p><strong>Adresse :</strong> {client.adresse || "—"}</p>
          <p><strong>Client depuis :</strong> {new Date(client.created_at).toLocaleDateString("fr-CH")}</p>
        </div>

        {/* Contact d'urgence */}
        <div className="border-t pt-6 mb-8">
          <h2 className="text-2xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
            🚨 Contact d'urgence
          </h2>
          {!client.contact_urgence_nom && !client.contact_urgence_prenom && !client.contact_urgence_telephone ? (
            <p className="text-gray-400">Aucun contact d'urgence renseigné</p>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
              <p>
                <strong>Nom :</strong>{" "}
                {client.contact_urgence_prenom || ""} {client.contact_urgence_nom || "—"}
              </p>
              <p>
                <strong>Téléphone :</strong>{" "}
                {client.contact_urgence_telephone
                  ? <a href={`tel:${client.contact_urgence_telephone}`}
                      className="font-semibold"
                      style={{ color: "#4AAEA0" }}>
                      {client.contact_urgence_telephone}
                    </a>
                  : "—"}
              </p>
            </div>
          )}
        </div>

        {/* Chiens */}
        <div className="border-t pt-6 mb-8">
          <h2 className="text-2xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
            🐶 Chiens ({client.chiens?.length ?? 0})
          </h2>
          <div className="grid gap-3">
            {client.chiens?.length === 0 && (
              <p className="text-gray-400">Aucun chien enregistré</p>
            )}
            {client.chiens?.map((chien: any) => (
              <Link key={chien.id} href={`/chiens/${chien.id}`}
                className="flex justify-between items-center border rounded-xl p-4 hover:bg-slate-50">
                <div>
                  <p className="font-bold" style={{ color: "#1B2B5E" }}>{chien.nom}</p>
                  <p className="text-sm text-gray-500">{chien.race || "—"}</p>
                </div>
                <div className="text-right text-sm">
                  <p>{chien.poids ? `${chien.poids} kg` : "—"}</p>
                  <p>{
                    chien.categorie_poids === "moins_15kg" ? "🟢 Petit" :
                    chien.categorie_poids === "15_30kg" ? "🟡 Moyen" :
                    chien.categorie_poids === "30_40kg" ? "🔴 Grand" : "—"
                  }</p>
                  <p>{chien.sexe === "M" ? "♂️" : "♀️"} {chien.sterilise ? "stérilisé(e)" : "entier(e)"}</p>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-4">
            <Link href="/chiens/nouveau"
              className="text-sm font-semibold"
              style={{ color: "#4AAEA0" }}>
              ➕ Ajouter un chien à ce client
            </Link>
          </div>
        </div>

        {/* Boutons */}
        <div className="border-t pt-6 flex flex-wrap gap-4">
          <Link href={`/clients/${client.id}/modifier`}
            className="px-4 py-2 rounded-xl font-semibold text-white"
            style={{ backgroundColor: "#4AAEA0" }}>
            ✏️ Modifier le client
          </Link>
          <BoutonArchiverClient id={client.id} actif={client.actif} />
          <BoutonSupprimerClient id={client.id} nom={`${client.prenom} ${client.nom}`} />
          <Link href="/clients"
            className="px-4 py-2 rounded-xl font-semibold"
            style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
            ← Retour à la liste
          </Link>
        </div>

      </div>
    </main>
  );
}