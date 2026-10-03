import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Le dossier de secours de kDrive : des copies, pas le logiciel. Le
    // .gitignore ne retient pas ESLint, qui l'aurait lu (187 avertissements
    // sur le site, APP 72).
    "kDrive Rescue Folder/**",
  ]),
]);

export default eslintConfig;
