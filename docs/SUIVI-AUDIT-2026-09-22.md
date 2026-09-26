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
| C-07a — `ajouterAvoir` sous `perm_encaissements` | **FERMÉ** — `perm_avoirs` créée : créditer, corriger ou retirer à la main demande ce droit ; payer AVEC un avoir reste un encaissement. Décision de Sabrina du 26.09.2026. **`creerAvoir` (note de crédit sur facture émise), y compris `destination: "credit"`, et `annulerAbonnementParAvoir` restent sous `perm_encaissements`, par décision de Sabrina du 26.09.2026 ; `perm_avoirs` couvre le crédit manuel non adossé à une facture** | 23-bis, 23-ter | `01f7461` | oui — 15 cas |
| C-07b — statut « annulée » sans la permission ni la logique | **FERMÉ** | 22 | `f7a4dac` | oui |
| C-07c — valider son propre timbrage / ses propres vacances | **FERMÉ** — l'administratrice peut valider ses propres heures et vacances, par décision de Sabrina du 24.09.2026 ; aucun autre employé ne le peut | 22-ter | `90a3799` | oui — 14 cas, 4 couches mutées |
| C-07d — garde unique `exiger()`, lecture de `profiles.actif` | FERMÉ | 18b | — | oui |
| C-09 — en-têtes de sécurité | **FERMÉ pour les cinq en-têtes** (HSTS, nosniff, DENY, Referrer-Policy, Permissions-Policy) — la **CSP reste OUVERTE**, report-only à éprouver | 23 | `6f13b28` | oui — 4 cas |
| C-10 — `/auth/confirm?next=` redirection ouverte | **FERMÉ** | 22 | `de2205b` | oui |
| C-11 — `.or()` PostgREST assemblé avec la saisie (caisse) | OUVERT — personnel seulement | 21 | — | non |
| C-13 — limitation de tentatives | OUVERT — Supabase Auth limite connexion, inscription, réinitialisation ; rien de notre côté | 21 | — | non |
| C-05 — l'inscription révèle qu'une adresse est connue | OUVERT — le refus du doublon, lui, fonctionne | 21 | — | non |
| C-01 à C-04, C-08, C-12 | Traités avant le lot 21 (18b à 18d) ; non réexaminés ici | 18b–18d | — | partiel |
| Prestations — le chien n'était pas rattaché au client (FORGEABLE du recensement 22-bis, hors numérotation d'audit) | **FERMÉ** | 22-ter | `c496fdf` | oui — 4 cas |
| Espace client — modifier un chien s'en remettait à RLS, que le personnel traverse | **FERMÉ** | 23-bis | `70b030f` | oui — 7 cas |
| `archiverClient` / `supprimerClient` sans garde, et journal mensonger | **FERMÉ** | 23-bis | `4549026` | oui — 9 cas, 2 couches mutées |
| `archiverChien` / `supprimerChien` — les mêmes, trouvés au balayage du 23-bis | **FERMÉ** | 23-ter | `61a3170` | oui — 9 cas, 2 couches mutées |
| Trace du valideur RH — qui a validé un timbrage, qui a traité des vacances | **FAIT** — colonnes `valide_par`/`valide_le` et `traite_par`/`traite_le` ; **les lignes antérieures au 26.09.2026 restent sans valideur connu**, et l'écran affiche « — » plutôt que de deviner | 23-bis | `19a1607` | oui — 9 cas, 3 couches mutées |

## La base

