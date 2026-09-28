/**
 * Import des photos du fournisseur Eric Schweizer — usage unique (APP 35).
 *
 * 454 articles ont été créés le 28.09.2026 sans photo. Ce script leur donne
 * la leur, EXACTEMENT comme si Sabrina l'avait déposée à la main depuis la
 * fiche de l'article.
 *
 * ── IL NE RÉÉCRIT RIEN ────────────────────────────────────────────────────
 *
 * La conversion, le format et la forme du chemin viennent de
 * `src/lib/imageBoutique.ts`, importé tel quel : node sait lire le TypeScript
 * depuis la version 23, et ce fichier n'importe que `sharp`. Une copie de ces
 * règles ici vivrait sa vie et finirait par déposer autre chose que l'app.
 *
 * `deposerImage()` de `src/lib/depotImage.ts`, lui, N'EST PAS importable : il
 * passe par `@/src/lib/supabase-admin`, et l'alias `@/` n'existe qu'au build.
 * L'envoi est donc écrit ici, avec les mêmes options que lui
 * (`contentType: "image/webp"`, pas d'écrasement). Ce que ce passage obligé
 * protège — qu'aucun octet brut n'entre dans le bucket — tient quand même :
 * c'est `convertirEnWebp` de l'app qui produit ce qui est déposé, et rien
 * d'autre ne part.
 *
 * ── UNE COPIE PAR ARTICLE, JAMAIS UN FICHIER PARTAGÉ ──────────────────────
 *
 * 267 photos pour 454 articles : une même image sert plusieurs contenances
 * (« Bouchées de légumes » en 450 g, 900 g et 2 kg). Chaque article reçoit
 * pourtant SA copie, à son propre chemin. Un fichier partagé se supprimerait
 * avec la première variante et laisserait les autres avec une image morte —
 * et personne ne ferait le lien.
 *
 * ── RELANÇABLE ────────────────────────────────────────────────────────────
 *
 * Seuls sont touchés les articles dont la référence est dans le fichier, dont
 * le fournisseur est Eric Schweizer, et dont `photo_path` est vide. Relancer
 * ne refait donc rien.
 *
 * Usage :
 *   node scripts/import-photos-schweizer.mjs --essai            (rien n'est écrit)
 *   node scripts/import-photos-schweizer.mjs --limite 3
 *   node scripts/import-photos-schweizer.mjs
 *   node scripts/import-photos-schweizer.mjs --fichier "Claude outputs/autre.txt"
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  convertirEnWebp,
  cheminImage,
  BUCKET_PHOTOS,
  FORMAT_ARTICLE,
} from "../src/lib/imageBoutique.ts";

/**
 * Le fichier des chiens reste le défaut (APP 35).
 *
 * `--fichier <chemin>` sert les lots suivants — chats, rongeurs, oiseaux,
 * faune (APP 45) — sans que rien ne change pour qui relance le premier. Le
 * défaut est gardé plutôt que rendu obligatoire : une option qu'on peut
 * oublier vaut mieux qu'un argument qu'on peut se tromper d'écrire, et le
 * script est déjà relançable sans effet.
 */
const FICHIER_PAR_DEFAUT = "Claude outputs/photos-schweizer-chiens.txt";
const FOURNISSEUR = "Eric Schweizer";
const URL_IMAGE = (id) =>
  `https://pet.ericschweizer.ch/userdata/dcshop/images/normal/${id}.png`;

/** Quelques requêtes à la fois : on ne martèle pas le serveur du fournisseur. */
const DE_FRONT = 3;
/** Une pause entre deux vagues, pour la même raison. */
const PAUSE_MS = 250;

const args = process.argv.slice(2);
const ESSAI = args.includes("--essai");
const LIMITE = (() => {
  const i = args.indexOf("--limite");
  return i >= 0 ? Number(args[i + 1]) : Infinity;
})();
const FICHIER = (() => {
  const i = args.indexOf("--fichier");
  if (i < 0) return FICHIER_PAR_DEFAUT;
  const chemin = args[i + 1];
  // Un `--fichier` sans chemin reprendrait le défaut en silence, et l'on
  // croirait avoir traité un lot qu'on n'a pas ouvert.
  if (!chemin || chemin.startsWith("--")) {
    console.error("--fichier attend un chemin.");
    process.exit(1);
  }
  return chemin;
})();

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * « 1 échec », « 2 échecs » — le journal se relit, autant qu'il se lise bien.
 *
 * Les deux formes sont données en entier : coller un « s » à « photo déposée »
 * donnerait « photo déposées », où seul le second mot s'accorde.
 */
const pluriel = (n, singulier, pluriels) => `${n} ${n > 1 ? pluriels : singulier}`;

// ── La clé de service, lue et jamais montrée ───────────────────────────────

/**
 * `.env.local` n'est pas chargé hors de Next : on le lit à la main.
 *
 * La valeur ne sort jamais d'ici — ni console, ni fichier, ni message d'erreur.
 * Un `console.log(env)` de mise au point suffirait à la faire fuiter dans une
 * trace qu'on collerait ensuite quelque part sans y penser.
 */
