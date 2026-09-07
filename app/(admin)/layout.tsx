import NavBarServeur from "@/app/components/NavBarServeur";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";

/**
 * Première barrière du groupe (admin). Elle ne remplace PAS la garde de chaque
 * page : un layout ne se réexécute pas à chaque navigation côté client (rendu
 * partiel). Chaque page appelle donc elle aussi `exigerAccesAdmin`.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await exigerAccesAdmin();

  return (
    <>
      <NavBarServeur />
      <div className="md:pl-[248px]">{children}</div>
    </>
  );
}