| Constat | État | Lot | Commit | Test |
|---|---|---|---|---|
| S-04 — `articles_vitrine` en SECURITY DEFINER, expose `stock_disponible` | **À MOITIÉ FERMÉ** — `stock_disponible` SORT de la vue : aucun code ne la lisait, et le stock chiffré d'un client connecté se calcule depuis la TABLE avec la clé de service. `anon` et `authenticated` n'ont plus que SELECT : les droits d'écriture hérités des droits par défaut du schéma public sont révoqués (ils n'ouvraient rien, une vue à colonnes calculées n'étant pas modifiable). **Le SECURITY DEFINER reste, volontairement** : `articles` est en RLS et sa seule politique de lecture vise le personnel — en SECURITY INVOKER, la vitrine publique du site serait vide. C'est donc la LISTE DES COLONNES qui tient lieu de garde, justifiée une par une en tête de la migration | 24-filtres | `app24_vitrine_etiquettes` | oui — 9 cas (`vitrinePublique`) |
| S-05 — bucket `chiens-photos` PUBLIC | **FERMÉ** — bucket privé, une seule porte (`urlSigneePhotoChien`) qui part d'un identifiant, vérifie le droit dans la session et signe pour 1 h. `photo_principale` range un CHEMIN (1 ligne convertie). Aucune politique posée : c'est le cœur de la mesure. **Réserve mesurée, sans conséquence durable : le cache du CDN a servi l'URL exacte déjà demandée pendant au plus 1 h après la fermeture** (`max-age=3600`) — voir `docs/SECURITE.md` | 24 | `f7221fa`, `6d1a6e8`, `d756d4a` | oui — 18 cas, 3 couches mutées |
| S-06 — exception `is_admin` / `is_personnel` documentée | FERMÉ — AGENTS.md, règle « Une fonction SQL naît fermée » | — | — | oui (`fonctionsSqlFermees`) |
| S-07 — grants résiduels sur six tables comptables | **FERMÉ** — plus aucun droit `anon` ni `authenticated` ; RLS active et zéro politique, voulu et écrit dans la migration | 23 | `301030a` | oui — 4 cas |
| S-08 — `trim_zero` sans `search_path` | **FERMÉ** — `search_path=public` ; l'advisor ne la signale plus | 23 | `301030a` | oui (même test) |
| S-01 à S-03 | Traités avant le lot 21 ; non réexaminés ici | 18b–18c | — | partiel |

## Ce qui reste, par danger réel (classement du lot 21, tenu à jour)

1. ~~`retirerPiece`~~ — fermé au lot 22.
2. ~~`annulerPaiement`~~ — fermé au lot 22.
3. ~~C-10~~ — fermé au lot 22.
3bis. ~~prestations / chien~~ — fermé au lot 22-ter (`c496fdf`).
4. ~~S-05, `chiens-photos` public~~ — fermé au lot 24 (`f7221fa`). Le nettoyage
   des métadonnées protégeait le contenu, jamais l'accès ; c'est l'accès qui est
   fermé. Ce qui reste à savoir, et qui est écrit dans `docs/SECURITE.md` :
   fermer un bucket ne purge pas le cache du CDN, qui a continué de servir
   l'URL exacte déjà demandée pendant au plus une heure.
5. ~~C-07b~~ — fermé au lot 22.
6. ~~C-09, les en-têtes simples~~ — fermé au lot 23 (`6f13b28`). **La CSP
   reste à faire**, et toujours pour la même raison : posée à l'aveugle, elle
   casse des écrans. Elle se pose en report-only, on lit ce qu'elle aurait
   cassé, puis on l'arme.
7. **C-05**, l'énumération à l'inscription.
8. ~~C-07c~~ — fermé au lot 22-ter. ~~C-07a~~ — classé SANS OBJET, accepté.
9. ~~S-07, S-08~~ — fermés au lot 23 (`301030a`).
10. ~~`archiverClient` / `supprimerClient`~~ — fermés au 23-bis (`4549026`).
11. ~~`archiverChien` et `supprimerChien`~~ — fermés au 23-ter (`61a3170`),
    par la correction d'`archiverClient` mot pour mot. La garde retenue est
    `exigerAdmin()` pour les deux : l'écran ne montrait déjà ces boutons qu'à
    l'administratrice, et la route dit désormais la même chose.
12. ~~`creerAvoir`~~ — **tranché le 26.09.2026** : la note de crédit reste sous
    `perm_encaissements`, y compris avec `destination: "credit"`, et
    `annulerAbonnementParAvoir` avec elle. Elle est adossée à une facture émise
    et à ses lignes, avec un motif obligatoire ; `perm_avoirs` couvre le crédit
    manuel, qui ne l'est pas. Ce n'est donc pas un contournement mais une autre
    porte, plus étroite, et documentée.