function lireEnvLocal() {
  const texte = readFileSync(".env.local", "utf8");
  const valeurs = {};
  for (const ligne of texte.split(/\r?\n/)) {
    const m = ligne.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) valeurs[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return valeurs;
}

const env = lireEnvLocal();
const URL_SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL;
const CLE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_SUPABASE || !CLE) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquante dans .env.local.",
  );
  process.exit(1);
}

const sb = createClient(URL_SUPABASE, CLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Le fichier préparé ─────────────────────────────────────────────────────

function lireFichier() {
  const lignes = readFileSync(FICHIER, "utf8").split(/\r?\n/);
  const photos = [];
  for (const brute of lignes) {
    const ligne = brute.trim();
    if (!ligne || ligne.startsWith("#")) continue;
    const [identifiant, refs] = ligne.split(/\s+/);
    if (!identifiant || !refs) continue;
    photos.push({
      identifiant,
      references: refs.split(",").map((r) => r.trim()).filter(Boolean),
    });
  }
  return photos;
}

// ── Ce que la base dit de ces références ───────────────────────────────────

async function articlesDuFichier(references) {
  const { data: fournisseur, error: e1 } = await sb
    .from("fournisseurs")
    .select("id, nom")
    .eq("nom", FOURNISSEUR)
    .maybeSingle();
  if (e1 || !fournisseur) {
    console.error(`Fournisseur « ${FOURNISSEUR} » introuvable.`);
    process.exit(1);
  }

  // Par paquets : une clause `in` de 454 valeurs passe mal dans une URL.
  const parRef = new Map();
  for (let i = 0; i < references.length; i += 100) {
    const paquet = references.slice(i, i + 100);
    const { data, error } = await sb
      .from("articles")
      .select("id, reference, nom, photo_path, fournisseur_id")
      .in("reference", paquet);
    if (error) {
      console.error("Lecture des articles impossible :", error.message);
      process.exit(1);
    }
    for (const a of data ?? []) parRef.set(a.reference, a);
  }
  return { fournisseur, parRef };
}

// ── Le téléchargement, avec UN essai de rattrapage ─────────────────────────

/**
 * Un réseau qui hoquette n'est pas une image manquante. Un seul rattrapage :
 * au-delà, c'est que l'image n'est pas là, et insister ne la fera pas venir.
 */
async function telecharger(identifiant) {
  let dernier = "";
  for (let essai = 0; essai < 2; essai++) {
    try {
      const r = await fetch(URL_IMAGE(identifiant), {
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) {
        dernier = `HTTP ${r.status}`;
        // Un 404 est une réponse, pas un incident : inutile de réessayer.
        if (r.status >= 400 && r.status < 500) break;
      } else {
        return { ok: true, octets: Buffer.from(await r.arrayBuffer()) };
      }
    } catch (e) {
      dernier = e instanceof Error ? e.message : String(e);
    }
    if (essai === 0) await attendre(1000);
  }
  return { ok: false, raison: dernier || "échec réseau" };
}

// ── Une photo, ses articles ────────────────────────────────────────────────

async function traiterPhoto(photo, cibles, compteurs, echecs) {
  const recu = await telecharger(photo.identifiant);
  if (!recu.ok) {
    echecs.push({ identifiant: photo.identifiant, raison: recu.raison });
    return;
  }
  compteurs.telechargees++;

  const conversion = await convertirEnWebp(recu.octets, FORMAT_ARTICLE);
  if (!conversion.ok) {
    echecs.push({ identifiant: photo.identifiant, raison: conversion.error });
    return;
  }
  compteurs.converties++;
  compteurs.octets += conversion.octets.length * cibles.length;

  if (ESSAI) return;

  for (const article of cibles) {
    // UNE COPIE PAR ARTICLE : remplacer ou supprimer la photo d'une variante
    // ne doit jamais toucher celle d'une autre.
    const chemin = `${cheminImage("article", article.id)}.webp`;
    const { error: erreurDepot } = await sb.storage
      .from(BUCKET_PHOTOS)
      .upload(chemin, conversion.octets, {
        contentType: "image/webp",
        upsert: false,
      });
    if (erreurDepot) {
      echecs.push({
        identifiant: `${photo.identifiant} → ${article.reference}`,
        raison: `dépôt : ${erreurDepot.message}`,
      });
      continue;
    }
    compteurs.deposees++;

    // `photo_path` seulement APRÈS un dépôt réussi : une fiche qui pointe vers
    // un objet absent montre une image cassée, ce qui est pire que pas d'image.
    const { error: erreurMaj } = await sb
      .from("articles")
      .update({ photo_path: chemin })
      .eq("id", article.id);
    if (erreurMaj) {
      // La ligne n'a pas bougé : l'objet déposé n'a plus rien à désigner.
      await sb.storage.from(BUCKET_PHOTOS).remove([chemin]);
      compteurs.deposees--;
      echecs.push({
        identifiant: `${photo.identifiant} → ${article.reference}`,
        raison: `photo_path : ${erreurMaj.message}`,
      });
      continue;
    }
    compteurs.misAJour++;
  }
}

// ── Le déroulé ─────────────────────────────────────────────────────────────

async function principal() {
  const photos = lireFichier();
  const toutesRefs = [...new Set(photos.flatMap((p) => p.references))];
  const { fournisseur, parRef } = await articlesDuFichier(toutesRefs);

  const introuvables = [];
  const autreFournisseur = [];
  const dejaUnePhoto = [];
  const aFaire = [];

  let restant = LIMITE;
  for (const photo of photos) {
    const cibles = [];
    for (const ref of photo.references) {
      const a = parRef.get(ref);
      if (!a) { introuvables.push(ref); continue; }
      if (a.fournisseur_id !== fournisseur.id) { autreFournisseur.push(ref); continue; }
      if (a.photo_path) { dejaUnePhoto.push(ref); continue; }
      if (restant <= 0) continue;
      cibles.push(a);
      restant--;
    }
    if (cibles.length > 0) aFaire.push({ photo, cibles });
  }

  // Le chemin est DIT : avec deux fichiers, la seule erreur possible est de
  // croire qu'on traite l'un quand on traite l'autre.
  console.log(`Fichier      : ${FICHIER}`);
  console.log(`Contenu      : ${photos.length} photos, ${toutesRefs.length} références`);
  console.log(`À traiter    : ${aFaire.length} photos, ${aFaire.reduce((n, x) => n + x.cibles.length, 0)} articles`);
  if (introuvables.length) console.log(`Introuvables : ${introuvables.length} (${introuvables.slice(0, 10).join(", ")}${introuvables.length > 10 ? "…" : ""})`);
  if (autreFournisseur.length) console.log(`Autre fournisseur : ${autreFournisseur.length}`);
  if (dejaUnePhoto.length) console.log(`Photo déjà là : ${dejaUnePhoto.length} (ignorés)`);
  console.log(ESSAI ? "MODE ESSAI — rien ne sera écrit." : "Écriture RÉELLE.");
  console.log("");

  const compteurs = { telechargees: 0, converties: 0, deposees: 0, misAJour: 0, octets: 0 };
  const echecs = [];

  for (let i = 0; i < aFaire.length; i += DE_FRONT) {
    const vague = aFaire.slice(i, i + DE_FRONT);
    await Promise.all(
      vague.map((x) => traiterPhoto(x.photo, x.cibles, compteurs, echecs)),
    );
    const fait = Math.min(i + DE_FRONT, aFaire.length);
    process.stdout.write(`\r  ${fait}/${aFaire.length} photos…`);
    if (fait < aFaire.length) await attendre(PAUSE_MS);
  }
  console.log("");
  console.log("");

  console.log(`Téléchargées       : ${compteurs.telechargees}`);
  console.log(`Converties         : ${compteurs.converties}`);
  if (!ESSAI) {
    console.log(`Déposées           : ${compteurs.deposees}`);
    console.log(`Articles mis à jour: ${compteurs.misAJour}`);
  }
  console.log(`Poids (copies)     : ${(compteurs.octets / 1024 / 1024).toFixed(1)} Mo`);
  console.log(`Échecs             : ${echecs.length}`);
  for (const e of echecs) console.log(`  ${e.identifiant} — ${e.raison}`);

  if (ESSAI) return;

  /**
   * UNE seule ligne au journal, et elle dit ce qui s'est passé.
   *
   * `parametre` plutôt qu'`article` : le geste ne concerne aucun article en
   * particulier, et `article` ferait pointer l'écran des Réglages vers une
   * fiche qui n'existe pas. `parametre` n'a pas de fiche — donc pas de lien
   * mort — et reste rangé dans un filtre (APP 33).
   *
   * `user_id` nul : c'est un script, il n'y a pas de session. L'écran dira
   * « automatique », ce qui est vrai.
   */
  const { error: erreurJournal } = await sb.from("journal_evenements").insert({
    entite: "parametre",
    entite_id: fournisseur.id,
    evenement: "import_photos_fournisseur",
    avant: null,
    apres: {
      nom: fournisseur.nom,
      photos_deposees: compteurs.deposees,
      articles_mis_a_jour: compteurs.misAJour,
      echecs: echecs.length,
      source: "pet.ericschweizer.ch",
    },
    motif:
      `Import des photos ${fournisseur.nom} : ` +
      `${pluriel(compteurs.deposees, "photo déposée", "photos déposées")}, ` +
      `${pluriel(compteurs.misAJour, "article mis à jour", "articles mis à jour")}, ` +
      `${pluriel(echecs.length, "échec", "échecs")}.`,
    user_id: null,
  });
  if (erreurJournal) console.error("Journal :", erreurJournal.message);
}

await principal();
