import type { CSSProperties } from "react";

/**
 * Les pages légales vivent sur le SITE, pas dans l'application.
 *
 * ── POURQUOI UN MODULE, ET PAS `NEXT_PUBLIC_SITE_URL` ─────────────────────
 *
 * Cette variable existe déjà (`src/lib/email.ts`), mais elle désigne
 * l'APPLICATION — `https://reservation.ladogosphere.ch` — d'où partent les
 * liens d'un e-mail vers une facture ou une commande. Le site vitrine est un
 * autre domaine, et une page légale n'y est pas au même endroit. Réutiliser
 * la variable aurait produit des liens morts qui ne se seraient vus qu'en
 * production, sur la page qu'on lit le moins.
 *
 * Les deux adresses sont donc écrites ici, une seule fois. Le jour où le site
 * déménage, c'est ce fichier qu'on ouvre — et le test qui relit les écrans
 * dira si quelqu'un a recopié une URL ailleurs.
 */

export const LIEN_CONFIDENTIALITE = "https://ladogosphere.ch/confidentialite";
export const LIEN_CONDITIONS_PENSION = "https://ladogosphere.ch/conditions-pension";
/**
 * Les conditions de la BOUTIQUE, distinctes de celles de la pension : garder
 * un chien et vendre un sac de croquettes n'obéissent pas aux mêmes règles.
 * La page est née au lot SITE 34 ; APP 36 n'avait donc pu poser que la moitié
 * de la phrase du panier.
 */
export const LIEN_CONDITIONS_VENTE = "https://ladogosphere.ch/conditions-vente";

/**
 * Ce que tout lien sortant doit porter.
 *
 * `noopener` coupe l'accès de la page ouverte à celle qui l'a ouverte ;
 * `noreferrer` lui cache d'où vient la personne. Les deux ensemble, toujours :
 * un `target="_blank"` seul est une porte laissée entrouverte.
 */
export const LIEN_EXTERNE = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;

/**
 * La couleur des liens de l'espace client — celle du « Continuer mes achats »
 * du panier.
 *
 * Ce n'est PAS `#2E8B7E`, pourtant le vert le plus répandu de l'application :
 * il ne donne que 4,1:1 sur blanc, sous les 4,5:1 qu'un texte courant demande.
 * Celui-ci en donne 5,8:1 sur le fond crème des cartes. Une mention légale que
 * l'on ne peut pas lire ne vaut pas mieux qu'une mention absente.
 */
export const COULEUR_LIEN_LEGAL = "#1F6E5B";

export const STYLE_LIEN_LEGAL: CSSProperties = {
  color: COULEUR_LIEN_LEGAL,
  fontWeight: 600,
  textDecoration: "underline",
};

/** Le texte qui précède le lien, là où l'on remet des données personnelles. */
export const MENTION_DONNEES_AVANT = "Vos données sont traitées selon notre ";
/** Le texte du lien lui-même, dans cette phrase. */
export const MENTION_DONNEES_LIEN = "politique de confidentialité";

/** Le lien discret posé à côté de la case « photos », aux deux endroits. */
export const EN_SAVOIR_PLUS = "En savoir plus";

/** Ce qui précède le lien des conditions, sous le bouton du panier. */
export const MENTION_COMMANDE_AVANT = "En commandant, vous acceptez nos ";
/** Le texte du lien lui-même, dans cette phrase. */
export const MENTION_COMMANDE_LIEN = "conditions de vente";

/** L'alerte « retour en stock » : ce que devient l'adresse laissée. */
export const MENTION_ALERTE_STOCK =
  "Votre adresse sert uniquement à vous prévenir du retour de cet article.";
/** Le lien qui suit cette phrase. */
export const MENTION_ALERTE_STOCK_LIEN = "Politique de confidentialité";
