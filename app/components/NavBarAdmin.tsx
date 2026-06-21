import SidebarStaff, { type SectionNav } from "./SidebarStaff";

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
    { href: "/adhesions", label: "🎫 Adhésions" },
  ]},
  { titre: "Gestion", liens: [
    { href: "/tarifs", label: "💰 Tarifs" },
    { href: "/comptabilite", label: "📈 Compta" },
  ]},
  { titre: "RH", liens: [
    { href: "/employes", label: "👥 Équipe" },
    { href: "/employes/planning-equipe", label: "🗓️ Planning équipe" },
    { href: "/employes/planning", label: "🛠️ Générer planning" },
    { href: "/employes/timbrage", label: "⏱️ Timbrage" },
    { href: "/employes/vacances", label: "🌴 Vacances" },
  ]},
];

export default function NavBarAdmin() {
  return <SidebarStaff sections={SECTIONS_ADMIN} />;
}
