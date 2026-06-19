import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import Link from "next/link";
import { formatDateFR } from "@/src/lib/dates";
import UploadPhoto from "./UploadPhoto";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";

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

  const titreSection: React.CSSProperties = { fontFamily: "Georgia, 'Times New Roman', serif", color: "#1B2B5E", fontSize: 18, fontWeight: 700, margin: "0 0 16px" };
  const ligne = (label: string, valeur: React.ReactNode) => (
    <div style={{ display: "flex", gap: 12, fontSize: 15, lineHeight: 1.6, alignItems: "baseline" }}>
      <span style={{ color: "rgba(27,43,94,0.6)", width: 150, flexShrink: 0 }}>{label}</span>
      <span style={{ color: "#1B2B5E", fontWeight: 500, minWidth: 0 }}>{valeur ?? "—"}</span>
    </div>
  );

  const categorieTxt =
    chien.categorie_poids === "moins_15kg" ? "🟢 Petit (moins de 15 kg)" :
    chien.categorie_poids === "15_30kg" ? "🟡 Moyen (15–30 kg)" :
    chien.categorie_poids === "30_40kg" ? "🔴 Grand (30 kg et +)" : "—";
  const sexeTxt = chien.sexe === "M" ? "♂️ Mâle" : chien.sexe === "F" ? "♀️ Femelle" : "—";
  const sterilisationTxt =
    chien.sterilisation === "oui" ? "Stérilisé" :
    chien.sterilisation === "chimique" ? "Castré chimiquement" : "Non stérilisé";

  return (
    <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        <div style={{ marginBottom: 16 }}>
          <Link href="/mon-compte/chiens" style={{ color: "#1F6E5B", textDecoration: "none", fontWeight: 600, fontSize: 14 }}>← Mes chiens</Link>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* En-tête profil */}
          <Carte>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10 }}>
              <div style={{ width: 110, height: 110, borderRadius: "50%", background: "#DBEFEA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 52, overflow: "hidden" }}>
                {chien.photo_principale ? (
                  <img src={chien.photo_principale} alt={chien.nom} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  "🐶"
                )}
              </div>
              <UploadPhoto chienId={chien.id} photoActuelle={chien.photo_principale ?? null} />
              <h1 style={{ fontFamily: "Georgia, 'Times New Roman', serif", color: "#1B2B5E", fontSize: 26, fontWeight: 700, margin: 0 }}>
                {chien.sexe === "F" ? "♀️" : "♂️"} {chien.nom}
              </h1>
            </div>
          </Carte>

          {/* Informations */}
          <Carte>
            <h2 style={titreSection}>Informations</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ligne("Race", chien.race || "—")}
              {ligne("Couleur", chien.couleur || "—")}
              {ligne("Poids", chien.poids ? `${chien.poids} kg` : "—")}
              {ligne("Catégorie", categorieTxt)}
              {ligne("Sexe", sexeTxt)}
              {ligne("Stérilisation", sterilisationTxt)}
              {ligne("Date de naissance", chien.date_naissance ? formatDateFR(chien.date_naissance) : "—")}
              {ligne("Numéro de puce", chien.numero_puce || "—")}
            </div>
          </Carte>

          {/* Santé */}
          <Carte>
            <h2 style={titreSection}>🩺 Santé</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ligne("Allergies", chien.allergies || "—")}
              {ligne("Traitements en cours", chien.traitements || "—")}
              {ligne("Remarques", chien.remarques || "—")}
            </div>
          </Carte>

        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
          <Bouton variante="principal" href={`/mon-compte/chiens/${chien.id}/modifier`}>✏️ Modifier</Bouton>
          <Bouton variante="secondaire" href="/mon-compte/chiens">← Mes chiens</Bouton>
        </div>

      </div>
    </main>
  );
}
