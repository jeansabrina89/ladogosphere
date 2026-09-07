import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { aujourdhuiISO } from "@/src/lib/dates";
import { estMembreActif } from "@/src/lib/membre";
import {
  lignesDeCommande,
  lignesPanier,
  lireParametresEnLigne,
  panierDuClient,
  reservationsAVenir,
} from "@/src/lib/venteEnLigne";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import Panier, { type LigneAffichee } from "./Panier";

export const dynamic = "force-dynamic";

/** Le panier du client. Il faut un compte : c'est ici qu'on commande. */
export default async function PanierPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?suite=/mon-compte/boutique/panier");

  const { data: fiche } = await supabase
    .from("clients").select("id, nom, prenom, adresse").eq("auth_user_id", user.id).maybeSingle();
  if (!fiche) redirect("/mon-compte/completer-profil");

  const clientId = fiche.id as string;
  const panier = await panierDuClient(clientId);

  const [lignesBrutes, lignesDb, params, membre, resas] = await Promise.all([
    panier ? lignesPanier(panier.id) : Promise.resolve([]),
    panier ? lignesDeCommande(panier.id) : Promise.resolve([]),
    lireParametresEnLigne(),
    estMembreActif(supabaseAdmin, clientId),
    reservationsAVenir(clientId, aujourdhuiISO()),
  ]);

  // Les lignes portent leur identifiant : c'est lui qu'on modifie ou retire.
  const lignes: LigneAffichee[] = lignesBrutes.map((l, i) => ({
    ...l, id: lignesDb[i]?.id ?? l.article_id,
  }));

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">
        <EnTete
          titre="🛒 Mon panier"
          sousTitre="Vérifiez, choisissez comment le recevoir, et validez."
          action={<Bouton href="/mon-compte/boutique" variante="secondaire">← Boutique</Bouton>}
        />

        <Carte>
          <Panier
            lignes={lignes}
            estMembre={membre}
            remisePourcent={params.remisePourcent}
            grillePort={params.grillePort}
            poidsMaxGrammes={params.poidsMaxGrammes}
            delaiJours={params.delaiPreparationJours}
            reservations={resas}
            adresseClient={
              fiche.adresse
                ? {
                    nom: `${fiche.prenom ?? ""} ${fiche.nom ?? ""}`.trim(),
                    rue: String(fiche.adresse).split("\n")[0] ?? "",
                    npa: "",
                    localite: "",
                  }
                : { nom: `${fiche.prenom ?? ""} ${fiche.nom ?? ""}`.trim() }
            }
          />
        </Carte>
      </div>
    </main>
  );
}
