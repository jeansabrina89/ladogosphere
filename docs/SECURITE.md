# Sécurité — décisions et risques acceptés

Ce fichier garde les décisions de sécurité qui survivent à un prompt : ce qu'on
a choisi de ne PAS corriger, et pourquoi. Une ligne ici vaut engagement de
revenir la relire.

Audit de référence : **audit du code du 22 septembre 2026** (constats S-01 à
S-47, numérotés C-0x dans les prompts de correction). Son rapport n'est pas
encore déposé dans `docs/` ; les constats et l'ordre des corrections vivent
dans l'historique des échanges et dans les commits `Securite : …`.

---

## Risque accepté : xlsx, écriture seule, aucun fichier utilisateur lu

**Date :** 23 septembre 2026
**Constat :** C-08 (dépendances signalées par `npm audit`)
**Avis :** `xlsx` (SheetJS), gravité haute — GHSA-4r6h-8v6p-xvw6 (pollution de
prototype) et GHSA-5pgg-2g8v-p4x9 (déni de service par expression régulière).
**Version installée :** 0.18.5. **Correctif publié : aucun** — l'avis porte sur
toutes les versions du paquet npm.

**Pourquoi c'est accepté.** Les deux failles se déclenchent à la LECTURE d'un
classeur : c'est l'analyse d'un fichier fourni par un tiers qui pollue le
prototype ou fait exploser l'expression régulière. Or la bibliothèque n'est
utilisée ici qu'en ÉCRITURE, pour fabriquer des exports :

- `app/api/comptabilite/export/route.ts`
- `app/api/comptabilite/journal-export/route.ts`
- `app/api/comptabilite/rapports-export/route.ts`
- `app/api/depenses/export/route.ts`
- `app/(admin)/(espace-comptabilite)/comptabilite/Statistiques.tsx` (côté
  navigateur, téléchargement du classeur)

Les seules API appelées sont `book_new`, `json_to_sheet`, `aoa_to_sheet`,
`book_append_sheet`, `write` et `writeFile`. Il n'existe **aucun appel à
`XLSX.read` ni `XLSX.readFile`**, et **aucune route n'accepte de tableur en
dépôt** : rien, nulle part, ne donne à cette bibliothèque un fichier venu d'un
utilisateur.

**Ce qui ferait tomber cette décision.** Toute fonctionnalité d'IMPORT (reprise
de tarifs, d'écritures, d'inventaire depuis un classeur) rouvre le risque : il
faudra alors remplacer la bibliothèque (par exemple `exceljs`) ou analyser le
fichier dans un processus isolé, avant d'écrire la moindre ligne de lecture.

**À revoir :** à chaque `npm audit`, et sans faute si un correctif est publié.
