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

---

## Métadonnées des fichiers déposés : état au 23 septembre 2026

**Le sujet.** Une photo prise au téléphone porte la marque de l'appareil et,
souvent, les **coordonnées GPS du lieu de la prise de vue**. Une photo de chien
est prise au domicile du client : déposée telle quelle dans un bucket public,
elle publie l'adresse de ce client.

**Ce qui a été corrigé.** Le retrait des métadonnées se fait désormais au
passage obligé vers le stockage — `src/lib/depotImage.ts` — et non plus dans
chaque route. Une image y est convertie en WebP, ce qui la redimensionne et
jette tout ce qu'elle portait ; un format illisible est refusé, jamais déposé
brut. `tests/depotImageObligatoire.test.ts` relit les sources et refuse tout
envoi au stockage écrit ailleurs qu'à ce dépôt.

**Ce qui reste à ramener sur ce chemin** (lot d'extension, non fait ici) : les
quatre routes de la boutique et des options, qui convertissent déjà par
`convertirEnWebp` — elles sont sûres, simplement pas encore unifiées — et les
justificatifs (`src/lib/pieces.ts`), qui déposent les octets bruts.

### Risque accepté : les PDF déposés ne sont pas nettoyés

**Date :** 23 septembre 2026

Un PDF n'est pas une image : il ne se convertit pas, et le faire passer par une
conversion le détruirait. Les PDF déposés en justificatif sont donc conservés
**tels quels**.

Un PDF peut porter des métadonnées gênantes : auteur, logiciel producteur,
chemin du fichier d'origine, date de création, et — s'il a été fabriqué à
partir d'une photo — l'EXIF de cette photo, coordonnées comprises. Nous ne les
retirons pas.

**Pourquoi c'est accepté.** Le bucket `justificatifs` est **privé**
(`public: false`), lu uniquement par URL signée de courte durée ; aucune URL
publique n'est jamais fabriquée pour lui. Le risque n'est donc pas une
publication mais une conservation : ces métadonnées ne sont visibles que de qui
a déjà le droit de lire la pièce.

**Ce qui ferait tomber cette décision.** Rendre le bucket public, fabriquer une
URL non signée, ou joindre un justificatif à un envoi sortant (e-mail, export
client). Dans ces cas, il faudra nettoyer les PDF avant dépôt.

### L'état du stockage constaté le 23 septembre 2026

Relevé avant toute correction, sans rien modifier :

| Bucket | Public | Objets | Nature | Métadonnées constatées |
|---|---|---|---|---|
| `boutique-photos` | oui | 349 | 348 WebP convertis, 1 PNG | aucun EXIF |
| `chiens-photos` | **oui** | **1** | 1 PNG 1254×1254 | aucun EXIF, aucune coordonnée |
| `justificatifs` | non | 9 | 9 PNG, 630 octets en tout | fichiers de recette |
| `factures` | non | 109 | PDF que nous fabriquons | sans objet |

Sur 22 chiens, **un seul** avait une photo. Les deux PNG publics ont été relus
par leur URL publique : ni EXIF, ni XMP, ni bloc GPS. Le format PNG n'est pas
celui d'un appareil photo — ce sont des captures d'écran.

**Aucun objet n'a été modifié ni supprimé** : il n'y avait rien à reprendre. La
porte était ouverte avant que quiconque ne l'emprunte.

### Le HEIC des iPhone n'est pas lisible

**Date :** 23 septembre 2026

`sharp` 0.35.4 / libvips 8.18.6 **ne décode pas le HEIC**. Vérifié sur trois
vrais fichiers (`compression: hevc`) : l'en-tête se lit — format, dimensions —
puis la lecture des pixels échoue sur `source: bad seek`. Les binaires
précompilés embarquent `libheif` et `aom` (AV1) mais **aucun codec HEVC**,
retiré pour raisons de brevets ; l'écriture échoue de même
(`heifsave: Unsupported compression`). Ce n'est pas propre à une plateforme :
les paquets `@img/sharp-*` sont bâtis d'une seule recette.

**Conséquence.** Un HEIC est REFUSÉ avec une phrase qui donne la manœuvre
(Réglages ▸ Appareil photo ▸ Formats ▸ « Le plus compatible »), jamais déposé
brut. La route des photos de chiens n'acceptait déjà que JPEG, PNG et WebP.
Reste ouverte la question des justificatifs, qui acceptent `image/heic` et le
conservent tel quel : la trancher avant de les ramener sur le chemin unique.
