import SidebarStaff, { type SectionNav } from "./SidebarStaff";
import { supabaseAdmin } from "@/src/lib/supabase-admin";

export default async function NavBarAdmin() {
  const { count } = await supabaseAdmin
    .from("cotisations_membres")
    .select("id", { count: "exact", head: true })
    .eq("statut", "en_attente");
  const nbAdhesions = count ?? 0;

  const { count: cAbo } = await supabaseAdmin
    .from("abonnements")
    .select("id", { count: "exact", head: true })
    .eq("statut", "en_attente_paiement");
  const nbAbonnements = cAbo ?? 0;

  const SECTIONS_ADMIN: SectionNav[] = [
    { titre: null, liens: [{ href: "/", label: "📋 Tableau de bord" }] },
    { titre: "Opérationnel", liens: [
      { href: "/chiens-du-jour", label: "🐾 Chiens du jour" },
      { href: "/checkin", label: "✅ Check-in" },
      { href: "/planning", label: "🗂️ Planning" },
      { href: "/boxes", label: "🏠 Box" },
      { href: "/calendrier-essais", label: "🚫 Essais fermés" },
    ]},
    { titre: "Clients", liens: [
      { href: "/chiens", label: "🐶 Chiens" },
      { href: "/clients", label: "👤 Clients" },
      { href: "/reservations", label: "📅 Réservations" },
      { href: "/adhesions", label: "🎫 Adhésions", badge: nbAdhesions || undefined },
      { href: "/abonnements", label: "🎟️ Abonnements", badge: nbAbonnements || undefined },
    ]},
    { titre: "Gestion", liens: [
      { href: "/tarifs", label: "💰 Tarifs" },
      { href: "/factures", label: "🧾 Factures" },
      { href: "/comptabilite", label: "📈 Compta" },
    ]},
    { titre: "RH", liens: [
      { href: "/employes", label: "👥 Équipe" },
      { href: "/employes/planning", label: "🗓️ Planning équipe" },
      { href: "/employes/timbrage", label: "⏱️ Timbrage" },
      { href: "/employes/vacances", label: "🌴 Vacances" },
    ]},
  ];

  return <SidebarStaff sections={SECTIONS_ADMIN} />;
}