13. Le reste — C-11, C-13, S-04 — soit inerte, soit atteignable seulement par
    un compte déjà autorisé.

## Motif appartenance — recensement du 22-bis

Recensement complet : [RECENSEMENT-APPARTENANCE-2026-09.md](RECENSEMENT-APPARTENANCE-2026-09.md).

| Verdict | Lignes |
|---|---|
| SÛR | **19** |
| SANS OBJET | 11 |
| **FORGEABLE** | **0** |
| **CLIENT→CLIENT** | **0** |

**Aucun CLIENT→CLIENT.** La frontière client/personnel est tenue par la
session et par RLS, sans exception trouvée. Les trois FORGEABLE étaient internes
au personnel : un chien rattaché à la prestation d'un autre client
(`prestations/actions.ts:126-128`), et deux auto-validations — son propre
timbrage, ses propres vacances — qui étaient C-07c reclassé.

**Les trois ont été fermés au lot 22-ter**, chacun avec son test d'attaque :
`c496fdf` pour le chien, `90a3799` pour les deux auto-validations. Il ne reste
aucun FORGEABLE dans le recensement.

## Contrôles du lot 23 (lecture seule, aucune correction)

### A1 — qui a validé quoi : rien ne le dit

**Aucune colonne, aucune entrée de journal ne dit qui a validé une ligne de
timbrage ou approuvé une demande de vacances.** `timbrage` porte
`valide_admin` (un booléen) et `created_at` ; `demandes_vacances` porte
`statut`, `note_admin` et `created_at`. Ni l'une ni l'autre route n'appelle
`tracerEvenement`, et `journal_evenements` ne contient aucune entité
`timbrage` ni `vacances`.

Ce qu'on peut encore dire, faute de valideur enregistré :

| Employé | Lignes de timbrage validées | Première | Dernière | Origine |
|---|---|---|---|---|
| Adeline Helg | 14 | 2026-10-03 | 2026-10-31 | « Vacances (auto) » |
| Sabrina Jean | 13 | 2026-07-22 | 2026-08-09 | « Vacances (auto) » |
| Kévin Coppex | 2 | 2026-06-14 | 2026-06-15 | heures réelles |

**27 des 29 lignes validées n'ont été validées par personne** : ce sont des
timbrages de vacances posés automatiquement par la route des vacances, avec
`valide_admin: true`, lors de l'acceptation des deux demandes. Seules les deux
lignes de Kévin résultent d'un geste humain.

Demandes de vacances acceptées, les deux seules :

| Employé | Du | Au | Jours |
|---|---|---|---|
| Sabrina Jean | 2026-07-20 | 2026-08-09 | 13 |
| Adeline Helg | 2026-10-01 | 2026-10-31 | 14 |

Et les comptes :

| Employé | Compte | Rôle | `perm_timbrage_equipe` | `perm_vacances_equipe` |
|---|---|---|---|---|
| Adeline Helg | oui | employe | non | non |
| Eloise Burdet | oui | employe | non | non |
| Francine Fontaine | oui | employe | non | non |
| Kévin Coppex | oui | employe | non | non |
| Sabrina Jean | oui | **admin** | — (admin) | — (admin) |

**Personne d'autre que l'administratrice ne porte ces deux permissions.** La
porte refermée au lot 22-ter n'a donc jamais été franchie : elle était ouverte,
personne n'est passé.

**Recommandation, non écrite : deux colonnes, pas une entrée de journal.**
`valide_par uuid references profiles(id)` et `valide_le timestamptz` sur
`timbrage`, et les mêmes sur `demandes_vacances`. Le journal est fait pour
raconter un fil d'événements qu'on relit rarement ; ici la question — « qui a
validé cette ligne ? » — se pose EN FACE de la ligne, sur l'écran du timbrage,
et une colonne y répond sans jointure ni recherche. Une entrée de journal
obligerait chaque écran à aller la chercher, et un `valide_admin` repassé à
`false` puis à `true` laisserait deux entrées là où une colonne dit
simplement l'état actuel. Le journal reste utile **en plus**, pour l'historique
des changements ; il ne remplace pas la colonne.

