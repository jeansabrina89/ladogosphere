import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/(\d{8})(\d{4})/, "$1-$2");
mkdirSync("backups", { recursive: true });
const fichier = `backups/donnees-${ts}.sql`;
console.log("Sauvegarde des donnees vers " + fichier + " ...");
execSync(`npx --yes supabase@latest db dump --linked --data-only --schema public -f ${fichier}`, { stdio: "inherit" });
console.log("Termine : " + fichier);
