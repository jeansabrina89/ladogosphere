import { redirect } from "next/navigation";
import NavBarClient from "@/app/components/NavBarClient";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import CreerProfilPersonnel from "@/app/components/CreerProfilPersonnel";
import { BANDEAU_PERSONNEL, ficheDoitDevenirInterne } from "@/src/lib/personnel";
import { basculerFicheEnInterne } from "@/app/(client)/mon-compte/actionsPersonnel";

/**
 * Deux publics dans cet espace :
 *
 * - un compte `client` DOIT avoir une fiche `clients`. Les comptes créés avant
 *   l'inscription automatique n'en ont pas — sans fiche, tout affiche « Profil
 *   introuvable ». On les envoie compléter leur profil (page hors de ce layout,
 *   donc pas de boucle de redirection) ;
 *
 * - un compte `employe` ou `admin` peut avoir une fiche INTERNE pour ses
 *   propres chiens. Il voit alors exactement les écrans client, avec un bandeau
 *   discret. Sans fiche, on lui propose de la créer ici même.
 */
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let ficheInterne = false;

  if (user) {
    const [{ data: profil }, { data: fiche }] = await Promise.all([
      supabaseAdmin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      supabaseAdmin.from("clients").select("id, interne").eq("auth_user_id", user.id).maybeSingle(),
    ]);

    const estPersonnel = profil?.role === "employe" || profil?.role === "admin";

    if (estPersonnel && !fiche) {
      // Pas encore de fiche interne : on la propose, sans quitter l'espace.
      return (
        <>
          <NavBarClient />
          <CreerProfilPersonnel />
        </>
      );
    }

    // Un compte client sans fiche : réparation via /mon-compte/completer-profil.
    if (!estPersonnel && !fiche) redirect("/mon-compte/completer-profil");

    ficheInterne = !!fiche?.interne;

    // Correctif : un compte du personnel qui avait déjà une fiche ORDINAIRE
    // voyait l'adhésion et la journée d'essai. On la bascule en interne, une
    // fois pour toutes. Jamais l'inverse (cf. ficheDoitDevenirInterne).
    if (fiche && ficheDoitDevenirInterne({ role: profil?.role, ficheInterne: !!fiche.interne })) {
      await basculerFicheEnInterne(fiche.id);
      ficheInterne = true;
    }
  }

  return (
    <>
      <NavBarClient interne={ficheInterne} />
      {ficheInterne && (
        <div
          style={{
            backgroundColor: "#F4EAC9",
            color: "#6E5410",
            fontSize: 13,
            fontWeight: 600,
            textAlign: "center",
            padding: "8px 16px",
          }}
        >
          ⭐ {BANDEAU_PERSONNEL}
        </div>
      )}
      {children}
    </>
  );
}
