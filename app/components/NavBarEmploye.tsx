import SidebarStaff, { type SectionNav } from "./SidebarStaff";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { compterReservationsPersonnelAVoir } from "@/src/lib/reservationsPersonnelAdmin";

export default async function NavBarEmploye() {
  const perms = await getProfilePerms();

  const { count: cAdh } = await supabaseAdmin
    .from("cotisations_membres")
    .select("id", { count: "exact", head: true })
    .eq("statut", "en_attente");
  const nbAdhesions = cAdh ?? 0;

  const { count: cAbo } = await supabaseAdmin
    .from("abonnements")
    .select("id", { count: "exact", head: true })
    .eq("statut", "en_attente_paiement");
  const nbAbonnements = cAbo ?? 0;

  const nbResaPersonnel = await compterReservationsPersonnelAVoir();

  const SECTIONS_EMPLOYE: SectionNav[] = [
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
      { href: "/reservations?personnel=1", label: "⭐ Personnel", badge: nbResaPersonnel || undefined },
      ...(perms.perm_encaissements ? [
        { href: "/adhesions", label: "🎫 Adhésions", badge: nbAdhesions || undefined },
        { href: "/abonnements", label: "🎟️ Abonnements", badge: nbAbonnements || undefined },
      ] : []),
    ]},
    { titre: "Mon espace", liens: [
      { href: "/mon-compte", label: "🐾 Mes chiens" },
    ]},
    { titre: "RH", liens: [
      { href: "/employes/mon-espace", label: "👤 Mon espace RH" },
    ]},
  ];

  return <SidebarStaff sections={SECTIONS_EMPLOYE} />;
}