### A2 — les 17 lignes classées SÛR avant le 22-ter, relues dans le code

**Le recensement annonçait 16 SÛR ; le tableau en portait 17.** Le décompte
disait aussi 11 SANS OBJET pour 10 lignes. Corrigé au lot 23 : 20 SÛR et 10
SANS OBJET pour 30 lignes.

**14 CONFORMES, 3 ÉCARTS.** Aucun écart n'ouvre une porte à un client ; les
trois sont des descriptions qui ne disent pas ce que fait le code. Le détail
ligne à ligne est dans [le recensement](RECENSEMENT-APPARTENANCE-2026-09.md).

Les trois écarts :

1. **`(client)/…/chiens/[id]/modifier/actions.ts:37`** — le recensement dit
   « qui : client ». La garde est `supabase.from("chiens").eq("id", chien_id)`
   avec le client de session, donc RLS. Or la politique
   `personnel_select_chiens` donne le SELECT sur **tous** les chiens à tout
   membre du personnel. Un employé qui appelle cette action de l'espace client
   passe donc la garde pour n'importe quel chien, et l'écriture qui suit se
   fait avec la clé de service. *Attaque : un employé sans
   `perm_chiens_modifier` modifie le nom, le poids ou les allergies de
   n'importe quel chien en appelant l'action de l'espace client.* Un client,
   lui, reste bien enfermé dans les siens.
2. **`prestations/actions.ts:281`** (`personnaliserSemaine`) — le recensement
   dit « oui — `abo.client_id` relu ». Il est relu, mais **jamais comparé à
   quoi que ce soit** : il ne sert qu'au `revalidatePath`. La justification
   décrit la ligne CLIENT voisine (`(client)/…/prestations/actions.ts:104`),
   qui, elle, filtre bien sur `.eq("client_id", fiche.id)`. Le verdict SÛR ne
   tient pas par la raison écrite : il tient parce que l'abonnement EST l'objet
   de l'action d'administration — c'est donc SANS OBJET.
3. **`(client)/…/reservations/actions.ts:388`** — le recensement dit
   « qui : client ». L'action refuse tout ce qui n'est pas une fiche interne
   (`if (!fiche?.interne)`) : c'est le **personnel** annulant sa propre
   réservation. L'appartenance est bien vérifiée
   (`resa.client_id !== client_id`), le verdict tient. Mais il en découle un
   fait que le recensement masquait : **aucune action ne permet à un client
   ordinaire d'annuler sa réservation.**

**Une lacune, hors tableau.** `archiverClient` et `supprimerClient`
(`clients/[id]/actions.ts:315,337`) lisent `formData.get("id")` et **n'appellent
aucune garde de permission**. Le recensement du 22-bis disait avoir examiné
« tout `formData.get("…id")`, soit 40 sites » : ces deux-là n'y figurent pas.
Elles écrivent avec le client de SESSION, donc RLS les arrête : seule
`admin_all_clients` permet UPDATE et DELETE sur `clients`. Un client ou un
employé n'efface donc rien — **mais l'UPDATE filtré ne renvoie pas d'erreur**,
et `archiverClient` trace ensuite un événement `archive` pour une archive qui
n'a pas eu lieu, puis redirige comme si de rien n'était. *Attaque : n'importe
quel compte connecté fabrique une entrée de journal mensongère et un écran qui
prétend avoir archivé.* Non corrigé, à décider au 23-bis.

### A3 — C-07a désigne bien `ajouterAvoir`

La ligne C-07a du tableau porte « `ajouterAvoir` sous `perm_encaissements` » :
**aucune ligne n'a été fermée à la place d'une autre**, et il n'y a rien à
remettre en état.

Une imprécision demeure, et elle est notée ici plutôt que corrigée en silence :
C-07a posait une question de **conception de permission** — « aucune permission
`avoirs` n'existe, faut-il en créer une ? » — et le lot 22-ter l'a fermée avec
une réponse à une **autre** question, celle de l'appartenance (« deux sources
pour désigner le client »). La réponse d'appartenance est juste, et le verdict
SANS OBJET la suit. La question de conception, elle, n'a jamais reçu de
réponse ; elle est reposée au classement ci-dessus.

