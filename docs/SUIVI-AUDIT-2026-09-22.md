# Suivi de l'audit du 22 septembre 2026

Ce fichier existe parce que la numérotation des lots a dérivé : l'audit
prévoyait six lots, 18b à 18g, et les lots 18e à 18g réellement faits ont
traité d'autres sujets trouvés en chemin. Le contenu assigné n'a été reporté
nulle part, et personne ne s'en est aperçu avant le lot 21.

**Une ligne par constat. Un lot de sécurité l'ouvre au début et le met à jour
à la fin.** Un constat fermé sans test est marqué comme tel : une correction
sans test se reperd au remaniement suivant, exactement comme cette
numérotation s'est perdue.

État établi par le **lot 21** (relecture du code et de la base, aucune
correction), puis mis à jour par le **lot 22** (cinq portes).

## Le code

| Constat | État | Lot | Commit | Test |
|---|---|---|---|---|
| C-06a — `annulerReservation` prend le client du formulaire | **FERMÉ** | 22 | `43cf2ab` | oui |
| C-06b — `annulerPaiement` rejouable | **FERMÉ** | 22 | `22daebf` | oui |
| C-06c — `retirerPiece` sans vérifier l'appartenance | **FERMÉ** | 22, 22-bis | `949a933`, `c810c5d` | oui — DEUX : dépense validée, et deux brouillons (le cas où seule l'appartenance protège) |
| C-07a — `ajouterAvoir` sous `perm_encaissements` | PARTIEL — aucune permission « avoirs » n'existe ; question de conception | 21 | — | non |
| C-07b — statut « annulée » sans la permission ni la logique | **FERMÉ** | 22 | `f7a4dac` | oui |
| C-07c — valider son propre timbrage / ses propres vacances | OUVERT — reclassé FORGEABLE au recensement du 22-bis | 21 | — | non |
| C-07d — garde unique `exiger()`, lecture de `profiles.actif` | FERMÉ | 18b | — | oui |
| C-09 — en-têtes de sécurité, CSP | OUVERT — seul HSTS est servi (par Vercel) | 21 | — | non |
| C-10 — `/auth/confirm?next=` redirection ouverte | **FERMÉ** | 22 | `de2205b` | oui |
| C-11 — `.or()` PostgREST assemblé avec la saisie (caisse) | OUVERT — personnel seulement | 21 | — | non |
| C-13 — limitation de tentatives | OUVERT — Supabase Auth limite connexion, inscription, réinitialisation ; rien de notre côté | 21 | — | non |
| C-05 — l'inscription révèle qu'une adresse est connue | OUVERT — le refus du doublon, lui, fonctionne | 21 | — | non |
| C-01 à C-04, C-08, C-12 | Traités avant le lot 21 (18b à 18d) ; non réexaminés ici | 18b–18d | — | partiel |

## La base

| Constat | État | Lot | Commit | Test |
|---|---|---|---|---|
| S-04 — `articles_vitrine` en SECURITY DEFINER, expose `stock_disponible` | OUVERT, deux fois | 21 | — | non |
| S-05 — bucket `chiens-photos` PUBLIC | OUVERT — servi par `getPublicUrl`, jamais signé | 21 | — | non |
| S-06 — exception `is_admin` / `is_personnel` documentée | FERMÉ — AGENTS.md, règle « Une fonction SQL naît fermée » | — | — | oui (`fonctionsSqlFermees`) |
| S-07 — grants résiduels sur six tables comptables | OUVERT mais INERTE — RLS active, zéro politique | 21 | — | non |
| S-08 — `trim_zero` sans `search_path` | OUVERT mais INERTE — la fonction est SECURITY INVOKER | 21 | — | non |
| S-01 à S-03 | Traités avant le lot 21 ; non réexaminés ici | 18b–18c | — | partiel |

## Ce qui reste, par danger réel (classement du lot 21, tenu à jour)

1. ~~`retirerPiece`~~ — fermé au lot 22.
2. ~~`annulerPaiement`~~ — fermé au lot 22.
3. ~~C-10~~ — fermé au lot 22.
4. **S-05, `chiens-photos` public.** Trois lots ont retiré les coordonnées GPS
   des photos ; le bucket reste ouvert à qui devine un chemin. Le nettoyage
   protège le contenu, pas l'accès.
5. ~~C-07b~~ — fermé au lot 22.
6. **C-09**, les quatre en-têtes simples (une heure). La CSP demande d'être
   éprouvée avant : posée à l'aveugle, elle casse des écrans en production.
7. **C-05**, l'énumération à l'inscription.
8. Le reste — C-07a, C-07c, C-11, C-13, S-04, S-07, S-08 — soit inerte, soit
   atteignable seulement par un compte déjà autorisé.

## Motif appartenance — recensement du 22-bis

Recensement complet : [RECENSEMENT-APPARTENANCE-2026-09.md](RECENSEMENT-APPARTENANCE-2026-09.md).

| Verdict | Lignes |
|---|---|
| SÛR | 16 |
| SANS OBJET | 11 |
| **FORGEABLE** | **3** |
| **CLIENT→CLIENT** | **0** |

**Aucun CLIENT→CLIENT.** La frontière client/personnel est tenue par la
session et par RLS, sans exception trouvée. Les trois FORGEABLE sont internes
au personnel : un chien rattaché à la prestation d'un autre client
(`prestations/actions.ts:126-128`), et deux auto-validations — son propre
timbrage, ses propres vacances — qui sont C-07c reclassé.

## Le motif de fond, relevé au lot 21

`verifierPermission` vérifie la permission, **jamais l'appartenance de
l'objet**. C-06a et C-06c en étaient deux manifestations, `ajouterAvoir` une
troisième. **Le recensement a été fait au lot 22-bis** : voir la section
ci-dessus et le tableau complet. Il reste trois cas FORGEABLE, tous internes
au personnel, et aucun CLIENT→CLIENT.
