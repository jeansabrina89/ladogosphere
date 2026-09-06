import { redirect } from "next/navigation";
import NavBarClient from "@/app/components/NavBarClient";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";

/**
 * Filet de sécurité : un compte au rôle `client` DOIT avoir une fiche `clients`.
 * Les comptes créés avant l'inscription automatique n'en ont pas — sans fiche,
 * tout l'espace client affiche « Profil introuvable ». On les envoie compléter
 * leur profil, ce qui crée la fiche manquante.
 *
 * La page /mon-compte/completer-profil vit dans un autre groupe de routes, donc
 * hors de ce layout : pas de boucle de redirection.
 */
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const [{ data: profil }, { data: fiche }] = await Promise.all([
      supabaseAdmin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      supabaseAdmin.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle(),
    ]);
    // Le personnel peut consulter l'espace client sans avoir de fiche : on ne
    // redirige que les comptes clients (ou sans profil, créés à moitié).
    const estClient = !profil || profil.role === "client";
    if (estClient && !fiche) redirect("/mon-compte/completer-profil");
  }

  return (
    <>
      <NavBarClient />
      {children}
    </>
  );
}
