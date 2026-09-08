import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import FormNouveauClient from "./FormNouveauClient";

export default async function NouveauClientPage() {
  await exigerAccesAdmin();
  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto bg-white rounded-xl p-8 shadow-sm">

        <h1 className="text-4xl font-bold mb-6" style={{ color: "#1B2B5E" }}>
          ➕ Ajouter un client
        </h1>

        <FormNouveauClient />
      </div>
    </main>
  );
}
