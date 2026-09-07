import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import FormModifierReservation from "./FormModifierReservation";

// Le formulaire est un composant client : la garde vit donc dans cette page
// serveur. Modifier une réservation demande la permission correspondante.
export default async function ModifierReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerAccesAdmin("perm_reservations_modifier");
  const { id } = await params;
  return <FormModifierReservation id={id} />;
}