## Contrôles du lot 23-bis

**Le balayage mécanique des identifiants venus du navigateur** a remplacé
l'affirmation du 22-bis (« 40 sites ») par un compte vérifiable : **127 sites**,
dont **121 portent une garde**. Le détail, les six sites sans garde et leur
classement sont dans
[le recensement](RECENSEMENT-APPARTENANCE-2026-09.md#balayage-mécanique--ajouté-au-23-bis).

**Ce qui restait ouvert après le 23-bis, et ce qu'il en est** :
`archiverChien` / `supprimerChien` — **fermés au 23-ter** (`61a3170`) ; la
question de `creerAvoir` — **tranchée le 26.09.2026**, elle reste sous
`perm_encaissements`.

**Ce qui a été trouvé faux dans un rapport intermédiaire, et vérifié à la
main** : `basculerFicheEnInterneServeur` était donnée comme vivant dans un
fichier `"use server"`, ce qui en aurait fait une action serveur invocable
depuis le navigateur. Aucun fichier de `src/lib` ne porte `"use server"` —
vérifié sur l'arbre entier. Les 16 fonctions de `src/lib` qui reçoivent un
identifiant du navigateur sont donc sûres par construction.

## Le motif de fond, relevé au lot 21

`verifierPermission` vérifie la permission, **jamais l'appartenance de
l'objet**. C-06a et C-06c en étaient deux manifestations, `ajouterAvoir` une
troisième. **Le recensement a été fait au lot 22-bis** : voir la section
ci-dessus et le tableau complet. **Les trois FORGEABLE qu'il avait trouvés ont
été fermés au lot 22-ter** ; il n'en reste aucun, et aucun CLIENT→CLIENT.

Le lot 22-ter a aussi montré la limite d'un recensement : il disait du timbrage
que la permission protégeait la validation, et le code disait autre chose — le
chemin « c'est moi » sautait la garde entière. **Relire la ligne dans le code
avant de la corriger** est ce qui l'a trouvé.

## Risque accepté, daté du 26.09.2026 : le stock partiel et le comptoir

**Décision de Sabrina, prise en connaissance de cause.**

Une ligne de commande passe **entière** sur commande, jamais coupée en deux : la
cliente qui en veut trois et dont il reste un attend ses trois ensemble, pour un
seul retrait. Et une ligne sur commande **ne réserve rien** — c'est ce qui
empêche `stock_actuel - stock_reserve` de descendre sous zéro.

**Le risque qui en découle** : l'unité déjà présente n'est protégée par rien.
Elle peut être vendue au comptoir avant l'arrivée de la marchandise commandée.

**Pourquoi c'est sans conséquence** : Sabrina commande au fournisseur la
quantité **TOTALE de la ligne**, pas seulement le manque. Les trois sacs
arrivent, la cliente est servie, et le sac vendu au comptoir entre-temps ne
manque à personne.

**Ce que cela impose à l'écran « À commander chez les fournisseurs »** : il
affiche la quantité TOTALE de la ligne, jamais l'écart entre le commandé et le
présent. Un écran qui afficherait « il en manque 2 » ferait commander 2 sacs, et
c'est alors que la vente au comptoir coûterait cher — la cliente qui attend
depuis trois semaines repartirait avec deux sacs sur trois. Le risque ci-dessus
n'est accepté QU'À CETTE CONDITION, et l'écran la porte.

**Ce qui a été corrigé pour de bon, au passage** : la caisse appelait
« disponible » le stock brut, sans retirer `stock_reserve`. Une commande en ligne
confirmée réservait donc un sac que le comptoir pouvait vendre au premier venu —
un défaut **antérieur à ce lot**, qui rendait creuse toute réservation. Fermé au
lot APP 26 (`stockDisponible`), sur trois couches, chacune testée sous mutation.
La conséquence assumée : la caisse refuse désormais de vendre ce qu'une commande
en ligne a réservé, et c'est exactement ce qu'on lui demande.
