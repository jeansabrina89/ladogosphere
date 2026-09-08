"use client";

import type { CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/src/lib/supabase-browser";
import { espaceDuChemin, estActif, type EspaceVisible } from "@/src/lib/espaces";

export type LienNav = { href: string; label: string; badge?: number; exact?: boolean };

/**
 * Barre latérale du personnel : HUIT entrées, une par espace, et rien d'autre.
 *
 * Elle en portait vingt-deux. On ne cherche pas dans une liste de vingt-deux :
 * on la relit du début à chaque fois. Huit entrées tiennent sans défilement sur
 * un écran de 667 px de haut — c'est la contrainte qui a fixé le nombre.
 *
 * Ce qui a quitté la barre n'a pas disparu : chaque espace ouvre sur une barre
 * secondaire qui porte ses écrans. Ce qui est personnel (ses heures, ses
 * chiens) descend au bas, à côté de « Déconnexion ».
 *
 * Les cibles font toutes 44 px au minimum — c'est un menu qu'on touche du
 * pouce, pas qu'on pointe à la souris.
 */

const ASIDE_W = 248;
const CIBLE = 44;

export default function SidebarStaff({
  espaces,
  personnel,
}: {
  espaces: EspaceVisible[];
  /** Ce qui la concerne elle : son espace RH, ses chiens à la pension. */
  personnel: LienNav[];
}) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login" || pathname === "/inscription") return null;

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  // L'espace allumé est celui qui possède l'adresse courante, quel que soit le
  // chemin par lequel on y est entré.
  const cleActive = espaceDuChemin(pathname);

  const lienStyle = (actif: boolean): CSSProperties => ({
    display: "flex", alignItems: "center", gap: 10,
    minHeight: CIBLE, padding: "10px 12px", borderRadius: 12,
    fontSize: 14, fontWeight: actif ? 700 : 500,
    color: actif ? "#FFFFFF" : "#1B2B5E",
    background: actif ? "#1B2B5E" : "transparent",
    textDecoration: "none",
  });

  const pastilleStyle: CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: 20, height: 20, padding: "0 6px", borderRadius: 999,
    background: "#E8847A", color: "#FFFFFF", fontSize: 12, fontWeight: 700, lineHeight: 1,
  };

  const titreStyle: CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: ".08em",
    textTransform: "uppercase", color: "#C9A84C", padding: "10px 12px 4px",
  };

  const sidebarDesktop = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 14px 10px", textDecoration: "none" }}>
        <img src="/logo-compact.webp" alt="La Dogosphère" style={{ height: 36, width: 36, borderRadius: "50%", objectFit: "cover" }} />
        <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 17, color: "#1B2B5E" }}>La Dogosphère</span>
      </a>

      <nav aria-label="Espaces" style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {espaces.map((e) => (
            <a
              key={e.cle}
              href={e.href}
              aria-current={e.cle === cleActive ? "page" : undefined}
              style={lienStyle(e.cle === cleActive)}
            >
              <span>{e.label}</span>
            </a>
          ))}
        </div>
      </nav>

      <div style={{ padding: "6px 8px 14px", borderTop: "1px solid rgba(27,43,94,.08)" }}>
        {personnel.length > 0 && (
          <>
            <div style={titreStyle}>Mon espace</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 8 }}>
              {personnel.map(({ href, label, badge, exact }) => {
                const actif = estActif(pathname, href, exact);
                return (
                  <a key={href} href={href} aria-current={actif ? "page" : undefined} style={lienStyle(actif)}>
                    <span>{label}</span>
                    {badge ? <span style={{ ...pastilleStyle, marginLeft: "auto" }}>{badge}</span> : null}
                  </a>
                );
              })}
            </div>
          </>
        )}
        <button
          onClick={handleLogout}
          style={{
            width: "100%", minHeight: CIBLE, padding: "10px", borderRadius: 12,
            background: "#F5F0E8", border: "1px solid rgba(27,43,94,.15)",
            color: "#1B2B5E", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
          }}
        >
          Déconnexion
        </button>
      </div>
    </div>
  );

  const surAccueil = pathname === "/";

  const tuileStyle: CSSProperties = {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
    background: "#FFFFFF", border: "1px solid rgba(27,43,94,.08)", borderRadius: 16,
    minHeight: 88, padding: "18px 10px", textAlign: "center", textDecoration: "none", color: "#1B2B5E",
  };

  /** La tuile mobile : l'icône du libellé, puis son texte. */
  const tuile = ({ href, label, badge }: LienNav) => {
    const espace = label.indexOf(" ");
    const icone = espace > 0 ? label.slice(0, espace) : "";
    const texte = espace > 0 ? label.slice(espace + 1) : label;
    return (
      <a key={href} href={href} style={{ ...tuileStyle, position: "relative" }}>
        {badge ? <span style={{ ...pastilleStyle, position: "absolute", top: 8, right: 8 }}>{badge}</span> : null}
        <span style={{ fontSize: 24, lineHeight: 1 }} aria-hidden="true">{icone}</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{texte}</span>
      </a>
    );
  };

  return (
    <>
      <aside className="hidden md:flex md:flex-col"
        style={{ position: "fixed", top: 0, left: 0, height: "100vh", width: ASIDE_W,
          background: "#FFFFFF", borderRight: "1px solid rgba(27,43,94,.10)", zIndex: 40 }}>
        {sidebarDesktop}
      </aside>

      <header className="md:hidden flex items-center gap-2"
        style={{ position: "sticky", top: 0, zIndex: 40, padding: "12px 16px",
          background: "#FFFFFF", borderBottom: "1px solid rgba(27,43,94,.10)" }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", minHeight: CIBLE }}>
          <img src="/logo-compact.webp" alt="La Dogosphère" style={{ height: 32, width: 32, borderRadius: "50%", objectFit: "cover" }} />
          <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 16, color: "#1B2B5E" }}>La Dogosphère</span>
        </a>
      </header>

      {/* Sur mobile, l'accueil porte les espaces en tuiles : la barre latérale
          n'y est pas, et un menu qu'on ne voit pas n'existe pas. */}
      {surAccueil && (
        <div className="md:hidden" style={{ padding: "16px 16px 8px", background: "#F5F0E8" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {espaces
              .filter((e) => e.href !== "/")
              .map((e) => tuile({ href: e.href, label: e.label }))}
          </div>
          {personnel.length > 0 && (
            <>
              <div style={{ ...titreStyle, padding: "16px 2px 8px" }}>Mon espace</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {personnel.map(tuile)}
              </div>
            </>
          )}
          <div style={{ height: 1, background: "rgba(27,43,94,.12)", margin: "16px 0 0" }} />
        </div>
      )}
    </>
  );
}
