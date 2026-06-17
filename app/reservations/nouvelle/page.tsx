import NouvelleReservationLoader from "./loader";
import { exigerPersonnelPage } from "@/src/lib/exigerPersonnelPage";

export default async function NouvelleReservationPage() {
  await exigerPersonnelPage();
  return <NouvelleReservationLoader />;
}