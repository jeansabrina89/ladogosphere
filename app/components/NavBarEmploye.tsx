import SidebarStaff, { type SectionNav } from "./SidebarStaff";

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
  ]},
  { titre: "RH", liens: [
    { href: "/employes/mon-espace", label: "👤 Mon espace RH" },
  ]},
];

export default function NavBarEmploye() {
  return <SidebarStaff sections={SECTIONS_EMPLOYE} />;
}
