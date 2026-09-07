"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Configurateur, { type ArticleConfigurable } from "@/app/components/Configurateur";
import { ajouterConfigurationAuPanier } from "../actions";
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
    if (!connecte) {
      router.push(`/login?suite=/mon-compte/boutique/${article.id}`);
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
    router.push("/mon-compte/boutique/panier");
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
        libelleValidation={connecte ? "🛒 Ajouter au panier" : "Se connecter pour commander"}
        enCours={enCours}
        noteFin="Votre configuration est figée au moment où vous l'ajoutez : le prix et les coloris retenus ne bougeront plus, quoi qu'il arrive au catalogue ensuite."
      />
    </>
  );
}
