# Check-list de mise en production

Ce fichier n'existait pas avant le 26 septembre 2026. Il est créé pour porter
une étape qui ne doit pas se perdre — et qui se perdrait, parce qu'elle
n'appartient à aucun lot : elle se fait **entre** deux lots, juste avant la
première écriture réelle.

Une étape cochée porte sa date et le commit qui l'a faite.

---

## ☐ 1. Retirer les données comptables de test (2024 → 2027)

**Décision de Sabrina, 26 septembre 2026.** Tous les exercices de 2024 à 2027
ne contiennent que des essais. La première vraie facture sera `FAC-2027-0001`.

### Pourquoi on ne clôture surtout pas d'abord

Clôturer 2026 ferait passer son résultat — **−7 942.00**, entièrement de test —
dans le compte **2970**, c'est-à-dire dans les **fonds propres** de la vraie
comptabilité. Une clôture ne se défait pas : le jour où la première facture
réelle serait émise, la maison partirait avec 7 942 francs de perte imaginaire
au bilan, et plus aucun moyen de les en retirer proprement.

**Aucun exercice n'est donc clôturé d'ici là** — ni 2024, ni 2025, ni 2026.

Ce qui tient les bilans justes en attendant : le report « Résultat des exercices
antérieurs non clôturés », posé au lot 23-ter (`bb888d2`). Vérifié sur les
vraies données : écart actif/passif de **0.00** sur 2026 comme sur 2027. Sans
lui, 2027 affichait un écart de −7 942.

### Ce qu'il y a à retirer — inventaire du 26 septembre 2026

| Table | 2024 | 2025 | 2026 | 2027 |
|---|---|---|---|---|
| `ecritures` | — | — | 290 | 3 |
| `ecritures_lignes` | — | — | 632 | 6 |
| `factures` numérotées | — | — | 132 | 2 |
| `factures` brouillons | — | — | 6 | — |
| `paiements_resa` | — | — | 31 | — |
| `avoirs_mouvements` | — | — | 71 | — |
| `exercices` | 1 | 1 | 1 | aucun |

**2024 et 2025 ne portent qu'une ligne d'exercice, aucune écriture.** Le volume
réel est sur 2026, et trois écritures sur 2027.

### Le piège trouvé au passage : `FAC-2027-0001` est déjà pris

Deux pièces de test portent déjà des numéros 2027 :

- `FAC-2027-0001` — facture libre, 50.00, statut `annulee_par_avoir` ;
- `AV-2027-0001` — l'avoir qui l'annule, 80.00.

Et la table `facture_numerotation` porte `2027 / FAC → prochain = 2` ainsi que
`2027 / AV → prochain = 2`.

**Retirer les factures ne suffit donc pas** : sans remettre ces compteurs à 1,
la première facture réelle sortirait numérotée `FAC-2027-0002`, et le numéro
`0001` manquerait pour toujours dans la suite — ce qu'un contrôle fiscal
remarque avant tout le reste.

La migration doit donc aussi :

```sql
-- à écrire le jour venu, pas avant
delete from public.facture_numerotation where exercice between 2024 and 2027;
```

La fonction `prochain_numero_facture` recrée la ligne à 1 au premier appel
(`insert … on conflict do nothing`), donc supprimer suffit : rien à remettre à
la main.

### Le périmètre reste à arrêter, et c'est le vrai travail

Les factures ne vivent pas seules : elles tiennent à des réservations, des
ventes, des commandes, des abonnements, des cotisations, des fiches clientes et
des chiens. **Une purge qui ne retire que la comptabilité laisserait des
réservations « facturées » sans facture**, et des soldes d'avoir sans les
mouvements qui les expliquent.

À décider avant d'écrire la migration, et à écrire dans la migration :

- ce qui part (la comptabilité, sûrement) et ce qui reste (les fiches clientes
  et les chiens, probablement — ils servent aux essais) ;
- ce qu'on fait des réservations et des ventes de test qui portaient ces
  factures ;
- ce qu'on fait des PDF déjà déposés dans le bucket `factures` ;
- si les exercices 2024 et 2025, vides, partent aussi.

### Le contrôle, avant et après

À relever **avant** la migration, et à rappeler dans son commentaire :

```sql
-- 1. L'équilibre du grand-livre : doit être 0.00 avant comme après.
select round(sum(coalesce(debit,0) - coalesce(credit,0)), 2) as ecart
from public.ecritures_lignes;

-- 2. Ce qui reste, par année : doit être vide après, pour 2024 à 2027.
select extract(year from date_ecriture)::int as an, count(*)
from public.ecritures group by 1 order by 1;

-- 3. Les compteurs : plus aucune ligne de 2024 à 2027.
select * from public.facture_numerotation where exercice between 2024 and 2027;

-- 4. Aucune facture, aucun paiement, aucun mouvement d'avoir ne subsiste.
select 'factures' as t, count(*) from public.factures
union all select 'paiements_resa', count(*) from public.paiements_resa
union all select 'avoirs_mouvements', count(*) from public.avoirs_mouvements;
```

