import { configure } from "@testing-library/dom";

/**
 * Le délai d'attente des tests de composants — ceux qui tournent dans jsdom.
 *
 * `waitFor` abandonne au bout d'une seconde par défaut. Rendre un composant,
 * résoudre une promesse et repeindre tient très largement dans cette seconde
 * sur une machine au repos ; sur une machine chargée, non — et le test vire au
 * rouge sans que rien n'ait bougé dans le logiciel.
 *
 * Quatre secondes ne rendent aucun test plus indulgent : une attente qui
 * aboutit rend la main dès qu'elle aboutit. Elles ne changent que le moment où
 * l'on déclare que ça n'aboutira pas.
 *
 * Ce fichier n'est chargé que par les fichiers jsdom, qui l'importent ; les
 * tests en environnement node n'en ont pas l'usage.
 */
configure({ asyncUtilTimeout: 4000 });
