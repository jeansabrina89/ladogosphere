import Link from "next/link";
import { exigerPersonnelPage } from "@/src/lib/exigerPersonnelPage";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import Carte from "@/app/components/ui/Carte";
import EtatVide from "@/app/components/ui/EtatVide";
import BadgePhotos from "@/app/components/BadgePhotos";

export default async function ChiensPage() {
  await exigerPersonnelPage();
  const perms = await getProfilePerms();
  const supabase = supabaseAdmin;

  const { data: chiens } = await supabase
    .from("chiens")
    .select(`*, clients (prenom, nom, photos_ok)`)
    .order("nom");

  const muted: React.CSSProperties = { color: "rgba(27,43,94,0.6)", fontSize: 14, margin: 0 };
  const pill = (bg: string, color: string): React.CSSProperties => ({
    display: "inline-block", backgroundColor: bg, color, borderRadius: 999,
    padding: "2px 10px", fontSize: 13, fontWeight: 500, lineHeight: "20px", whiteSpace: "nowrap",
  });

  return (
    <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">

        <EnTete
          titre="🐶 Chiens"
          sousTitre="Liste des chiens enregistrés"
          action={
            perms.perm_chiens_creer ? (
              <Bouton variante="principal" href="/chiens/nouveau">Nouveau chien</Bouton>
            ) : undefined
          }
        />

        <p style={{ ...muted, fontWeight: 600, margin: "0 0 16px" }}>
          Total : {chiens?.length ?? 0} chien(s)
        </p>

        {chiens?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {chiens.map((chien: any) => {
              const categorie =
                chien.categorie_poids === "moins_15kg" ? "🟢 Petit" :
                chien.categorie_poids === "15_30kg" ? "🟡 Moyen" :
                chien.categorie_poids === "30_40kg" ? "🔴 Grand" : "—";

              return (
                <Link key={chien.id} href={`/chiens/${chien.id}`} style={{ textDecoration: "none" }}>
                  <Carte>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>

                      <div style={{ display: "flex", gap: 16, minWidth: 0 }}>
                        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#DBEFEA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, overflow: "hidden", flexShrink: 0 }}>
                          {chien.photo_principale ? (
                            <img src={chien.photo_principale} alt={chien.nom} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            "🐕"
                          )}
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 18, fontWeight: 700, color: "#1B2B5E", margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            {chien.sexe === "F" ? "♀️" : "♂️"} {chien.nom}
                            {!chien.actif && <span style={pill("#EDE8DF", "rgba(27,43,94,0.6)")}>Archivé</span>}
                          </p>
                          <p style={muted}>{chien.race || "—"}</p>
                          <p style={muted}>👤 {chien.clients?.prenom} {chien.clients?.nom}</p>
                          <p style={{ marginTop: 4 }}>
                            <BadgePhotos photos_ok={chien.clients?.photos_ok} taille="petite" />
                          </p>

                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                            {chien.sterilisation === "oui" ? (
                              <span style={pill("#DBEFEA", "#1F6E5B")}>Stérilisé</span>
                            ) : chien.sterilisation === "chimique" ? (
                              <span style={pill("#F4EAC9", "#6E5410")}>Castré chim.</span>
                            ) : (
                              <span style={pill("#FBE2DE", "#A8453A")}>Entier</span>
                            )}

                            {!chien.journee_essai_effectuee ? (
                              <span style={pill("#E4E7F1", "#2A3B6B")}>⏳ Essai à faire</span>
                            ) : chien.journee_essai_invalide ? (
                              <span style={pill("#FBE2DE", "#A8453A")}>❌ Essai non validé</span>
                            ) : (
                              <span style={pill("#DBEFEA", "#1F6E5B")}>✅ Essai validé</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <p style={{ ...muted, fontWeight: 600, color: "#1B2B5E" }}>{chien.poids ? `${chien.poids} kg` : "—"}</p>
                        <p style={{ ...muted, marginTop: 4 }}>{categorie}</p>
                      </div>

                    </div>
                  </Carte>
                </Link>
              );
            })}
          </div>
        ) : (
          <Carte>
            <EtatVide icone="🐶" titre="Aucun chien" message="Ajoute ton premier chien pour commencer." />
          </Carte>
        )}

      </div>
    </main>
  );
}
