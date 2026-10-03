import { lireAppelant } from "@/src/lib/garde";
import NavBarPersonnel from "./NavBarPersonnel";
import NavBarClient from "./NavBarClient";

/**
 * La barre de navigation : celle du personnel, ou celle du client.
 *
 * Le rôle vient de `lireAppelant()` — la MÊME lecture que la garde de la page,
 * partagée dans la requête (APP 70). Avant, la barre ouvrait son propre client
 * et relisait session et profil : deux allers-retours de plus jusqu'à la base,
 * pour un rôle que la page venait de lire.
 */
export default async function NavBarServeur() {
  const appelant = await lireAppelant();
  const role = appelant?.role ?? "client";

  // Admin et employée partagent la même barre : ce qui les distingue, ce sont
  // leurs permissions, pas un menu écrit deux fois.
  if (role === "admin" || role === "employe") return <NavBarPersonnel />;
  return <NavBarClient />;
}
