import NouvelleReservationLoader from "./loader";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";

export default async function NouvelleReservationPage() {
  await exigerAccesAdmin();
  return <NouvelleReservationLoader />;
}