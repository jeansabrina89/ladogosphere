"use client";

import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../src/lib/supabase-browser";
import { useEffect, useState } from "react";

const liensAdmin = [
  { href: "/", label: "🏠 Tableau de bord" },
  { href: "/chiens", label: "🐶 Chiens" },
  { href: "/clients", label: "👤 Clients" },
  { href: "/reservations", label: "📅 Réservations" },
  { href: "/planning", label: "🏠 Planning" },
  { href: "/checkin", label: "✅ Check-in" },
  { href: "/employes", label: "👥 Équipe" },
  { href: "/comptabilite", label: "📈 Compta" },
];

const liensEmploye = [
  { href: "/", label: "🏠 Tableau de bord" },
  { href: "/chiens", label: "🐶 Chiens" },
  { href: "/clients", label: "👤 Clients" },
  { href: "/reservations", label: "📅 Réservations" },
  { href: "/planning", label: "🏠 Planning" },
  { href: "/checkin", label: "✅ Check-in" },
  { href: "/employes/mon-espace", label: "👤 Mon espace RH" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      setRole(profile?.role ?? "client");
    });
  }, []);

  if (pathname === "/login" || pathname === "/inscription") return null;

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const estAdmin = role === "admin";
  const estEmploye = role === "employe";
  const estPersonnel = estAdmin || estEmploye;

  const liens = estAdmin ? liensAdmin : estEmploye ? liensEmploye : [];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <nav className="sticky top-0 z-50"
      style={{ backgroundColor: "#4AAEA0", borderBottom: "2px solid #3d9690" }}>
      <div className="max-w-7xl mx-auto px-6">

        {/* Ligne 1 — Logo + Déconnexion */}
        <div className="flex items-center justify-between h-16">
          <a href={estPersonnel ? "/" : "/mon-compte"} className="flex items-center gap-3">
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

        {/* Ligne 2 — Navigation */}
        <div className="flex flex-wrap gap-1 pb-3">
          {estPersonnel ? (
            liens.map(({ href, label }) => (
              <a key={href} href={href}
                className="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all"
                style={{
                  color: isActive(href) ? "#E8847A" : "#1B2B5E",
                  backgroundColor: isActive(href) ? "rgba(255,255,255,0.2)" : "transparent",
                  fontWeight: isActive(href) ? 700 : 500,
                }}>
                {label}
              </a>
            ))
          ) : (
            <>
              {[
                { href: "/mon-compte", label: "🏠 Mon compte", exact: true },
                { href: "/mon-compte/chiens", label: "🐶 Mes chiens", exact: false },
                { href: "/mon-compte/reservations", label: "📅 Mes réservations", exact: false },
                { href: "/mon-compte/profil", label: "👤 Mon profil", exact: false },
              ].map(({ href, label, exact }) => {
                const active = exact ? pathname === href : pathname.startsWith(href);
                return (
                  <a key={href} href={href}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap"
                    style={{
                      color: active ? "#E8847A" : "#1B2B5E",
                      backgroundColor: active ? "rgba(255,255,255,0.2)" : "transparent",
                      fontWeight: active ? 700 : 500,
                    }}>
                    {label}
                  </a>
                );
              })}
            </>
          )}
        </div>

      </div>
    </nav>
  );
}