**Après**, le bilan de 2027 doit afficher un actif et un passif à **0.00**, et
la ligne « Résultat des exercices antérieurs non clôturés » doit disparaître
d'elle-même — elle est calculée, jamais stockée.

### Et la règle de la maison s'applique

La migration s'écrit **d'abord** dans un fichier de `supabase/migrations`, et
n'est appliquée **qu'ensuite** — voir AGENTS.md, « Le fichier avant
l'application ». Une purge est exactement le genre d'opération qu'on veut
pouvoir relire six mois plus tard.

**Une sauvegarde de la base se prend avant.** C'est le seul point de ce
document qui ne se rattrape pas.

---

## Le périmètre, arrêté le 26 septembre 2026

**Règle donnée par Sabrina : tout ce qui est dans l'application est du test,
SAUF ses propres chiens.**

### On garde

- ses chiens, avec leurs photos et documents ;
- sa fiche cliente de propriétaire, à laquelle ils sont rattachés ;
- les paramètres, le plan comptable, les tarifs, les modèles d'e-mails et les
  comptes du personnel.

### On retire

- toute la comptabilité : écritures, factures, brouillons, paiements, avoirs
  et leurs mouvements ;
- les compteurs de `facture_numerotation` ;
- les réservations, **y compris celles de ses chiens** ;
- les ventes, les abonnements et les adhésions ;
- tous les autres clients et chiens ;
- les PDF de factures dans le bucket (134 fichiers, 123 Mo) ;
- les exercices vides 2024 et 2025.

---

## ⚠️ À CONFIRMER AVANT D'ÉCRIRE LA MIGRATION : quelle fiche est la bonne ?

**Il existe DEUX fiches « Sabrina Jean », chacune avec un Hailey et un Pixel.**
Même numéro de téléphone. Se tromper de fiche détruirait les vraies données.

| | Fiche A | Fiche B |
|---|---|---|
| `client_id` | `7a820aa4-ff87-4261-bf66-072ec2f404c8` | `25d00648-555b-46b9-9638-b1ebf8cc6114` |
| E-mail | `jeansabrina89@gmail.com` | `ladogosphere@gmail.com` |
| Compte | rôle `client` | rôle **`admin`** |
| `interne` | non | **oui** |
| Créée le | **02.06.2026** | 15.09.2026 |
| Chiens | **4** | 2 |
| Réservations | 9 | 0 |
| Factures | 13 | 0 |
| Mouvements d'avoir | 27 | 0 |

**Les chiens de la fiche A** (`7a820aa4`) :

| `chien_id` | Nom | Race | Photo | Réservations |
|---|---|---|---|---|
| `90491963-a8cd-4369-a750-93b534d99c83` | Hailey | Bouledogue Américain | non | 3 |
| `7f6161ca-aaf1-4034-a73a-701e6170da8b` | Pixel | Dogue Allemand | **oui** | 7 |
| `71e4dbf9-0656-4a88-ae2a-490cd54801ce` | Poulpi | lab | non | 0 |
| `e0938416-9b0a-4266-b464-351f317e5eee` | Poulpi | lab | non | 0 |

*Les deux Poulpi ont été créés le même jour, même race : un doublon de saisie.*

**Les chiens de la fiche B** (`25d00648`) :

| `chien_id` | Nom | Race | Photo | Réservations |
|---|---|---|---|---|
| `e756238c-d218-42e3-81d9-8f2bd2e14364` | Hailey | Bouledogue Américain | non | 0 |
| `258cc292-174d-465d-963d-8d1629ff50bb` | Pixel | Dogue Allemand | non | 0 |

**L'unique photo de chien du stockage appartient au Pixel de la fiche A.** Les
chiens de la fiche B n'ont ni photo, ni vaccin, ni document. Garder la seule
fiche B reviendrait donc à perdre la photo.

**Tant que ce point n'est pas tranché, la migration ne s'écrit pas**, et aucun
identifiant n'est inscrit ici comme définitif.

---

## Ce que la purge doit respecter, techniquement

### Quatre clés étrangères BLOQUENT la suppression d'un client

Elles ne sont ni `CASCADE` ni `SET NULL` : la suppression échouera tant que ces
lignes existent. Il faut donc les retirer **avant** les clients.

| Table | Colonne | `ON DELETE` |
|---|---|---|
| `commandes` | `client_id` | **RESTRICT** |
| `commandes_personnalisees` | `client_id` | **RESTRICT** |
| `abonnements` | `client_id` | **NO ACTION** |
| `abonnements_mouvements` | `client_id` | **NO ACTION** |

### Ce qui part tout seul, en cascade

