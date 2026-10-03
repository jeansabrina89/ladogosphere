#!/usr/bin/env node
/**
 * APP 70 — combien de lectures Supabase fait chaque écran, et combien
 * l'une APRÈS l'autre. Outil LOCAL : ce fichier n'est pas déployé (rien ne
 * l'importe), et l'instrumentation qu'il lit est coupée sur Vercel
 * (src/lib/mesureLectures.ts).
 *
 * ── MODE D'EMPLOI ─────────────────────────────────────────────────────────
 *
 *   1. npm run build
 *   2. Dans un premier terminal :
 *        MESURE_LECTURES=1 MESURE_FICHIER=mesures/lectures.jsonl npm start
 *   3. Dans un second, avec le cookie de session copié depuis le navigateur
 *      (outils de développement → Application → Cookies → toutes les lignes
 *      « sb-…-auth-token… », au format « nom=valeur; nom2=valeur2 ») :
 *        MESURE_FICHIER=mesures/lectures.jsonl \
 *        MESURE_COOKIE_ADMIN="sb-…" \
 *        MESURE_COOKIE_CLIENT="sb-…"   (facultatif : l'espace client) \
 *        node scripts/mesure-pages.mjs
 *
 * Le script ne lit AUCUN .env et n'écrit rien en base : il ne fait que des
 * GET sur les écrans, comme un navigateur.
 *
 * ── CE QUI EST COMPTÉ ─────────────────────────────────────────────────────
 *
 *   · lectures : toutes les requêtes Supabase pendant la page — proxy compris
 *     (son getUser) ;
 *   · en série : la longueur du chemin critique. Trois lectures en
 *     Promise.all comptent pour une ; trois await successifs pour trois.
 *     C'est ce nombre qui coûte cher depuis loin : chaque cran paie un
 *     aller-retour complet jusqu'à la base.
 *   · temps serveur : du premier octet demandé au dernier reçu, en local.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const BASE = process.env.MESURE_BASE ?? "http://localhost:3000";
const FICHIER = process.env.MESURE_FICHIER;
const COOKIE_ADMIN = process.env.MESURE_COOKIE_ADMIN ?? "";
const COOKIE_CLIENT = process.env.MESURE_COOKIE_CLIENT ?? "";
const PASSES = Number(process.env.MESURE_PASSES ?? 3);

if (!FICHIER) {
  console.error("MESURE_FICHIER manque : le même chemin que celui donné à « npm start ».");
  process.exit(1);
}
mkdirSync(dirname(FICHIER), { recursive: true });
if (!existsSync(FICHIER)) writeFileSync(FICHIER, "");

/** Les écrans, et comment trouver l'identifiant d'une fiche dans sa liste. */
const ECRANS = [
  { nom: "Aujourd'hui", chemin: "/", qui: "admin" },
  { nom: "Chiens du jour", chemin: "/chiens-du-jour", qui: "admin" },
  { nom: "Check-in", chemin: "/checkin", qui: "admin" },
  { nom: "Réservations (liste)", chemin: "/reservations", qui: "admin" },
  { nom: "Réservations (fiche)", depuis: "/reservations", motif: /href="(\/reservations\/[0-9a-f-]{36})"/, qui: "admin" },
  { nom: "Clients (liste)", chemin: "/clients", qui: "admin" },
  { nom: "Clients (fiche)", depuis: "/clients", motif: /href="(\/clients\/[0-9a-f-]{36})"/, qui: "admin" },
  { nom: "Fiche chien", depuis: "/chiens-du-jour", motif: /href="(\/chiens\/[0-9a-f-]{36})"/, qui: "admin" },
  { nom: "Caisse", chemin: "/boutique/caisse", qui: "admin" },
  { nom: "Boutique → Articles", chemin: "/boutique/articles", qui: "admin" },
  { nom: "Mon compte", chemin: "/mon-compte", qui: "client" },
  { nom: "Nouvelle réservation", chemin: "/mon-compte/reservations/nouvelle", qui: "client" },
];

const lignes = () =>
  readFileSync(FICHIER, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

/**
 * Les lectures EN SÉRIE : la longueur du chemin critique. Chaque lecture est
 * un cran plus profonde que la plus profonde des lectures déjà REVENUES quand
 * elle est partie ; des lectures parties ensemble ont la même profondeur.
 * (La même règle que tests/helpers/clientSimule.ts.)
 */
export function vagues(requetes) {
  const triees = [...requetes].sort((a, b) => a.debut - b.debut);
  const prof = [];
  for (let i = 0; i < triees.length; i++) {
    let max = 0;
    for (let j = 0; j < i; j++) if (triees[j].fin <= triees[i].debut) max = Math.max(max, prof[j]);
    prof.push(max + 1);
  }
  return prof.length ? Math.max(...prof) : 0;
}

async function charger(chemin, cookie) {
  const debut = Date.now();
  const rep = await fetch(BASE + chemin, { headers: { cookie }, redirect: "manual" });
  const html = await rep.text();
  return { statut: rep.status, html, debut, fin: Date.now() };
}

const resultats = [];
for (const e of ECRANS) {
  const cookie = e.qui === "client" ? COOKIE_CLIENT : COOKIE_ADMIN;
  if (!cookie) { resultats.push({ ...e, absent: "pas de cookie" }); continue; }

  let chemin = e.chemin;
  if (!chemin) {
    const liste = await charger(e.depuis, cookie);
    chemin = e.motif.exec(liste.html)?.[1];
    if (!chemin) { resultats.push({ ...e, absent: "aucune fiche trouvée dans la liste" }); continue; }
  }

  const passes = [];
  for (let i = 0; i < PASSES; i++) {
    const avant = lignes().length;
    const p = await charger(chemin, cookie);
    // Laisser le fichier se vider : appendFileSync est synchrone, mais le
    // dernier fetch peut finir juste après la réponse.
    await new Promise((r) => setTimeout(r, 50));
    const requetes = lignes().slice(avant).filter((l) => l.debut >= p.debut - 5 && l.debut <= p.fin);
    passes.push({ statut: p.statut, ms: p.fin - p.debut, lectures: requetes.length, serie: vagues(requetes), cibles: requetes.map((r) => r.cible) });
  }
  // La première passe chauffe le serveur : on garde la meilleure des suivantes.
  const retenue = passes.slice(PASSES > 1 ? 1 : 0).sort((a, b) => a.ms - b.ms)[0];
  resultats.push({ ...e, chemin, ...retenue });
}

console.log("| Écran | Statut | Lectures | En série | Temps serveur (local) |");
console.log("|---|---|---|---|---|");
for (const r of resultats) {
  if (r.absent) { console.log(`| ${r.nom} | — | — | — | ${r.absent} |`); continue; }
  console.log(`| ${r.nom} | ${r.statut} | ${r.lectures} | ${r.serie} | ${r.ms} ms |`);
}
if (process.env.MESURE_DETAIL === "1") {
  for (const r of resultats.filter((x) => !x.absent)) console.log(`\n${r.nom} : ${r.cibles.join(", ")}`);
}
