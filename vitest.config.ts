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
  },
});
