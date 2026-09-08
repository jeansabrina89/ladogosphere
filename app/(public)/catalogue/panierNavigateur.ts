"use client";

import {
  CLE_PANIER_LOCAL,
  PANIER_VIDE,
  ajouterLocalement,
  changerQuantiteLocale,
  lirePanierLocal,
  nombreArticlesLocal,
  retirerLocalement,
  type LigneLocale,
  type PanierLocal,
} from "@/src/lib/panierLocalLogique";

/**
 * Le panier du visiteur, dans SON navigateur.
 *
 * Rien ne part en base : ni ligne de commande, ni fiche client, ni réservation
 * de stock. Le stock se réserve à la commande, et un panier n'est pas une
 * commande — quelqu'un qui ferme l'onglet n'a rien retenu à personne.
 *
 * Les règles vivent dans `panierLocalLogique`, qui est pur et testé. Ici, il
 * n'y a que le rangement — et le soin d'un navigateur qui refuse d'écrire :
 * une navigation privée, un stockage bloqué, et l'on continue sans panier
 * plutôt que de tomber en panne.
 */

const EVENEMENT = "panier-local-change";

export function lirePanier(): PanierLocal {
  if (typeof window === "undefined") return PANIER_VIDE;
  try {
    return lirePanierLocal(window.localStorage.getItem(CLE_PANIER_LOCAL));
  } catch {
    return PANIER_VIDE;
  }
}

export function ecrirePanier(panier: PanierLocal): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLE_PANIER_LOCAL, JSON.stringify(panier));
  } catch {
    // Stockage refusé : le panier ne survivra pas au rechargement, et c'est
    // tout ce qui se passe. On ne bloque pas la visite pour autant.
  }
  // La barre du panier écoute : elle se met à jour sans rechargement.
  window.dispatchEvent(new CustomEvent(EVENEMENT));
}

export function viderPanier(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CLE_PANIER_LOCAL);
  } catch {
    /* rien à faire */
  }
  window.dispatchEvent(new CustomEvent(EVENEMENT));
}

export function ajouter(ligne: LigneLocale): PanierLocal {
  const suivant = ajouterLocalement(lirePanier(), ligne);
  ecrirePanier(suivant);
  return suivant;
}

export function retirer(index: number): PanierLocal {
  const suivant = retirerLocalement(lirePanier(), index);
  ecrirePanier(suivant);
  return suivant;
}

export function changerQuantite(index: number, quantite: number): PanierLocal {
  const suivant = changerQuantiteLocale(lirePanier(), index, quantite);
  ecrirePanier(suivant);
  return suivant;
}

export function nombreArticles(): number {
  return nombreArticlesLocal(lirePanier());
}

/**
 * Le panier BRUT, tel qu'il est rangé — une chaîne, donc comparable.
 *
 * C'est ce que `useSyncExternalStore` demande : une valeur stable d'un rendu à
 * l'autre. Un objet fraîchement analysé changerait d'identité à chaque lecture
 * et ferait tourner React en rond.
 */
export function lireBrut(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(CLE_PANIER_LOCAL) ?? "";
  } catch {
    return "";
  }
}

/**
 * Ce que le serveur en sait : rien. Le panier vit dans le navigateur, donc le
 * rendu du serveur ne peut que dire « je ne sais pas encore » — et l'écran
 * l'annonce plutôt que d'afficher un panier vide qui serait un mensonge.
 */
export function brutAuServeur(): null {
  return null;
}

/** S'abonner aux changements — dans cet onglet comme dans les autres. */
export function ecouter(quand: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const surStockage = (e: StorageEvent) => {
    if (e.key === null || e.key === CLE_PANIER_LOCAL) quand();
  };
  window.addEventListener(EVENEMENT, quand);
  window.addEventListener("storage", surStockage);
  return () => {
    window.removeEventListener(EVENEMENT, quand);
    window.removeEventListener("storage", surStockage);
  };
}
