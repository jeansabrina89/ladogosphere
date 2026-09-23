import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Le lint TYPÉ, lancé à la demande — `npm run lint:types`.
 *
 * Il ne remplace pas `npm run lint` : c'est une configuration à part, pour que
 * le lint de tous les jours reste rapide (environ une minute et demie) là où
 * celui-ci demande le typage complet du projet (environ six minutes).
 *
 * Ce qu'il attrape, et que rien d'autre ne voit :
 *   • une promesse servant de CONDITION — `if (verifierCron(...))` sans
 *     `await` : la condition est toujours vraie, la garde ne garde plus rien ;
 *   • une promesse passée là où une fonction sans retour est attendue
 *     (`setTimeout(chercher, 500)`) ;
 *   • une promesse lancée sans être attendue ni traitée.
 *
 * `checksVoidReturn.attributes` est désactivé : un `onClick={async () => …}`
 * est la façon normale d'écrire un gestionnaire d'événement en React, et les
 * cent soixante-neuf signalements qu'il produit noieraient les vrais.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-misused-promises": [
        "warn",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/no-floating-promises": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
