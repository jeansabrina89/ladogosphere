"use client";

import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../src/lib/supabase-browser";
import { useEffect, useState } from "react";

const liensAdmin = [
  { href: "/chiens", label: "🐶 Chiens" },
  { href: "/clients", label: "👤 Clients" },
  { href: "/reservations", label: "📅 Réservations" },
  { href: "/planning", label: "🏠 Planning" },
  { href: "/checkin", label: "✅ Check-in" },
  { href: "/employes", label: "👥 Équipe" },
  { href: "/comptabilite", label: "📈 Compta" },
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

  const estAdmin = role === "admin" || role === "employe";
  const estSuperAdmin = role === "admin";

  return (
    <nav className="sticky top-0 z-50"
      style={{ backgroundColor: "#4AAEA0", borderBottom: "2px solid #3d9690" }}>
      <div className="max-w-7xl mx-auto px-6">

        {/* Ligne 1 — Logo + Déconnexion */}
        <div className="flex items-center justify-between h-16">
          <a href={estAdmin ? "/" : "/mon-compte"} className="flex items-center gap-4">
            <img src="/Logo.png" alt="La Dogosphère"
              className="h-14 w-14 rounded-full object-cover" />
            <span className="font-bold text-2xl" style={{ color: "#1B2B5E" }}>
              La Dogosphère
            </span>
          </a>

          <button onClick={handleLogout}
            className="text-base px-5 py-2 rounded-lg font-semibold"
            style={{ backgroundColor: "#1B2B5E", color: "#F5F0E8" }}>
            Déconnexion
          </button>
        </div>

        {/* Ligne 2 — Navigation selon le rôle */}
        <div className="flex items-center gap-2 pb-3">
          {estAdmin ? (
            liensAdmin
              .filter(({ href }) =>
                (href !== "/comptabilite" && href !== "/employes") || estSuperAdmin
              )
              .map(({ href, label }) => (
                <a key={href} href={href}
                  className="px-4 py-2 rounded-lg text-base font-medium whitespace-nowrap transition-all"
                  style={{
                    color: pathname.startsWith(href) ? "#E8847A" : "#1B2B5E",
                    backgroundColor: pathname.startsWith(href) ? "rgba(255,255,255,0.2)" : "transparent",
                    fontWeight: pathname.startsWith(href) ? 700 : 500,
                  }}>
                  {label}
                </a>
              ))
          ) : (
            <>
              <a href="/mon-compte"
                className="px-4 py-2 rounded-lg text-base font-medium whitespace-nowrap"
                style={{
                  color: pathname === "/mon-compte" ? "#E8847A" : "#1B2B5E",
                  backgroundColor: pathname === "/mon-compte" ? "rgba(255,255,255,0.2)" : "transparent",
                  fontWeight: pathname === "/mon-compte" ? 700 : 500,
                }}>
                🏠 Mon compte
              </a>
              <a href="/mon-compte/chiens"
                className="px-4 py-2 rounded-lg text-base font-medium whitespace-nowrap"
                style={{
                  color: pathname.startsWith("/mon-compte/chiens") ? "#E8847A" : "#1B2B5E",
                  backgroundColor: pathname.startsWith("/mon-compte/chiens") ? "rgba(255,255,255,0.2)" : "transparent",
                  fontWeight: pathname.startsWith("/mon-compte/chiens") ? 700 : 500,
                }}>
                🐶 Mes chiens
              </a>
              <a href="/mon-compte/reservations"
                className="px-4 py-2 rounded-lg text-base font-medium whitespace-nowrap"
                style={{
                  color: pathname.startsWith("/mon-compte/reservations") ? "#E8847A" : "#1B2B5E",
                  backgroundColor: pathname.startsWith("/mon-compte/reservations") ? "rgba(255,255,255,0.2)" : "transparent",
                  fontWeight: pathname.startsWith("/mon-compte/reservations") ? 700 : 500,
                }}>
                📅 Mes réservations
              </a>
              <a href="/mon-compte/profil"
                className="px-4 py-2 rounded-lg text-base font-medium whitespace-nowrap"
                style={{
                  color: pathname.startsWith("/mon-compte/profil") ? "#E8847A" : "#1B2B5E",
                  backgroundColor: pathname.startsWith("/mon-compte/profil") ? "rgba(255,255,255,0.2)" : "transparent",
                  fontWeight: pathname.startsWith("/mon-compte/profil") ? 700 : 500,
                }}>
                👤 Mon profil
              </a>
            </>
          )}
        </div>

      </div>
    </nav>
  );
}