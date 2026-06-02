import Image from "next/image";
import Link from "next/link";
import { supabase } from "../../src/lib/supabase";
import RechercheChiens from "../components/RechercheChiens";

export default async function ChiensPage() {
  const { data: chiens } = await supabase
    .from("chiens")
    .select("*")
    .order("nom");

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-7xl mx-auto">

        <div className="flex items-center gap-4 mb-8">
          <Image
            src="/logo.png"
            alt="La Dogosphère"
            width={100}
            height={100}
          />

          <div>
            <h1 className="text-4xl font-bold">
              La Dogosphère
            </h1>

            <p className="text-gray-600">
              Gestion de pension canine
            </p>
          </div>
        </div>

        <h2 className="text-3xl font-bold mb-2">
          🐶 Chiens
        </h2>

        <p className="text-gray-600">
          Liste des chiens enregistrés
        </p>

        <p className="mb-8 font-semibold">
          Total : {chiens?.length ?? 0} chien(s)
        </p>

        <div className="mb-6">
          <Link
            href="/chiens/nouveau"
            className="inline-block bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700"
          >
            ➕ Ajouter un chien
          </Link>
        </div>

        <RechercheChiens chiens={chiens ?? []} />

      </div>
    </main>
  );
}