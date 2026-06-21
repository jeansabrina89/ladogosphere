"use client";

import type { CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/src/lib/supabase-browser";

export type LienNav = { href: string; label: string; badge?: number };
export type SectionNav = { titre: string | null; liens: LienNav[] };

const ASIDE_W = 248;

export default function SidebarStaff({ sections }: { sections: SectionNav[] }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login" || pathname === "/inscription") return null;

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const tousHrefs = sections.flatMap((s) => s.liens.map((l) => l.href));
  const hrefActif =
    tousHrefs
      .filter((href) =>
        href === "/"
          ? pathname === "/"
          : pathname === href || pathname.startsWith(href + "/")
      )
      .sort((a, b) => b.length - a.length)[0] ?? null;

  const isActive = (href: string) => href === hrefActif;

  const lienStyle = (actif: boolean): CSSProperties => ({
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 12px", borderRadius: 12,
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
    textTransform: "uppercase", color: "#C9A84C", padding: "14px 12px 4px",
  };

  const sidebarDesktop = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 14px 12px", textDecoration: "none" }}>
        <img src="/Logo.png" alt="La Dogosphère" style={{ height: 40, width: 40, borderRadius: "50%", objectFit: "cover" }} />
        <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 18, color: "#1B2B5E" }}>La Dogosphère</span>
      </a>
      <nav style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
        {sections.map((sec, i) => (
          <div key={i}>
            {sec.titre && <div style={titreStyle}>{sec.titre}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: sec.titre ? "0 0 2px" : "6px 0 2px" }}>
              {sec.liens.map(({ href, label, badge }) => (
                <a key={href} href={href} style={lienStyle(isActive(href))}>
                  <span>{label}</span>
                  {badge ? <span style={{ ...pastilleStyle, marginLeft: "auto" }}>{badge}</span> : null}
                </a>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div style={{ padding: 14, borderTop: "1px solid rgba(27,43,94,.08)" }}>
        <button onClick={handleLogout}
          style={{ width: "100%", padding: "10px", borderRadius: 12, background: "#F5F0E8",
            border: "1px solid rgba(27,43,94,.15)", color: "#1B2B5E", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
          Déconnexion
        </button>
      </div>
    </div>
  );

  const surAccueil = pathname === "/";

  const tuileStyle: CSSProperties = {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
    background: "#FFFFFF", border: "1px solid rgba(27,43,94,.08)", borderRadius: 16,
    padding: "18px 10px", textAlign: "center", textDecoration: "none", color: "#1B2B5E",
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
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <img src="/Logo.png" alt="La Dogosphère" style={{ height: 32, width: 32, borderRadius: "50%", objectFit: "cover" }} />
          <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 16, color: "#1B2B5E" }}>La Dogosphère</span>
        </a>
      </header>

      {surAccueil && (
        <div className="md:hidden" style={{ padding: "16px 16px 8px", background: "#F5F0E8" }}>
          {sections.map((sec, i) => {
            const liens = sec.liens.filter((l) => l.href !== "/");
            if (liens.length === 0) return null;
            return (
              <div key={i} style={{ marginBottom: 16 }}>
                {sec.titre && <div style={{ ...titreStyle, padding: "0 2px 8px" }}>{sec.titre}</div>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {liens.map(({ href, label, badge }) => {
                    const espace = label.indexOf(" ");
                    const icone = espace > 0 ? label.slice(0, espace) : "";
                    const texte = espace > 0 ? label.slice(espace + 1) : label;
                    return (
                      <a key={href} href={href} style={{ ...tuileStyle, position: "relative" }}>
                        {badge ? <span style={{ ...pastilleStyle, position: "absolute", top: 8, right: 8 }}>{badge}</span> : null}
                        <span style={{ fontSize: 24, lineHeight: 1 }}>{icone}</span>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{texte}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div style={{ height: 1, background: "rgba(27,43,94,.12)", margin: "4px 0 0" }} />
        </div>
      )}
    </>
  );
}
