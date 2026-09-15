"use client";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/src/lib/supabase-browser";
// Les entrées viennent du module partagé : le tableau de bord lit la même
// liste, et les deux surfaces ne peuvent plus se contredire.
import { entreesVisibles, libelleComplet } from "@/src/lib/entreesEspaceClient";
export default function NavBarClient({
  interne = false,
  locataire = false,
}: {
  interne?: boolean;
  locataire?: boolean;
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
  const isActive = (href: string, exact = false) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };
  return (
    <nav className="sticky top-0 z-50"
      style={{ backgroundColor: "#4AAEA0", borderBottom: "2px solid #3d9690" }}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <a href="/mon-compte" className="flex items-center gap-3">
            <img src="/logo-compact.webp" alt="La Dogosphère"
              className="h-12 w-12 rounded-full object-cover" />
            <span className="font-bold text-xl" style={{ color: "#1B2B5E" }}>
              La Dogosphère
            </span>
          </a>
          {/* 44 px : c'est la taille d'un pouce, pas celle d'un curseur. */}
          <button onClick={handleLogout}
            className="text-sm px-4 rounded-lg font-semibold flex-shrink-0"
            style={{ backgroundColor: "#1B2B5E", color: "#F5F0E8", minHeight: 44 }}>
            Déconnexion
          </button>
        </div>
        <div className="flex flex-wrap gap-1 pb-3">
          {entreesVisibles({ interne, locataire }).map((entree) => {
            const { href, exact } = entree;
            return (
            <a key={href} href={href}
              className="px-3 rounded-lg text-sm font-medium whitespace-nowrap inline-flex items-center"
              style={{
                minHeight: 44,
                color: isActive(href, exact) ? "#E8847A" : "#1B2B5E",
                backgroundColor: isActive(href, exact) ? "rgba(255,255,255,0.2)" : "transparent",
                fontWeight: isActive(href, exact) ? 700 : 500,
              }}>
              {libelleComplet(entree)}
            </a>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
