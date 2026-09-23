import { redirect } from "next/navigation";
import NavBarClient from "@/app/components/NavBarClient";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import CreerProfilPersonnel from "@/app/components/CreerProfilPersonnel";
import {
  BANDEAU_PERSONNEL,
  LIEN_ESPACE_PENSION,
  RETOUR_PENSION_BANDEAU,
  ficheDoitDevenirInterne,
} from "@/src/lib/personnel";
import { basculerFicheEnInterneServeur } from "@/src/lib/ficheInterne";
import { catalogueVisible } from "@/src/lib/prestationsLogique";

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
  let ficheLocataire = false;
  // Prise ici, et ici seulement : la barre la reçoit, elle ne la redevine pas.
  let personnel = false;

  if (user) {
    const [{ data: profil }, { data: fiche }] = await Promise.all([
      supabaseAdmin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      supabaseAdmin.from("clients").select("id, interne, locataire_box").eq("auth_user_id", user.id).maybeSingle(),
    ]);

    const estPersonnel = profil?.role === "employe" || profil?.role === "admin";
    personnel = estPersonnel;

    if (estPersonnel && !fiche) {
      // Pas encore de fiche interne : on la propose, sans quitter l'espace.
      // La sortie vers la pension compte double ici : sans fiche, il n'y a
      // rien d'autre à faire sur cet écran.
      return (
        <>
          <NavBarClient personnel />
          <CreerProfilPersonnel />
        </>
      );
    }

    // Un compte client sans fiche : réparation via /mon-compte/completer-profil.
    if (!estPersonnel && !fiche) redirect("/mon-compte/completer-profil");

    ficheInterne = !!fiche?.interne;
    ficheLocataire = catalogueVisible(fiche);

    // Correctif : un compte du personnel qui avait déjà une fiche ORDINAIRE
    // voyait l'adhésion et la journée d'essai. On la bascule en interne, une
    // fois pour toutes. Jamais l'inverse (cf. ficheDoitDevenirInterne).
    if (fiche && ficheDoitDevenirInterne({ role: profil?.role, ficheInterne: !!fiche.interne })) {
      // La fiche est celle de la personne connectée (auth_user_id), et son
      // profil est du personnel : la vérification est faite ici même.
      await basculerFicheEnInterneServeur(fiche.id, user.id);
      ficheInterne = true;
    }
  }

  return (
    <>
      <NavBarClient interne={ficheInterne} locataire={ficheLocataire} personnel={personnel} />
      {ficheInterne && (
        <div
          style={{
            backgroundColor: "#F4EAC9",
            color: "#6E5410",
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span>⭐ {BANDEAU_PERSONNEL}</span>
          {/* Deux chemins pour un même retour : le bandeau se lit, la barre se
              cherche. Celui-ci est un lien en toutes lettres, pas un bouton. */}
          <a
            href={LIEN_ESPACE_PENSION}
            style={{ color: "#6E5410", fontWeight: 700, textDecoration: "underline" }}
          >
            {RETOUR_PENSION_BANDEAU}
          </a>
        </div>
      )}
      {children}
    </>
  );
}
