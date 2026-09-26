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

**Tous les chemins y passent depuis le 23 septembre 2026** : photo de chien,
photo d'article, coloris, image de guide, photo de valeur d'option,
justificatif, et jusqu'au PDF des factures que nous fabriquons. Le garde-fou
n'a **aucune exception à tolérer** : la liste des envois autorisés ne contient
que `src/lib/depotImage.ts`. Une ligne ajoutée à cette liste est un endroit où
une photo peut ressortir avec l'adresse d'un client dedans.

Deux portes, et deux seulement : `deposerImage` convertit et nettoie ;
`deposerDocument` dépose un PDF tel quel et **refuse une image**, afin qu'on ne
puisse pas s'en servir pour contourner la première.

### Décision : l'original d'un justificatif est conservé à côté du nettoyé

**Date :** 24 septembre 2026

**Pourquoi.** Depuis le nettoyage des métadonnées, une photo de justificatif
était convertie en WebP et le fichier remis par l'employé n'existait plus nulle
part. Or le droit suisse impose de conserver les pièces comptables **dix ans**,
et nous n'avons **aucune réponse formelle** sur l'admissibilité d'une pièce
convertie. Plutôt que de parier sur une interprétation, on garde les deux :
l'original pour la conservation, la version nettoyée pour l'affichage.

**Ce que cela implique.** L'original est déposé tel quel, **avec ses
métadonnées** — EXIF, marque de l'appareil, et la position du lieu de la prise
de vue. Il vit dans le bucket privé `justificatifs`, sous le même préfixe que
le nettoyé, suffixé `.origine.<ext>`. Les colonnes `origine_path`,
`origine_mime` et `origine_sha256` le désignent ; `origine_path is null`
signifie qu'il n'y en a pas — un PDF (qui EST l'original) ou une pièce déposée
avant ce jour.

**La règle qui va avec.** L'original ne s'affiche **jamais**. Tout écran, toute
vignette, tout aperçu utilise la version nettoyée. Une seule route le sert,
`/api/pieces/[id]/origine`, par URL signée de deux minutes et sous les mêmes
gardes de permission — et **aucun écran n'y mène**, volontairement : un lien
« original » à côté de chaque pièce serait l'endroit où quelqu'un cliquerait
par réflexe. Elle existe pour la consultation comptable et l'export, le jour
d'un contrôle.

La suppression d'une pièce emporte **les deux fichiers**. Un original resté
seul dans le bucket serait une pièce qu'on croit effacée et qui ne l'est pas.

**Ce qui rouvrirait la décision :** une **réponse formelle sur l'OLICO**
(ordonnance concernant la tenue et la conservation des livres de comptes). Si
une pièce convertie est explicitement admise, l'original devient une donnée
conservée sans nécessité — donc à supprimer, puisque garder des coordonnées
GPS dix ans sans raison ne se justifie plus. S'il est explicitement exigé, rien
ne change.

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

### Décision : le HEIC est refusé partout

**Date :** 23 septembre 2026 — décision prise, ce n'est plus une question
ouverte.

**Ce qui a été choisi.** Aucun HEIC n'entre, nulle part. Ni dans les photos de
chiens (qui ne l'acceptaient déjà pas), ni dans les justificatifs — d'où il
sort de `MIMES_PIECE` et de la liste des types du bucket
(`20260923183000_justificatifs_accepte_webp.sql`). Le refus dit la manœuvre :
« Ce format de photo n'est pas accepté. Envoyez un JPEG ou un PNG. »

**Pourquoi refuser plutôt qu'accepter.** Une image que la bibliothèque ne sait
pas lire est une image qu'on ne sait pas nettoyer. L'accepter reviendrait à
déposer un fichier brut, avec ses coordonnées, en faisant une exception au seul
endroit qui protège tous les autres — et une exception dans un passage obligé
n'est plus un passage obligé.

**Pourquoi c'est tenable.** Ce sont des **employés** qui déposent les
justificatifs, pas des clients : ils peuvent refaire la photo. Et iOS convertit
déjà en JPEG dans la plupart des envois faits depuis un navigateur.

**Ce qui ferait rouvrir la décision.** Que des **clients** déposent eux-mêmes
des photos (une réclamation avec pièce jointe, un dépôt de document depuis
l'espace client) : refuser le format natif de leur téléphone leur ferait
abandonner l'envoi, et le remède serait pire. Il faudrait alors convertir dans
le navigateur avant l'envoi, ou embarquer un décodeur HEVC — en sachant ce que
cela engage côté brevets. Rouvrir aussi si une version de sharp rétablit la
lecture du HEIC dans ses binaires précompilés.

### Le bucket des chiens est passé en privé le 26 septembre 2026 (S-05)

| Bucket | Public | Rôle |
|---|---|---|
| `boutique-photos` | **oui**, et c'est voulu | la vitrine est publique |
| `chiens-photos` | **non, depuis le 26.09.2026** | donnée personnelle, URL signée d'une heure |
| `justificatifs` | non | pièces comptables |
| `factures` | non | PDF que nous fabriquons |

La lecture passe désormais par `urlSigneePhotoChien()` — une seule porte, qui
part de l'identifiant du chien, vérifie le droit dans la session, lit le chemin
en base et signe pour 3600 s.

#### Une heure de cache CDN survit à la fermeture, et c'est mesuré

Passer un bucket en privé ferme la permission **immédiatement**, mais ne purge
pas le cache de Cloudflare qui sert Supabase Storage. Mesuré juste après la
migration, sur l'unique objet du bucket :

| Requête | Réponse |
|---|---|
| l'URL publique exacte, déjà demandée avant | **200**, `CF-Cache-Status: HIT`, l'image entière |
| la même URL avec `?nocache=<horodatage>` | **400** |
| un chemin inexistant du même bucket | **400** |
| la même URL en `HEAD` | **400** |

Autrement dit : **la porte est fermée ; ce qui reste, c'est une photocopie
laissée sur le comptoir.** Elle expire avec le `cache-control: public,
max-age=3600` que Storage avait posé, soit une heure au plus, et seulement pour
les URL exactes déjà demandées. Une photo que personne n'avait ouverte est
inaccessible dès la migration.

Ce n'est donc pas un trou dans la mesure, mais sa borne, et elle se dit : pour
fermer une photo précise à la seconde, il faut la déplacer (changer son chemin),
ce qui rend l'URL en cache caduque quoi qu'il arrive. Aucun objet n'a été
déplacé ici — le seul du bucket est une photo de recette qui partira à la purge
des données de test.
