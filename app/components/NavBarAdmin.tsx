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
  ]},
  { titre: "Gestion", liens: [
    { href: "/tarifs", label: "💰 Tarifs" },
    { href: "/comptabilite", label: "📈 Compta" },
  ]},
  { titre: "RH", liens: [
    { href: "/employes", label: "👥 Équipe" },
  ]},
];

export default function NavBarAdmin() {
  return <SidebarStaff sections={SECTIONS_ADMIN} />;
}
