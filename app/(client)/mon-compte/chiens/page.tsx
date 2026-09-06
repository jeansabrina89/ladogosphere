import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { createClient } from "@/src/utils/supabase/server";
import Link from "next/link";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import Carte from "@/app/components/ui/Carte";
import EtatVide from "@/app/components/ui/EtatVide";
import { etatClientChien, statutEssaiDe } from "@/src/lib/journeeEssai";
import { datesEssaiParChien } from "@/src/lib/essaiReservation";

export default async function MesChiensPage() {
  const supabase = await createClient();
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  const { data: client } = await supabase
    .from("clients")
    .select("*, chiens (*)")
    .eq("auth_user_id", user.id)
    .single();

  if (!client) return <div style={{ padding: 24 }}>Profil introuvable</div>;

  const chiens = (client.chiens ?? []) as any[];

  // Date de la prochaine journée d'essai validée, par chien (pour les 'programme').
  const datesEssai = await datesEssaiParChien(chiens.map((c) => c.id));

  const muted: React.CSSProperties = { color: "rgba(27,43,94,0.6)", fontSize: 14, margin: 0 };
  const pill = (bg: string, color: string): React.CSSProperties => ({
    display: "inline-block", backgroundColor: bg, color, borderRadius: 999,
    padding: "2px 10px", fontSize: 13, fontWeight: 500, lineHeight: "20px", whiteSpace: "nowrap",
  });
  // Ton de la ligne d'état de la journée d'essai.
  const TON_ETAT: Record<"neutre" | "attention" | "succes" | "refus", React.CSSProperties> = {
    neutre:    { ...pill("#E4E7F1", "#2A3B6B"), whiteSpace: "normal" },
    attention: { ...pill("#F4EAC9", "#6E5410"), whiteSpace: "normal" },
    succes:    { ...pill("#DBEFEA", "#1F6E5B"), whiteSpace: "normal" },
    refus:     { ...pill("#FBE2DE", "#A8453A"), whiteSpace: "normal", display: "block", lineHeight: 1.5 },
  };
  const badgeCategorie = (cat: string | null | undefined) => {
    if (cat === "moins_15kg") return { label: "Petit", style: pill("#DBEFEA", "#1F6E5B") };
    if (cat === "15_30kg") return { label: "Moyen", style: pill("#F4EAC9", "#6E5410") };
    if (cat === "30_40kg") return { label: "Grand", style: pill("#FBE2DE", "#A8453A") };
    return null;
  };

  return (
    <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        <div style={{ marginBottom: 16 }}>
          <Link href="/mon-compte" style={{ color: "#1F6E5B", textDecoration: "none", fontWeight: 600, fontSize: 14 }}>← Mon compte</Link>
        </div>

        <EnTete
          titre="🐶 Mes chiens"
          sousTitre="Les compagnons rattachés à ton compte."
          action={<Bouton variante="principal" href="/mon-compte/chiens/nouveau">Ajouter un chien</Bouton>}
        />

        {chiens.length === 0 ? (
          <Carte>
            <EtatVide
              icone="🐾"
              titre="Aucun chien pour l'instant"
              message="Ajoute ton compagnon pour pouvoir réserver une place."
              action={<Bouton variante="principal" href="/mon-compte/chiens/nouveau">➕ Ajouter mon premier chien</Bouton>}
            />
          </Carte>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {chiens.map((chien) => {
              const badge = badgeCategorie(chien.categorie_poids);
              const etat = etatClientChien(
                statutEssaiDe(chien),
                chien.nom,
                datesEssai.get(chien.id) ?? null
              );
              return (
                <Link key={chien.id} href={`/mon-compte/chiens/${chien.id}`} style={{ textDecoration: "none" }}>
                  <Carte>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ flex: "0 0 auto", width: 52, height: 52, borderRadius: "50%", background: "#DBEFEA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, overflow: "hidden" }}>
                        {chien.photo_principale ? (
                          <img src={chien.photo_principale} alt={chien.nom} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                        ) : (
                          "🐕"
                        )}
                      </div>
                      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: 17, margin: 0, color: "#1B2B5E" }}>
                          {chien.sexe === "F" ? "♀️" : "♂️"} {chien.nom}
                        </p>
                        <p style={{ ...muted, fontSize: 13.5, marginTop: 2 }}>{chien.race || "—"}</p>
                      </div>
                      <div style={{ flex: "0 0 auto", textAlign: "right" }}>
                        <p style={{ ...muted, fontSize: 13.5, margin: "0 0 5px" }}>{chien.poids ? `${chien.poids} kg` : "—"}</p>
                        {badge ? <span style={badge.style}>{badge.label}</span> : null}
                      </div>
                      <div style={{ flex: "0 0 auto", color: "rgba(27,43,94,0.45)", fontSize: 22, marginLeft: 2 }}>›</div>
                    </div>

                    {/* État de la journée d'essai */}
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(27,43,94,0.08)" }}>
                      <span style={TON_ETAT[etat.ton]}>{etat.texte}</span>
                    </div>
                  </Carte>
                </Link>
              );
            })}
          </div>
        )}

      </div>
    </main>
  );
}
