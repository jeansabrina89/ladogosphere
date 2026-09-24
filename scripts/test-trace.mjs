import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";

/**
 * `npm run test:trace` — la suite, dont la sortie est TOUJOURS conservée.
 *
 * On a perdu deux fois la sortie d'un échec isolé, et deux fois pour la même
 * raison : la règle « garde la sortie avant de relancer » demande d'y penser
 * au pire moment, celui où l'on veut juste savoir si c'est vert. Une règle qui
 * repose sur le fait d'y penser ne tient pas ; celle-ci n'a rien à demander.
 *
 * La sortie part dans `traces-tests/<horodatage>.txt` AVANT tout filtrage, et
 * s'affiche aussi à l'écran. Le code de sortie est celui de vitest : filtrer
 * l'affichage ne peut plus faire disparaître le détail d'un échec.
 *
 * À utiliser à la place de `npm test` pour les vérifications de fin de lot.
 */

const DOSSIER = "traces-tests";
mkdirSync(DOSSIER, { recursive: true });

const horodatage = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const fichier = join(DOSSIER, `${horodatage}.txt`);
const trace = createWriteStream(fichier);

const vitest = spawn("npx", ["vitest", "run", ...process.argv.slice(2)], {
  shell: true,
  stdio: ["inherit", "pipe", "pipe"],
});

for (const flux of [vitest.stdout, vitest.stderr]) {
  flux.on("data", (morceau) => {
    trace.write(morceau);
    process.stdout.write(morceau);
  });
}

vitest.on("close", (code) => {
  trace.end(`\n[code de sortie : ${code}]\n`, () => {
    console.log(`\nSortie complète conservée : ${fichier}`);
    process.exit(code ?? 1);
  });
});
