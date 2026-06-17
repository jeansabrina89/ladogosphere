"use client";

import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/src/lib/supabase-browser";

const liens = [
  { href: "/", label: "📋 Tableau de bord" },
  { href: "/chiens-du-jour", label: "🐾 Chiens du jour" },
  { href: "/checkin", label: "✅ Check-in" },
  { href: "/chiens", label: "🐶 Chiens" },
  { href: "/clients", label: "👤 Clients" },
  { href: "/reservations", label: "📅 Réservations" },
  { href: "/planning", label: "🗂️ Planning" },
  { href: "/boxes", label: "🏠 Box" },
  { href: "/employes/mon-espace", label: "👤 Mon espace RH" },
];

export default function NavBarEmploye() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login" || pathname === "/inscription") return null;

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <nav className="sticky top-0 z-50"
      style={{ backgroundColor: "#4AAEA0", borderBottom: "2px solid #3d9690" }}>
      <div className="max-w-7xl mx-auto px-6">

        <div className="flex items-center justify-between h-16">
          <a href="/" className="flex items-center gap-3">
            <img src="/Logo.png" alt="La Dogosphère"
              className="h-12 w-12 rounded-full object-cover" />
            <span className="font-bold text-xl" style={{ color: "#1B2B5E" }}>
              La Dogosphère
            </span>
          </a>
          <button onClick={handleLogout}
            className="text-sm px-4 py-2 rounded-lg font-semibold flex-shrink-0"
            style={{ backgroundColor: "#1B2B5E", color: "#F5F0E8" }}>
            Déconnexion
          </button>
        </div>

        <div className="flex flex-wrap gap-1 pb-3">
          {liens.map(({ href, label }) => (
            <a key={href} href={href}
              className="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all"
              style={{
                color: isActive(href) ? "#E8847A" : "#1B2B5E",
                backgroundColor: isActive(href) ? "rgba(255,255,255,0.2)" : "transparent",
                fontWeight: isActive(href) ? 700 : 500,
              }}>
              {label}
            </a>
          ))}
        </div>

      </div>
    </nav>
  );
}
