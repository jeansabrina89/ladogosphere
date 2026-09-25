# Recensement du motif « appartenance » — 24 septembre 2026

`verifierPermission` répond à « cette personne a-t-elle le droit de faire ce
geste ? », jamais à « cet objet fait-il partie de ce qu'elle peut toucher ? ».
Le lot 21 a rencontré le motif deux fois sans le chercher (C-06a, C-06c), le
lot 22 une troisième (`ajouterAvoir`). Ce document le cherche.

**Lecture seule. Aucune correction n'a été faite en l'écrivant.**

**Relu au lot 23, le 26 septembre 2026.** Les 17 lignes classées SÛR avant le
lot 22-ter ont été rouvertes une à une dans le code — d'où vient chaque
identifiant, quelle garde s'applique, avant ou après l'écriture — et les
politiques RLS sur lesquelles quatre d'entre elles s'appuyaient ont été lues
en base. **14 CONFORMES, 3 ÉCARTS**, aucun n'ouvrant de porte à un client. Le
détail est dans [le suivi d'audit](SUIVI-AUDIT-2026-09-22.md), section
« Contrôles du lot 23 ».

**Une lacune du recensement** y est aussi consignée : `archiverClient` et
`supprimerClient` lisent `formData.get("id")` sans aucune garde de
permission, et ne figurent pas dans le tableau ci-dessous.

## Méthode, et ce qu'elle ne couvre pas

Le dépôt porte **57 fichiers d'actions serveur** et **55 routes**. Les
recenser ligne à ligne donnerait plusieurs centaines d'entrées dont l'immense
majorité ne lit aucun identifiant. Le recensement a donc procédé ainsi :

1. **Exhaustif** sur les surfaces atteignables par un CLIENT — `app/(client)`,
   `app/(public)`, et toute route ne portant pas de garde de personnel. C'est
   la seule catégorie où un tiers peut désigner l'objet d'un autre.
2. **Exhaustif** sur les routes : les 55 ont été passées au crible des noms de
   garde (`exigerPermissionApi`, `exigerAdminApi`, `exigerAdmin`, `garderRoute`,
   `exigerBoutiqueApi`, `exigerPersonnel`, `verifierCron`, `lireAppelant`,
   `auth.getUser`). **Deux** n'en portent aucune : elles sont analysées ci-dessous.
3. **Par motif** sur les actions d'administration : recherche de tout
   `formData.get("…id")` et de tout identifiant lu dans un corps JSON, soit
   **40 sites**, chacun examiné.

**Ce qui n'a pas été examiné ligne à ligne** : les actions d'administration qui
ne lisent aucun identifiant de formulaire (création pure, réglages, listes).
Elles ne peuvent pas porter le motif, par construction — il faut un identifiant
reçu pour qu'il y ait quelque chose à confondre.

## CLIENT→CLIENT : aucun

**C'est le résultat principal de ce recensement.** Aucune action ni route ne
permet à un client connecté de désigner l'objet d'un autre client. Trois
mécanismes s'en chargent, et ils se recouvrent :

- les actions de l'espace client lisent **toujours** la fiche depuis la session
  (`.eq("auth_user_id", user.id)`) et n'acceptent jamais un `client_id` de
  formulaire — vérifié sur les cinq fichiers de `app/(client)` ;
- `payer-avoir` compare explicitement `reservation.client_id !== fiche.id`
  ([route.ts:35](../app/api/reservations/%5Bid%5D/payer-avoir/route.ts#L35)) ;
- les lectures passent par le client de session, donc par RLS :
  `client_select_chiens`, `client_select_reservations`,
  `client_select_avoirs_mouvements` et `commandes_client_lecture` restreignent
  toutes au propriétaire.

## Le tableau

| fichier:ligne | action | qui | identifiant(s) | usage | appartenance | verdict |
|---|---|---|---|---|---|---|
| `(client)/…/chiens/[id]/modifier/actions.ts:37` | modifier un chien | client propriétaire **seulement** | `chien_id` (segment) | écriture | oui depuis le 23-bis — `chien.client_id` comparé à la fiche de session, sans passer par RLS | SÛR (`70b030f`) |
| `(client)/…/profil/actions.ts:18` | modifier son profil | client | aucun | écriture | oui — fiche de session ; le paramètre `_id` reçu est ignoré | CONFORME (relu dans le code le 26.09.2026) |
| `(client)/…/reservations/actions.ts:77` | créer une demande | client | aucun | écriture | oui — `fiche.id` de session ; chiens filtrés par `.eq("client_id", fiche.id)` en session | CONFORME (relu dans le code le 26.09.2026) |
| `(client)/…/reservations/actions.ts:388` | annuler sa réservation | **personnel (fiche interne)** | `reservationId` | écriture | oui — `resa.client_id !== client_id` | SÛR (corrigé au 23-bis) |
| `(client)/…/prestations/actions.ts:104-106` | ajuster sa semaine | client | `abonnement_id` | écriture | oui — `.eq("client_id", fiche.id)` à la lecture, refus si absent | CONFORME (relu dans le code le 26.09.2026) |
| `(client)/…/prestations/actions.ts:52` | commander une prestation | client | `prestation_id` | écriture | sans objet — article de catalogue | SANS OBJET |
| `(client)/mon-compte/actions.ts:13,80` | adhésion, abonnement | client | aucun | écriture, argent | oui — seul `mode`/`categorie` vient de l'appelant | CONFORME (relu dans le code le 26.09.2026) |
| `api/reservations/[id]/payer-avoir/route.ts:35` | payer par avoir | client | `[id]` | argent | oui — `reservation.client_id !== fiche.id` avant la RPC | CONFORME (relu dans le code le 26.09.2026) |
| `api/reservations/client/route.ts:29` | créer une réservation | client | formulaire | écriture | oui — `fiche.id` de session ; chiens vérifiés par cardinalité | CONFORME (relu dans le code le 26.09.2026) |
| `api/reservations/[id]/details/route.ts:14` | lire une réservation | client, personnel | `[id]` | lecture | oui — tout passe par la session ; `client_select_reservations` et `personnel_select_boxes` vérifiées en base | CONFORME (relu dans le code le 26.09.2026) |
| `api/factures/[id]/pdf/route.ts:29` | ouvrir un PDF | client, personnel | `[id]` | lecture | oui — `auth_user_id` comparé, et le compte désactivé refusé | CONFORME (relu dans le code le 26.09.2026) |
| `api/pieces/[id]/route.ts`, `…/origine` | ouvrir un justificatif | personnel | `[id]` | lecture | sans objet — permission comptable | SANS OBJET |
| `api/chiens/[id]/photo/route.ts:24` | déposer une photo | client, personnel | `[id]` | écriture | oui — lecture RLS ; le personnel voit tous les chiens, ce que la colonne « qui » assume | CONFORME (relu dans le code le 26.09.2026) |
| `api/chiens/[id]/isolement/route.ts:13` | marquer l'isolement | personnel | `[id]` | écriture | sans objet — le chien EST l'objet | SANS OBJET |
| `api/logout/route.ts` | déconnexion | tous | aucun | — | sans objet | SANS OBJET |
| `comptabilite/depenses/actions.ts:210` | retirer un justificatif | employé `perm_depenses` | `piece_id` + `id` | **suppression** | oui — `piece.entite_id !== depenseId`, puis la dépense propriétaire relue | CONFORME (relu dans le code le 26.09.2026) |
| `comptabilite/depenses/actions.ts:178` | supprimer un brouillon | employé `perm_depenses` | `id` | suppression | oui — pièces listées par `.eq("entite_id", id)`, refus si la dépense est validée | CONFORME (relu dans le code le 26.09.2026) |
| `factures/actions.ts:231` | annuler un paiement | employé `perm_encaissements` | `paiement_id` | **argent** | oui — client, facture et réservation dérivés de la ligne lue ; `annule_de` sous index unique | CONFORME (relu dans le code le 26.09.2026) |
| `reservations/[id]/modifier/actions.ts:150` | annuler une réservation | employé `perm_reservations_annuler` | `id` | **argent** | oui — `client_id` vient de `resa.client_id`, jamais du formulaire | CONFORME (relu dans le code le 26.09.2026) |
| `clients/[id]/actions.ts:130,192` | modifier / supprimer un mouvement d'avoir | employé `perm_encaissements` | `mouvement_id` + `client_id` | **argent** | oui — `ligne.client_id !== client_id`, avant toute écriture | CONFORME (relu dans le code le 26.09.2026) |
| `clients/[id]/actions.ts:32` | **ajouterAvoir** | employé `perm_encaissements` | `client_id` (formulaire) | **argent** | non — mais voir ci-dessous | SANS OBJET |
| `clients/[id]/actions.ts:71` | **retirerAvoir** | employé `perm_encaissements` | `client_id` (formulaire) | **argent** | non — idem | SANS OBJET |
| `prestations/actions.ts:126-128` | créer une prestation | employé `perm_prestations` | `client_id` + `chien_id` | écriture | oui depuis le lot 22-ter — `chien.client_id` relu | SÛR |
| `prestations/actions.ts:281` | ajuster un abonnement | employé `perm_prestations` | `abonnement_id` | écriture | sans objet — l'abonnement EST l'objet de l'action ; `abo.client_id` n'est lu que pour le `revalidatePath` | SANS OBJET (corrigé au 23-bis) |
| `checkin/actions.ts:11,33` | check-in / check-out | employé `perm_checkin` | `checkin_id` | écriture | sans objet — la ligne EST l'objet | SANS OBJET |
| `boutique/attentes/actions.ts:22` | traiter une alerte | employé `perm_boutique_*` | `alerte_id` | écriture | sans objet | SANS OBJET |
| `api/rh/timbrage/route.ts:32-37` | saisir un timbrage | employé | `employe_id` | écriture | oui — son propre identifiant, ou la permission | SANS OBJET |
| `api/rh/timbrage/route.ts:117` | **valider un timbrage** | employé `perm_timbrage_equipe` | `employe_id` | écriture | oui depuis le lot 22-ter — le sien est refusé | SÛR |
| `api/rh/vacances/route.ts:43` | **approuver des vacances** | employé `perm_vacances_equipe` | `id` (corps) | écriture | oui depuis le lot 22-ter — la sienne est refusée | SÛR |
| 12 autres sites d'administration (fournisseurs, boxes, formules, modèles, employés, réglages) | divers | employé + permission | `id` | écriture | sans objet — l'identifiant désigne l'objet même de l'écran | SANS OBJET |

## Totaux

| Verdict | Lignes |
|---|---|
| SÛR / CONFORME | **18** |
| SANS OBJET | 11 |
| **ÉCART** restant | **1** |
| **FORGEABLE** | **0** |
| **CLIENT→CLIENT** | **0** |
| **Total** | **30** |

**Le décompte d'origine était faux** : il annonçait 16 SÛR et 11 SANS OBJET,
quand le tableau en portait 17 et 10. Corrigé au lot 23, en même temps que la
relecture.

Les trois FORGEABLE ont été fermés au **lot 22-ter**, chacun avec son test
d'attaque : `c496fdf` (le chien de la prestation) et `90a3799` (les deux
auto-validations). Le tableau ci-dessous garde le constat d'origine, daté, et
dit pour chacun ce qui l'a refermé.

## Les trois FORGEABLE — tous fermés au lot 22-ter

**1. `prestations/actions.ts:126-128` — un chien qui n'est pas celui du client.**
La prestation est créée avec `client_id` et `chien_id`, tous deux du
formulaire ; le client est relu (locataire de box ?), le chien ne l'est pas.
Une prestation peut donc porter le chien d'un autre client. Conséquence :
incohérence au planning, pas d'argent déplacé.
*Correction : relire le chien et vérifier `chien.client_id === clientId` — deux
lignes.*
**FERMÉ au lot 22-ter, commit `c496fdf`**, test `tests/attaquePrestationChien.test.ts`
(4 cas) : le chien d'un autre client est refusé, rien n'est écrit.

**2. `api/rh/timbrage/route.ts:78,117` — valider son propre timbrage.**
La permission `perm_timbrage_equipe` ouvre la validation de toute l'équipe,
et rien ne distingue « la mienne » des autres. Un employé qui la porte valide
ses propres heures.
*Correction : refuser quand `employe_id` est celui de l'appelant, sauf pour
l'administratrice — quelques lignes.*
**FERMÉ au lot 22-ter, commit `90a3799`.** Le recensement disait moins que la
réalité : sur le PATCH, le chemin « c'est moi » sautait la garde de permission
**entièrement**, donc un employé **sans** `perm_timbrage_equipe` validait déjà
son propre mois. Les deux couches sont désormais posées, et chacune a son test
qui rougit seule.

**3. `api/rh/vacances/route.ts:43` — approuver ses propres vacances.**
Même motif, même permission, même absence d'exclusion.
*Correction : lire le demandeur et refuser l'auto-approbation — quelques
lignes.*
**FERMÉ au lot 22-ter, commit `90a3799`.** La demande était lue **après** avoir
été modifiée : on ne savait de qui elle était qu'une fois le statut déjà changé.
La lecture passe avant l'écriture.

Les deux derniers sont C-07c du suivi d'audit, reclassés ici.

## `ajouterAvoir` : la question posée au lot 22-bis

**Les deux identifiants peuvent-ils différer ? Oui. Lequel gagne ? Le
formulaire.** L'écran est `clients/[id]`, mais l'action ne lit jamais l'URL :
elle crédite le `client_id` du formulaire. Un champ forgé sur la fiche du
client X crédite donc le client Y.

Le verdict reste **SANS OBJET** : cette action a pour objet de créditer le
client désigné, et une employée portant `perm_encaissements` peut de toute
façon créditer n'importe qui depuis n'importe quelle fiche. Rien n'est
contourné, et la trace au journal porte le client réellement crédité. Ce n'est
donc pas une faille, mais **une incohérence d'interface** : deux sources pour
une même désignation. La corriger — lire l'identifiant de l'URL, ignorer le
formulaire — coûte deux lignes et supprime une question que le prochain
lecteur se posera.

## L'annulation d'une réservation par le client : il n'y en a pas

**Décision de Sabrina du 26 septembre 2026 : aucune annulation par le client.**
Le client contacte la pension ; le personnel annule et applique les conditions.

Ce n'est donc pas un manque, c'est un choix. La seule action d'annulation de
l'espace client (`reservations/actions.ts:388`) refuse tout ce qui n'est pas
une fiche `interne`, et l'écran n'affiche son bouton que dans ce cas
(`page.tsx:220`, sous `estInterne`). **Vérifié au 23-bis : rien dans l'espace
client ne laisse croire qu'une annulation en ligne serait possible.** Le
« ✖ Annuler » de `BoutonPaiementClient` ferme le panneau de paiement, il
n'annule aucune réservation.

Des trois écarts du lot 23, il en reste **un** : l'action de modification d'un
chien, corrigée dans le code au 23-bis (`70b030f`) — la ligne du tableau
ci-dessus garde la mention ÉCART parce qu'elle décrit ce que le recensement
disait, et la colonne « appartenance » dit maintenant ce que fait le code.

## Balayage mécanique — ajouté au 23-bis

Le recensement du 22-bis affirmait couvrir « tout `formData.get("…id")`, soit
40 sites ». `archiverClient` et `supprimerClient` lisaient pourtant
`formData.get("id")` et n'y figuraient pas. La liste a donc été refaite
**mécaniquement**, sur quatre motifs : `formData.get`/`getAll` dont la clé
porte un identifiant, les segments d'URL (`params`), `searchParams`, et le
corps JSON des routes.

**127 sites** : 59 actions serveur, 52 routes API, 16 fonctions de `src/lib`
appelées avec un identifiant reçu du navigateur. Les 30 lignes du tableau
ci-dessus en couvraient une quarantaine — le balayage triple la surface
examinée, sans rien trouver de nouveau qui touche un client.

**121 sites portent une garde** : `verifierPermission`, `exiger`,
`exigerPersonnel`, `exigerPermissionApi`, `exigerAdminApi`,
`exigerBoutiqueApi`, `exigerAdminPage`, `garderRoute`, ou une garde locale
(`garde()`, `gardeFacturation()`, `ficheDuLocataire()`). Restent six sites
sans garde, détaillés ci-dessous.

### Les six sites sans garde

| fichier:ligne | qui peut appeler | garde | verdict |
|---|---|---|---|
| `(espace-clients)/chiens/[id]/actions.ts:8` — `archiverChien` | tout compte connecté | **aucune** | **FORGEABLE** (ajouté au 23-bis) |
| `(espace-clients)/chiens/[id]/actions.ts:30` — `supprimerChien` | tout compte connecté | **aucune** | **FORGEABLE** (ajouté au 23-bis) |
| `clients/[id]/actions.ts:315` — `archiverClient` | — | `exigerAdmin()` **depuis le 23-bis** | SÛR (`4549026`) |
| `clients/[id]/actions.ts:337` — `supprimerClient` | — | `exigerAdmin()` **depuis le 23-bis** | SÛR (`4549026`) |
| `api/reservations/[id]/details/route.ts:10` — `GET` | client, personnel | aucune garde de rôle, mais **tout passe par la session** | SÛR — relu au lot 23, RLS vérifiée en base |
| 16 fonctions de `src/lib` (checkin, pièces, PDF, compta, cohabitation, fiche interne) | — | aucune garde interne | **SÛR par construction** — voir ci-dessous |

**Les deux FORGEABLE sont les jumeaux exacts de ceux que le 23-bis vient de
refermer.** Même forme, même défaut : aucune garde, écriture par le client de
session, et un `tracerEvenement` qui suit sans vérifier que quelque chose a
bougé. RLS les arrête (`admin_all_chiens` seule permet UPDATE et DELETE sur
`chiens`), mais un UPDATE filtré ne renvoie pas d'erreur : `archiverChien`
écrit donc au journal une archive qui n'a pas eu lieu, et redirige comme si
c'était fait. **Non corrigés : un lot séparé, comme demandé.** La correction est
celle de `archiverClient` mot pour mot.

**Les 16 fonctions de `src/lib` sont sûres par construction, et il a fallu le
vérifier plutôt que le croire.** Le relevé les donnait « sans garde », ce qui
est vrai, et l'une d'elles — `basculerFicheEnInterneServeur` — était même
présentée comme vivant dans un fichier `"use server"`, ce qui aurait fait
d'elle une action serveur invocable directement depuis le navigateur. C'est
faux : **aucun fichier de `src/lib` ne porte `"use server"`**, vérifié sur
l'arbre entier. Ces fonctions ne sont donc atteignables que par le code serveur
qui les appelle, et chacun de ces appelants porte sa garde. `ficheInterne.ts`
le dit lui-même en tête de fichier.

### Une garde non standard, signalée sans réserve

`reservations/[id]/actions.ts:291` (`basculerOffreReservation`) ne passe par
aucun des helpers : elle lit `getProfilePerms()` puis refuse si
`!perms.isAdmin`. Le résultat est le bon — `getProfilePerms` lit la session et
`profiles`, et renvoie `false` partout pour un profil désactivé ou un client.
Mais c'est la seule garde du dépôt écrite à la main, donc la seule qui ne
profitera pas d'un durcissement de `deciderGarde`. À aligner un jour, sans
urgence.

## Ce que ce recensement apprend

Le motif existe, mais **il ne touche jamais les clients** : la frontière
client/personnel est tenue, par la session et par RLS, sans exception trouvée.
Les trois cas restants sont tous à l'intérieur du personnel, et deux sur trois
ne sont pas des forgeries mais des **absences d'auto-exclusion** — valider ce
qu'on a soi-même saisi. C'est un sujet de contrôle interne plus que de
sécurité : à une personne, il ne se voit pas ; à cinq, il compte.
