import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@/": path.resolve(__dirname, "./") + "/",
    },
  },
  test: {
    environment: "node",
    // .tsx : les tests qui rendent un composant (environnement jsdom déclaré
    // fichier par fichier, pour que les autres restent en node).
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Le garde-fou : aucune requête vers Sentry pendant la suite.
    setupFiles: ["./tests/setup/sansSentry.ts"],
    /*
     * LE DÉLAI D'UN TEST — quinze secondes, pour TOUS les fichiers.
     *
     * Ce n'est pas de la tolérance, c'est du diagnostic. Avec les cinq
     * secondes par défaut de vitest, un test chargé expirait sur
     * « Test timed out in 5000ms », qui ne nomme rien : ni ce qu'il
     * attendait, ni ce qu'il a vu à la place. La cause restait introuvable.
     *
     * Les fichiers jsdom avaient déjà quinze secondes, posées de leur côté ;
     * les fichiers en environnement node gardaient cinq secondes, et c'est
     * l'un d'eux — tests/attaqueArchiverClient.test.ts — qui a expiré au
     * lot APP 27 sur une machine chargée, en entraînant deux autres tests
     * du même fichier avec lui (trace 2026-09-26T20-25-05).
     *
     * La valeur est ICI, et nulle part ailleurs : deux endroits qui portent
     * le même délai finissent par ne plus porter le même. L'attente de rendu
     * des tests jsdom reste chez elle (asyncUtilTimeout, 4 s dans
     * tests/setup/attenteJsdom.ts) — ce sont deux choses différentes, et la
     * règle qui les lie est que le délai du TEST reste toujours
     * confortablement supérieur à la plus longue attente qu'il contient.
     */
    testTimeout: 15_000,
  },
});
