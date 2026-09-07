import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import FormModifierChien, { type ChienFiche } from "./FormModifierChien";

export default async function ModifierChienPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerAccesAdmin();
  const supabase = supabaseAdmin;
  const { id } = await params;

  const { data: chien } = await supabase
    .from("chiens")
    .select("*")
    .eq("id", id)
    .single();

  if (!chien) {
    return (
      <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
        <div className="max-w-3xl mx-auto">
          <Carte>
            <EtatVide
              icone="🐶"
              titre="Chien introuvable"
              message="Ce chien n'existe pas ou a été supprimé."
              action={<Bouton variante="secondaire" href="/chiens">← Retour à la liste</Bouton>}
            />
          </Carte>
        </div>
      </main>
    );
  }

  const categorieTxt =
    chien.categorie_poids === "moins_15kg" ? "🟢 Petit (< 15 kg)" :
    chien.categorie_poids === "15_30kg" ? "🟡 Moyen (15–30 kg)" :
    chien.categorie_poids === "30_40kg" ? "🔴 Grand (> 30 kg)" : "—";

  return (
    <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">

        <EnTete titre={`✏️ Modifier ${chien.nom}`} sousTitre={chien.race || undefined} />

        <FormModifierChien
          chien={chien as unknown as ChienFiche}
          categorieTxt={categorieTxt}
        />

      </div>
    </main>
  );
}
