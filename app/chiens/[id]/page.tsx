import Link from "next/link";
import { createClient } from "../../../src/utils/supabase/server";
import BoutonArchiver from "./BoutonArchiver";
import BoutonSupprimer from "./BoutonSupprimer";
import Ententes from "./Ententes";
import BoutonsJourneeEssai from "./BoutonsJourneeEssai";

export default async function ChienPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { id } = await params;

  const { data: chien } = await supabase
    .from("chiens")
    .select(`*, clients (prenom, nom)`)
    .eq("id", id)
    .single();

  const { data: tousChiens } = await supabase
    .from("chiens")
    .select("id, nom, race")
    .eq("actif", true)
    .order("nom");

  if (!chien) return <div>Chien introuvable</div>;

  function calculerAge(dateNaissance: string) {
    if (!dateNaissance) return "-";
    const naissance = new Date(dateNaissance);
    const aujourdHui = new Date();
    let age = aujourdHui.getFullYear() - naissance.getFullYear();
    const mois = aujourdHui.getMonth() - naissance.getMonth();
    if (mois < 0 || (mois === 0 && aujourdHui.getDate() < naissance.getDate())) age--;
    return age;
  }

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto bg-white rounded-xl p-8 shadow-sm">

        {!chien.actif && (
          <div className="bg-yellow-100 text-yellow-800 px-4 py-2 rounded-xl mb-6 font-semibold">
            🗄️ Ce chien est archivé
          </div>
        )}

        {chien.journee_essai_invalide && (
          <div className="bg-red-100 text-red-800 px-4 py-2 rounded-xl mb-6 font-semibold">
            ❌ Journée d'essai invalide — ce chien ne peut pas être réservé
            {chien.journee_essai_note && (
              <p className="text-sm font-normal mt-1">{chien.journee_essai_note}</p>
            )}
          </div>
        )}

        <h1 className={`text-4xl font-bold mb-6 ${chien.sexe === "F" ? "text-pink-600" : "text-blue-600"}`}>
          🐶 {chien.nom}
        </h1>

        <div className="space-y-3 mb-8">
          <p><strong>👤 Propriétaire :</strong> {chien.clients?.prenom} {chien.clients?.nom}</p>
          <p><strong>Race :</strong> {chien.race || "-"}</p>
          <p><strong>Couleur :</strong> {chien.couleur || "-"}</p>
          <p><strong>Âge :</strong> {calculerAge(chien.date_naissance)} an(s)</p>
          <p><strong>Sexe :</strong> {chien.sexe === "M" ? "♂️ Mâle" : "♀️ Femelle"}</p>
          <p><strong>Stérilisation :</strong> {
            chien.sterilisation === "oui" ? "Stérilisé" :
            chien.sterilisation === "chimique" ? "Castré chimiquement" : "Non stérilisé"
          }</p>
          <p><strong>Poids :</strong> {chien.poids ? `${chien.poids} kg` : "-"}</p>
          <p><strong>Catégorie :</strong> {
            chien.categorie_poids === "moins_15kg" ? "🟢 Petit (< 15 kg)" :
            chien.categorie_poids === "15_30kg" ? "🟡 Moyen (15–30 kg)" :
            chien.categorie_poids === "30_40kg" ? "🔴 Grand (> 30 kg)" : "-"
          }</p>
          <p><strong>Niveau énergie :</strong> {chien.niveau_energie || "-"}</p>
          <p><strong>Numéro de puce :</strong> {chien.numero_puce || "-"}</p>
        </div>

        <div className="border-t pt-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">🩺 Santé</h2>
          <p><strong>Allergies :</strong> {chien.allergies || "Aucune"}</p>
          <p><strong>Traitements :</strong> {chien.traitements || "Aucun"}</p>
        </div>

        <div className="border-t pt-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">🩺 Santé</h2>
          <p><strong>Allergies :</strong> {chien.allergies || "Aucune"}</p>
          <p><strong>Traitements :</strong> {chien.traitements || "Aucun"}</p>
          <p><strong>Vétérinaire :</strong> {chien.veterinaire_nom || "-"}</p>
          <p><strong>Téléphone vétérinaire :</strong> {chien.veterinaire_telephone || "-"}</p>
        </div>

        <div className="border-t pt-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">🐾 Comportement</h2>
          <p className="mb-3">{chien.comportement || "-"}</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {chien.protection_ressources && (
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-700">
                ⚠️ Protection de ressources
              </span>
            )}
            {chien.destructeur && (
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-orange-100 text-orange-700">
                🔨 Destructeur
              </span>
            )}
            {chien.craintif && (
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-yellow-100 text-yellow-700">
                😰 Craintif
              </span>
            )}
          </div>
          {chien.comportement_autre && (
            <p><strong>Autres :</strong> {chien.comportement_autre}</p>
          )}
          <p className="mt-3"><strong>Remarques :</strong> {chien.remarques || "-"}</p>
        </div>

        <div className="border-t pt-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">🤝 Compatibilités générales</h2>
          <ul className="space-y-2">
            <li>{chien.compatible_males_castres ? "✅" : "❌"} Mâles castrés</li>
            <li>{chien.compatible_males_entiers ? "✅" : "❌"} Mâles entiers</li>
            <li>{chien.compatible_femelles_sterilisees ? "✅" : "❌"} Femelles stérilisées</li>
            <li>{chien.compatible_femelles_entieres ? "✅" : "❌"} Femelles entières</li>
            <li>{chien.compatible_moins_15kg ? "✅" : "❌"} Moins de 15 kg</li>
            <li>{chien.compatible_15_30kg ? "✅" : "❌"} 15 à 30 kg</li>
            <li>{chien.compatible_30_40kg ? "✅" : "❌"} Plus de 30 kg</li>
          </ul>
        </div>

        {/* Journée d'essai */}
        <div className="border-t pt-6 mb-8">
          <h2 className="text-2xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
            🧪 Journée d'essai
          </h2>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
              chien.journee_essai_effectuee
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-600"
            }`}>
              {chien.journee_essai_effectuee ? "✅ Effectuée" : "⏳ Non effectuée"}
            </span>
            {chien.journee_essai_invalide && (
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-700">
                ❌ Invalide
              </span>
            )}
          </div>
          {chien.journee_essai_note && (
            <p className="text-sm text-gray-600 mb-4">
              <strong>Note :</strong> {chien.journee_essai_note}
            </p>
          )}
          <BoutonsJourneeEssai
            chien_id={chien.id}
            journee_essai_effectuee={chien.journee_essai_effectuee}
            journee_essai_invalide={chien.journee_essai_invalide}
            journee_essai_note={chien.journee_essai_note}
          />
        </div>

        <Ententes chien_id={chien.id} tous_chiens={tousChiens ?? []} />

        <div className="border-t pt-6 flex flex-wrap gap-4">
          <Link href={`/chiens/${chien.id}/modifier`}
            className="px-4 py-2 rounded-xl font-semibold text-white"
            style={{ backgroundColor: "#4AAEA0" }}>
            ✏️ Modifier le chien
          </Link>
          <BoutonArchiver id={chien.id} actif={chien.actif} />
          <BoutonSupprimer id={chien.id} nom={chien.nom} />
          <Link href="/chiens"
            className="px-4 py-2 rounded-xl font-semibold"
            style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
            ← Retour à la liste
          </Link>
        </div>

      </div>
    </main>
  );
}