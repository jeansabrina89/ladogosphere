"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/src/lib/supabase-browser";

export type LienNav = { href: string; label: string };
export type SectionNav = { titre: string | null; liens: LienNav[] };

const ASIDE_W = 248;

export default function SidebarStaff({ sections }: { sections: SectionNav[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);

  if (pathname === "/login" || pathname === "/inscription") return null;

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const lienStyle = (actif: boolean): CSSProperties => ({
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 12px", borderRadius: 12,
    fontSize: 14, fontWeight: actif ? 700 : 500,
    color: actif ? "#FFFFFF" : "#1B2B5E",
    background: actif ? "#1B2B5E" : "transparent",
    textDecoration: "none",
  });

  const titreStyle: CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: ".08em",
    textTransform: "uppercase", color: "#C9A84C", padding: "14px 12px 4px",
  };

  const contenu = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <a href="/" onClick={() => setOuvert(false)}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 14px 12px", textDecoration: "none" }}>
        <img src="/Logo.png" alt="La Dogosphère"
          style={{ height: 40, width: 40, borderRadius: "50%", objectFit: "cover" }} />
        <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 18, color: "#1B2B5E" }}>
          La Dogosphère
        </span>
      </a>

      <nav style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
        {sections.map((sec, i) => (
          <div key={i}>
            {sec.titre && <div style={titreStyle}>{sec.titre}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: sec.titre ? "0 0 2px" : "6px 0 2px" }}>
              {sec.liens.map(({ href, label }) => (
                <a key={href} href={href} onClick={() => setOuvert(false)} style={lienStyle(isActive(href))}>
                  {label}
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

  return (
    <>
      <aside className="hidden md:flex md:flex-col"
        style={{ position: "fixed", top: 0, left: 0, height: "100vh", width: ASIDE_W,
          background: "#FFFFFF", borderRight: "1px solid rgba(27,43,94,.10)", zIndex: 40 }}>
        {contenu}
      </aside>

      <header className="md:hidden flex items-center justify-between"
        style={{ position: "sticky", top: 0, zIndex: 40, padding: "12px 16px",
          background: "#FFFFFF", borderBottom: "1px solid rgba(27,43,94,.10)" }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <img src="/Logo.png" alt="La Dogosphère" style={{ height: 32, width: 32, borderRadius: "50%", objectFit: "cover" }} />
          <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 16, color: "#1B2B5E" }}>La Dogosphère</span>
        </a>
        <button onClick={() => setOuvert(true)} aria-label="Ouvrir le menu"
          style={{ fontSize: 24, lineHeight: 1, color: "#1B2B5E", background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          ☰
        </button>
      </header>

      {ouvert && (
        <div className="md:hidden" style={{ position: "fixed", inset: 0, zIndex: 50 }}>
          <div onClick={() => setOuvert(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(27,43,94,.45)" }} />
          <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: 280, maxWidth: "82%",
            background: "#FFFFFF", boxShadow: "2px 0 24px rgba(27,43,94,.2)", display: "flex", flexDirection: "column" }}>
            <button onClick={() => setOuvert(false)} aria-label="Fermer le menu"
              style={{ position: "absolute", top: 12, right: 12, fontSize: 22, lineHeight: 1, color: "#1B2B5E",
                background: "none", border: "none", cursor: "pointer", zIndex: 1 }}>
              ✕
            </button>
            {contenu}
          </div>
        </div>
      )}
    </>
  );
}
