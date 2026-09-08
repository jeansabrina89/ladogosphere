import SidebarStaff, { type LienNav } from "./SidebarStaff";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import { droitsNav, espacesVisibles } from "@/src/lib/espaces";

/**
 * La barre latérale du personnel — une seule, pour l'administratrice comme
 * pour les employées.
 *
 * Il y en avait deux, presque identiques : elles ont divergé une fois de trop.
 * La différence entre les deux profils n'est pas une liste de menus, c'est un
 * jeu de permissions — et c'est `espacesVisibles` qui en tire la barre.
 *
 * Un espace dont aucun écran n'est ouvert à cette personne n'apparaît pas :
 * ni grisé, ni vide. Une employée au comptoir voit quatre à six entrées.
 */
export default async function NavBarPersonnel() {
  const perms = await getProfilePerms();
  const espaces = espacesVisibles(
    droitsNav(perms as unknown as Record<string, unknown>, perms.isAdmin)
  );

  // Ce qui la concerne elle, séparé de ce qui concerne la pension. Sabrina n'a
  // pas d'espace RH : elle n'est l'employée de personne.
  const personnel: LienNav[] = [
    ...(perms.isAdmin
      ? []
      : [{ href: "/employes/mon-espace", label: "👤 Mon espace RH" }]),
    { href: "/mon-compte", label: "🐾 Mes chiens" },
  ];

  return <SidebarStaff espaces={espaces} personnel={personnel} />;
}
