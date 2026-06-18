import type { CSSProperties } from "react";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { createClient } from "@/src/utils/supabase/server";
import Link from "next/link";

const SERIF = "Georgia,'Times New Roman',serif";

const sWrap: CSSProperties = { maxWidth: 600, margin: "0 auto", padding: "8px 0 40px" };
const sTopnav: CSSProperties = { marginBottom: 16 };
const sTopnavA: CSSProperties = { color: "#1F6E5B", textDecoration: "none", fontWeight: 600, fontSize: 14 };
const sEntete: CSSProperties = { marginBottom: 4 };
const sH1: CSSProperties = { fontFamily: SERIF, fontSize: 26, fontWeight: 700, margin: "0 0 4px", color: "#1B2B5E" };
const sEnteteP: CSSProperties = { margin: 0, color: "rgba(27,43,94,.6)", fontSize: 14 };
const sBtnPrincipal: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", background: "#2E8B7E", color: "#fff", border: "none", borderRadius: 14, padding: "15px 18px", fontSize: 16, fontWeight: 700, margin: "14px 0 20px", textDecoration: "none" };
const sCarte: CSSProperties = { display: "flex", alignItems: "center", gap: 14, background: "#fff", border: "1px solid rgba(27,43,94,.12)", borderRadius: 18, padding: 16, marginBottom: 12, textDecoration: "none", color: "inherit" };
const sAvatar: CSSProperties = { flex: "0 0 auto", width: 52, height: 52, borderRadius: "50%", background: "#DBEFEA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, overflow: "hidden" };
const sInfos: CSSProperties = { flex: "1 1 auto", minWidth: 0 };
const sNom: CSSProperties = { fontWeight: 700, fontSize: 17, margin: 0, color: "#1B2B5E" };
const sRace: CSSProperties = { margin: "2px 0 0", fontSize: 13.5, color: "rgba(27,43,94,.6)" };
const sDroite: CSSProperties = { flex: "0 0 auto", textAlign: "right" };
const sPoids: CSSProperties = { fontSize: 13.5, color: "rgba(27,43,94,.6)", margin: "0 0 5px" };
const sBadgeBase: CSSProperties = { display: "inline-block", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999 };
const sChevron: CSSProperties = { flex: "0 0 auto", color: "rgba(27,43,94,.45)", fontSize: 22, marginLeft: 2 };
const sVide: CSSProperties = { background: "#fff", border: "1px dashed rgba(27,43,94,.12)", borderRadius: 20, padding: "34px 24px", textAlign: "center" };
const sVideIc: CSSProperties = { fontSize: 46 };
const sVideH2: CSSProperties = { fontFamily: SERIF, fontSize: 20, margin: "10px 0 6px", color: "#1B2B5E" };
const sVideP: CSSProperties = { margin: "0 0 18px", fontSize: 14, color: "rgba(27,43,94,.6)" };
const sBtnVide: CSSProperties = { ...sBtnPrincipal, margin: "0 auto", maxWidth: 280 };

function badgeCategorie(cat: string | null | undefined): { label: string; style: CSSProperties } | null {
  if (cat === "moins_15kg") return { label: "Petit", style: { background: "#DBEFEA", color: "#1F6E5B" } };
  if (cat === "15_30kg") return { label: "Moyen", style: { background: "#F4EAC9", color: "#6E5410" } };
  if (cat === "30_40kg") return { label: "Grand", style: { background: "#FBE2DE", color: "#A8453A" } };
  return null;
}

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

  return (
    <div style={sWrap}>
      <div style={sTopnav}>
        <Link href="/mon-compte" style={sTopnavA}>← Mon compte</Link>
      </div>

      <div style={sEntete}>
        <h1 style={sH1}>🐶 Mes chiens</h1>
        <p style={sEnteteP}>Les compagnons rattachés à ton compte.</p>
      </div>

      <Link href="/mon-compte/chiens/nouveau" style={sBtnPrincipal}>➕ Ajouter un chien</Link>

      {chiens.length === 0 ? (
        <div style={sVide}>
          <div style={sVideIc}>🐾</div>
          <h2 style={sVideH2}>Aucun chien pour l&apos;instant</h2>
          <p style={sVideP}>Ajoute ton compagnon pour pouvoir réserver une place.</p>
          <Link href="/mon-compte/chiens/nouveau" style={sBtnVide}>➕ Ajouter mon premier chien</Link>
        </div>
      ) : (
        chiens.map((chien) => {
          const badge = badgeCategorie(chien.categorie_poids);
          return (
            <Link key={chien.id} href={`/mon-compte/chiens/${chien.id}`} style={sCarte}>
              <div style={sAvatar}>
                {chien.photo_principale ? (
                  <img src={chien.photo_principale} alt={chien.nom} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                ) : (
                  "🐕"
                )}
              </div>
              <div style={sInfos}>
                <p style={sNom}>{chien.sexe === "F" ? "♀️" : "♂️"} {chien.nom}</p>
                <p style={sRace}>{chien.race || "—"}</p>
              </div>
              <div style={sDroite}>
                <p style={sPoids}>{chien.poids ? `${chien.poids} kg` : "—"}</p>
                {badge ? <span style={{ ...sBadgeBase, ...badge.style }}>{badge.label}</span> : null}
              </div>
              <div style={sChevron}>›</div>
            </Link>
          );
        })
      )}
    </div>
  );
}
