"use client";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/src/lib/supabase-browser";
// Les entrées viennent du module partagé : le tableau de bord lit la même
// liste, et les deux surfaces ne peuvent plus se contredire.
import { entreesVisibles, libelleComplet } from "@/src/lib/entreesEspaceClient";
import {
  LIEN_ESPACE_PENSION,
  RETOUR_PENSION,
  RETOUR_PENSION_COURT,
} from "@/src/lib/personnel";
export default function NavBarClient({
  interne = false,
  locataire = false,
  personnel = false,
}: {
  interne?: boolean;
  locataire?: boolean;
  /**
   * Compte `admin` ou `employe`. La décision est prise une seule fois, dans le
   * layout client : la barre ne relit pas `profiles` pour la reprendre.
   */
  personnel?: boolean;
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
            {/* Avec deux boutons à droite, la ligne du haut manque de 71 px à
                375 px : le libellé court n'en rend que 59. Le mot-marque cède
                donc la place jusqu'à 520 px, le logo disant déjà la marque.
                Pour un client, rien ne change : il n'a qu'un bouton. */}
            <span
              className={`font-bold text-xl ${personnel ? "hidden min-[520px]:inline" : ""}`}
              style={{ color: "#1B2B5E" }}
            >
              La Dogosphère
            </span>
          </a>
          {/* 44 px : c'est la taille d'un pouce, pas celle d'un curseur. */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {personnel && (
              // Clair sur marine : « Déconnexion » reste le seul bouton sombre,
              // donc le seul qui se lise comme définitif.
              <a href={LIEN_ESPACE_PENSION}
                className="text-sm px-4 rounded-lg font-semibold whitespace-nowrap inline-flex items-center"
                style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E", minHeight: 44, textDecoration: "none" }}>
                {/* Le libellé long dès que la ligne le porte, le court en
                    dessous : il rend 59 px. */}
                <span className="hidden min-[576px]:inline">{RETOUR_PENSION}</span>
                <span className="min-[576px]:hidden">{RETOUR_PENSION_COURT}</span>
              </a>
            )}
            <button onClick={handleLogout}
              className="text-sm px-4 rounded-lg font-semibold whitespace-nowrap"
              style={{ backgroundColor: "#1B2B5E", color: "#F5F0E8", minHeight: 44 }}>
              Déconnexion
            </button>
          </div>
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
