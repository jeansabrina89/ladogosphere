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

/**
 * LE DÉLAI DU TEST N'EST PLUS ICI — il est dans `vitest.config.ts`.
 *
 * Il y valait quinze secondes pour les seuls fichiers jsdom, ceux qui
 * importent ce fichier ; les tests en environnement node gardaient les cinq
 * secondes par défaut, et l'un d'eux a expiré au lot APP 27 sur une machine
 * chargée. La valeur est donc montée dans la configuration, où elle vaut pour
 * tout le monde — et où elle n'est écrite qu'une fois.
 *
 * Ce qui reste ici est l'attente de RENDU, qui n'est pas la même chose : elle
 * abandonne la première, à quatre secondes, et elle dit QUEL élément elle n'a
 * pas trouvé, avec le contenu du DOM. Le test, lui, a encore onze secondes
 * devant lui pour rapporter cet échec.
 *
 * La règle qui lie les deux, et qui vaut au-delà de ce fichier : le délai d'un
 * test reste toujours confortablement supérieur à la plus longue attente qu'il
 * contient. Relever l'un sans l'autre ne fait que déplacer le silence.
 */
