import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import FormMotDePasse from "./FormMotDePasse";

// Le formulaire est un composant client : la garde vit donc dans cette page
// serveur, comme sur tous les autres écrans du groupe (admin).
export default async function ChangerMotDePassePage() {
  await exigerAccesAdmin();
  return <FormMotDePasse />;
}
