import { configure } from "@testing-library/dom";
import { vi } from "vitest";

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
 * Le délai du TEST, porté à 15 secondes — et ce n'est pas de la tolérance,
 * c'est du diagnostic.
 *
 * Avec les 5 secondes de vitest, le test expirait AVANT l'attente qu'il
 * contient : on recevait « Test timed out in 5000ms », qui ne nomme rien — ni
 * l'élément cherché, ni ce que la page affichait à la place. La cause restait
 * introuvable, ce qui est exactement ce qui nous est arrivé deux fois.
 *
 * Dans le bon ordre, c'est l'attente qui abandonne la première, à 4 secondes,
 * et elle dit QUEL élément elle n'a pas trouvé, avec le contenu du DOM. Le
 * test, lui, a encore onze secondes devant lui pour rapporter cet échec.
 *
 * La règle qui vaut au-delà de ce fichier : le délai d'un test reste toujours
 * confortablement supérieur à la plus longue attente qu'il contient. Relever
 * l'un sans l'autre ne fait que déplacer le silence.
 */
vi.setConfig({ testTimeout: 15000 });
