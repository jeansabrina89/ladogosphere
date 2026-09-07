import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import Link from "next/link";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import { choixCohabitationDe, cohabitationVerrouillee } from "@/src/lib/cohabitation";
import { lireCohabitationChiens } from "@/src/lib/cohabitationDb";
import FormModifierChien, { type ChienAModifier } from "./FormModifierChien";

export default async function ModifierChienClientPage({
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
      <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <Carte>
            <EtatVide
              icone="🐶"
              titre="Chien introuvable"
              message="Ce chien n'existe pas ou n'est pas rattaché à ton compte."
              action={<Bouton variante="secondaire" href="/mon-compte/chiens">← Mes chiens</Bouton>}
            />
          </Carte>
        </div>
      </main>
    );
  }

  // Mode de cohabitation actuel : colonnes du chien + entente famille_uniquement.
  const [cohabitation] = await lireCohabitationChiens([chien.id]);
  const choixActuel = choixCohabitationDe(cohabitation);
  const verrouille = cohabitationVerrouillee(cohabitation);

  return (
    <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        <div style={{ marginBottom: 16 }}>
          <Link href={`/mon-compte/chiens/${chien.id}`} style={{ color: "#1F6E5B", textDecoration: "none", fontWeight: 600, fontSize: 14 }}>← Retour à la fiche</Link>
        </div>

        <EnTete titre={`✏️ Modifier ${chien.nom}`} sousTitre={chien.race || undefined} />

        <FormModifierChien
          chien={chien as unknown as ChienAModifier}
          choixActuel={choixActuel}
          verrouille={verrouille}
        />

      </div>
    </main>
  );
}
