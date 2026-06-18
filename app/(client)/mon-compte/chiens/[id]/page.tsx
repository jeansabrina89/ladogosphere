import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import Link from "next/link";
import { formatDateFR } from "@/src/lib/dates";
import UploadPhoto from "./UploadPhoto";

export default async function FicheChienClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: chien } = await supabase
    .from("chiens")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!chien) {
    return (
      <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
        <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-gray-600 mb-4">Chien introuvable.</p>
          <Link href="/mon-compte/chiens" className="font-semibold" style={{ color: "#4AAEA0" }}>
            ← Retour à mes chiens
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm">
        <div className="flex flex-col items-center mb-8">
          <div style={{ width: 110, height: 110, borderRadius: "50%", background: "#DBEFEA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 52, overflow: "hidden" }}>
            {chien.photo_principale ? (
              <img src={chien.photo_principale} alt={chien.nom} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              "🐶"
            )}
          </div>
          <div style={{ marginTop: 10 }}>
            <UploadPhoto chienId={chien.id} photoActuelle={chien.photo_principale ?? null} />
          </div>
          <h1 className="text-3xl font-bold mt-3" style={{ color: "#1B2B5E" }}>
            {chien.nom}
          </h1>
        </div>

        <div className="space-y-2 mb-8">
          <p><strong>Race :</strong> {chien.race || "—"}</p>
          <p><strong>Couleur :</strong> {chien.couleur || "—"}</p>
          <p><strong>Poids :</strong> {chien.poids ? `${chien.poids} kg` : "—"}</p>
          <p><strong>Catégorie :</strong> {
            chien.categorie_poids === "moins_15kg" ? "🟢 Petit (moins de 15 kg)" :
            chien.categorie_poids === "15_30kg" ? "🟡 Moyen (15–30 kg)" :
            chien.categorie_poids === "30_40kg" ? "🔴 Grand (30 kg et +)" : "—"
          }</p>
          <p><strong>Sexe :</strong> {chien.sexe === "M" ? "♂️ Mâle" : chien.sexe === "F" ? "♀️ Femelle" : "—"}</p>
          <p><strong>Stérilisation :</strong> {
            chien.sterilisation === "oui" ? "Stérilisé" :
            chien.sterilisation === "chimique" ? "Castré chimiquement" : "Non stérilisé"
          }</p>
          <p><strong>Date de naissance :</strong> {chien.date_naissance ? formatDateFR(chien.date_naissance) : "—"}</p>
          <p><strong>Numéro de puce :</strong> {chien.numero_puce || "—"}</p>
        </div>

        <div className="border-t pt-6 space-y-2 mb-8">
          <h2 className="text-xl font-bold mb-2" style={{ color: "#1B2B5E" }}>Santé</h2>
          <p><strong>Allergies :</strong> {chien.allergies || "—"}</p>
          <p><strong>Traitements en cours :</strong> {chien.traitements || "—"}</p>
          <p><strong>Remarques :</strong> {chien.remarques || "—"}</p>
        </div>

        <div className="border-t pt-6 flex gap-3">
          <Link href={`/mon-compte/chiens/${chien.id}/modifier`}
            className="px-6 py-3 rounded-xl font-semibold text-white" style={{ backgroundColor: "#4AAEA0" }}>
            ✏️ Modifier
          </Link>
          <Link href="/mon-compte/chiens"
            className="px-6 py-3 rounded-xl font-semibold" style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
            ← Mes chiens
          </Link>
        </div>
      </div>
    </main>
  );
}
