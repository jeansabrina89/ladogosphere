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
    include: ["tests/**/*.test.ts"],
    // Le garde-fou : aucune requête vers Sentry pendant la suite.
    setupFiles: ["./tests/setup/sansSentry.ts"],
  },
});
