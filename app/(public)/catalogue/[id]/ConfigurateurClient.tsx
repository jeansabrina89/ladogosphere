"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Configurateur, { type ArticleConfigurable } from "@/app/components/Configurateur";
import { ajouterConfigurationAuPanier } from "../actions";
import { ajouter as ajouterLocalement } from "../panierNavigateur";
import { figerChoix } from "@/src/lib/personnalisationLogique";
import type { ChoixParGroupe, Dependance, OptionGroupe } from "@/src/lib/personnalisationLogique";

/**
 * Le configurateur d'APP 12, cette fois VALIDANT : le client termine sa
 * configuration et l'ajoute au panier. C'est le même composant qu'au comptoir
 * — mêmes coloris, même récapitulatif, même prix — avec un bouton de plus.
 */
export default function ConfigurateurClient({
  article,
  groupes,
  dependances,
  connecte,
}: {
  article: ArticleConfigurable;
  groupes: OptionGroupe[];
  dependances: Dependance[];
  connecte: boolean;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function valider(choix: ChoixParGroupe) {
    // Sans compte, la configuration part dans le panier du navigateur. Les
    // choix y dorment tels quels ; le prix, lui, sera RELU à la validation —
    // on ne facture jamais un montant venu du navigateur.
    if (!connecte) {
      ajouterLocalement({
        article_id: article.id,
        quantite: 1,
        configuration: figerChoix(groupes, choix, dependances) as unknown[],
      });
      router.push("/catalogue/panier");
      return;
    }
    setEnCours(true);
    setErreur(null);
    const res = await ajouterConfigurationAuPanier(article.id, choix);
    setEnCours(false);
    if (res.error) {
      setErreur(res.error);
      return;
    }
    router.push("/catalogue/panier");
  }

  return (
    <>
      {erreur && (
        <p role="alert" style={{
          backgroundColor: "#FDECEC", color: "#8A1F1F", border: "1px solid #F0C2C2",
          borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 600,
          margin: "0 0 16px",
        }}>
          {erreur}
        </p>
      )}
      <Configurateur
        article={article}
        groupes={groupes}
        dependances={dependances}
        affichage="grille"
        onValider={(choix) => void valider(choix)}
        libelleValidation="🛒 Ajouter au panier"
        enCours={enCours}
        noteFin="Votre configuration est figée au moment où vous l'ajoutez : le prix et les coloris retenus ne bougeront plus, quoi qu'il arrive au catalogue ensuite."
      />
    </>
  );
}