Supprimer un client emporte : ses `chiens` (donc, en chaîne, leurs `vaccins`,
`chaleurs`, `photos_chiens`, `ententes_chiens`, `checkin_checkout`,
`occupation_boxes`, `reservation_chiens`), ses `factures`, `reservations`,
`avoirs_mouvements`, `cotisations_membres`, `abonnements_prestations`,
`contacts_urgence`, `liste_attente`, `taches_prestations`.

Trois liens se contentent d'un `SET NULL` : `ventes.client_id`,
`alertes_stock.client_id`, `boxes.proprietaire_client_id`.

### Six colonnes SANS clé étrangère — les orphelins à nettoyer à la main

Postgres ne les protégera pas : après la purge, elles pointeront dans le vide.

| Table | Colonne | Ce qu'elle désigne |
|---|---|---|
| `paiements_resa` | `client_id` | un client |
| `emails_envoyes` | `reservation_id` | une réservation |
| `ecritures` | `piece_id` | une pièce comptable |
| `pieces` | `entite_id` | une dépense ou une facture |
| `ventes` | `ecriture_id` | une écriture |
| `journal_evenements` | `entite_id` | n'importe quelle entité |

### `journal_evenements` ne se vide pas

Deux triggers l'interdisent — `trg_journal_evenements_append_only` (BEFORE
DELETE OR UPDATE) et `trg_journal_evenements_sans_vidage` (BEFORE TRUNCATE).
La table porte 730 lignes, presque toutes des traces de test. La vider
demanderait de désactiver les triggers, donc de décider si l'immuabilité du
journal souffre une exception — voir la question 5 ci-dessous.

---

## Les tables que je ne sais pas classer — à trancher avant d'écrire

Ni « garde » ni « retire » ne s'appliquent d'évidence. Aucune n'est tranchée ici.

**1. Le catalogue de la boutique** — `articles` (97), `article_modeles`,
`options_groupes` (42), `options_valeurs` (280), `options_dependances`,
`modeles_options` (10), `promotions`, `promotions_articles`,
`remise_membre_categories`, `mouvements_stock` (127), et le bucket
`boutique-photos` (378 fichiers, 4,7 Mo).
*Question : le catalogue est-il du référentiel à garder — comme les tarifs —
en ne retirant que les mouvements (ventes, stock) ? Ou tout part ?*

**2. Les commandes** — `commandes` (12), `commandes_lignes`, `commandes_choix`,
`commandes_personnalisees` (3).
*Question : « les ventes » les comprend-il ? Ce sont les commandes de la
boutique en ligne, distinctes des ventes au comptoir.*

**3. Les dépenses et leurs pièces** — `depenses`, `pieces`, `fournisseurs`, et
le bucket `justificatifs` (9 fichiers).
*Question : « toute la compta » les comprend-elle ? Les fournisseurs
ressemblent à du référentiel (un carnet d'adresses), les dépenses à des
écritures.*

**4. Les ressources humaines** — `planning_employes` (885), `timbrage` (15),
`demandes_vacances` (3), `fiches_salaire`, `fiche_salaire_deductions` (6),
`modeles_deductions`, `indisponibilites`.
*Question : ce sont de vraies personnes, mais des données d'essai. Le lot 23 a
montré que 27 des 29 timbrages validés sont des vacances posées
automatiquement. Garder, ou repartir à zéro ?*

**5. Le journal des événements** — `journal_evenements` (730).
*Question : l'immuabilité souffre-t-elle une exception pour cette purge, une
fois, avec les triggers remis ensuite ? Ou le journal garde-t-il la mémoire
des essais ?*

**6. Les e-mails envoyés** — `emails_envoyes` (79), `emails_campagnes`.
*Question : historique d'envoi vers des adresses de test.*

**7. Les exercices** — `exercices`. 2024 et 2025 partent (vides). *Question :
et 2026, qui porte l'exercice ouvert des essais ?*

**8. Le référentiel d'exploitation** — `boxes` (14), `box_indisponibilites`,
`calendrier_essais`, `fermetures_essai`, `fermetures_exceptionnelles`,
`jours_feries`, `vacances_scolaires`, `formules`, `formules_lignes`,
`prestations`, `services_supplementaires`, `taux_prestation`.
*Question : ce sont les box réels et le calendrier réel, donc probablement à
garder — mais ce n'est pas dit, et je ne le suppose pas.*

**9. Les autres fiches internes** — six fiches `clients.interne = true` existent
en plus des deux « Sabrina Jean » : « Test employé », « Employé Inconnu 1 »,
« XEmployé Inconnu 2 », « Test Test », et deux fiches de recette.
*Question : elles partent avec « tous les autres clients », mais elles sont
rattachées à des comptes du personnel qui, eux, sont gardés. Confirmer que
retirer la fiche cliente d'une employée est voulu.*

**10. Les décomptes et exports** — `decomptes_tva`, `exports_comptables`,
`exports_comptables_lots`.
*Question : dérivés de la comptabilité, donc probablement avec elle.*
