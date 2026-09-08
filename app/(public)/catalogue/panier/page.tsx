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
import { catalogueVitrine } from "@/src/lib/vitrine";
import { mentionRemiseMembre } from "@/src/lib/venteEnLigneLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import Panier, { type LigneAffichee } from "./Panier";
import PanierVisiteur, { type ArticlePanier } from "../PanierVisiteur";
import FusionPanier from "../FusionPanier";

export const dynamic = "force-dynamic";

/** Pas d'indexation : la vitrine, c'est le site ; ici, c'est la caisse. */
export const metadata = { robots: { index: false, follow: false } };

/**
 * Le panier.
 *
 * Sans compte, il se regarde et se modifie : il vit dans le navigateur, rien
 * n'est réservé, et le bouton de validation mène à la connexion. C'est là — et
 * seulement là — que le compte devient nécessaire.
 *
 * Avec un compte, c'est le tunnel de commande complet : remise, port, paiement.
 */
export default async function PanierPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return <PanierSansCompte />;

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
          action={<Bouton href="/catalogue" variante="secondaire">← Boutique</Bouton>}
        />

        {/* Le panier du navigateur rejoint le compte, ici comme ailleurs. */}
        <FusionPanier />

        {/* Un client connecté SANS adhésion : on lui dit ce qu'elle vaut, sans
            la lui appliquer. Les remises de ligne, elles, sont déjà dedans. */}
        {!membre && mentionRemiseMembre(params.remisePourcent) && (
          <Carte>
            <p style={{ color: "#6E5410", fontSize: 15, fontWeight: 600, margin: 0 }}>
              🎫 {mentionRemiseMembre(params.remisePourcent)}
            </p>
          </Carte>
        )}

        <Carte>
          <Panier
            lignes={lignes}
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

/**
 * Le panier d'un visiteur.
 *
 * Le serveur ne sait pas ce qu'il contient — c'est le navigateur qui le garde.
 * On lui envoie donc la vitrine entière, et le composant y retrouve ses
 * articles. Les prix affichés viennent d'ici, de la base, jamais du navigateur.
 */
async function PanierSansCompte() {
  const [catalogue, params] = await Promise.all([
    catalogueVitrine(),
    lireParametresEnLigne(),
  ]);

  const articles: ArticlePanier[] = catalogue.map((a) => ({
    id: a.id,
    nom: a.nom,
    prix_vente: Number(a.prix_vente),
    photo_path: a.photo_path,
    type_article: a.type_article,
    en_stock: a.en_stock,
  }));

  const mentionMembre = mentionRemiseMembre(params.remisePourcent);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">
        <EnTete
          titre="🛒 Mon panier"
          sousTitre="Vérifiez votre sélection. La connexion vous sera demandée pour valider."
          action={<Bouton href="/catalogue" variante="secondaire">← Boutique</Bouton>}
        />

        <Carte>
          <PanierVisiteur articles={articles} />
          {mentionMembre && (
            <p style={{ color: "#6E5410", fontSize: 14.5, fontWeight: 600, margin: "16px 0 0" }}>
              🎫 {mentionMembre}
            </p>
          )}
        </Carte>
      </div>
    </main>
  );
}
