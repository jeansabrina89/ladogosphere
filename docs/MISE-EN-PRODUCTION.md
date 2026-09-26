# Check-list de mise en production

Ce fichier n'existait pas avant le 26 septembre 2026. Il est créé pour porter
des étapes qui ne doivent pas se perdre — et qui se perdraient, parce qu'elles
n'appartiennent à aucun lot : elles se font **entre** deux lots, juste avant la
première écriture réelle.

Une étape cochée porte sa date et le commit qui l'a faite.

**Tous les nombres de ce document sont des comptes réels**, relevés le
26 septembre 2026 par `count(*)`. Une première version citait `reltuples`, une
estimation que Postgres ne rafraîchit pas : elle annonçait 97 articles là où il
y en a 121. Un contrôle qui attend le mauvais nombre est pire qu'absent.

---

# ☐ 1. Retirer les données de test

**Décidé par Sabrina le 26 septembre 2026.** Tout ce qui est dans l'application
est du test. La première vraie facture sera `FAC-2027-0001`.

## Pourquoi on ne clôture surtout pas d'abord

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

---

## Le périmètre — complet et définitif

### ON GARDE, et rien d'autre côté clientèle

**La fiche B, et elle seule :**

| | |
|---|---|
| `client_id` | **`25d00648-555b-46b9-9638-b1ebf8cc6114`** |
| E-mail | `ladogosphere@gmail.com` |
| Compte | rôle `admin`, `interne = true` |

**Ses deux chiens :**

| `chien_id` | Nom | Race |
|---|---|---|
| **`e756238c-d218-42e3-81d9-8f2bd2e14364`** | Hailey | Bouledogue Américain |
| **`258cc292-174d-465d-963d-8d1629ff50bb`** | Pixel | Dogue Allemand |

**Et leurs deux ententes « famille uniquement »**, auto-référencées
(Pixel→Pixel, Hailey→Hailey) : elles partent avec eux sans rien accrocher
d'autre.

**Les quatre fiches internes du personnel**, avec leurs comptes de connexion :
« Test employé », « Employé Inconnu 1 », « XEmployé Inconnu 2 », « Test Test ».
Chacune porte un compte de rôle `employe`.

**Le référentiel, dans son entier :**

- les paramètres, le plan comptable (`comptes`, 43 lignes), les tarifs (40), les
  modèles d'e-mails, les comptes du personnel (`profiles` 44, `employes_rh` 5) ;
- **`modeles_deductions` (6)** — c'est du paramétrage, comme le plan comptable :
  la liste des types de déductions salariales, pas une donnée de paie ;
- le catalogue de la boutique : `articles` (121), `article_modeles`,
  `options_groupes` (40), `options_valeurs` (273), `options_dependances`,
  `modeles_options` (10), `promotions`, `promotions_articles`,
  `remise_membre_categories`, et le bucket `boutique-photos` (378 fichiers) ;
- les fournisseurs (`fournisseurs`, 4) ;
- le référentiel d'exploitation : `boxes` (14), `box_indisponibilites`,
  `calendrier_essais`, `fermetures_essai`, `fermetures_exceptionnelles`,
  `jours_feries`, `vacances_scolaires`, `formules` (1), `formules_lignes`,
  `prestations` (3), `services_supplementaires`, `taux_prestation`, `taux_tva`,
  `parametres_tva`, `entites_juridiques`.

### ON RETIRE

**La fiche A en entier** — décision explicite, et elle emporte beaucoup :

| | |
|---|---|
| `client_id` | **`7a820aa4-ff87-4261-bf66-072ec2f404c8`** |
| E-mail | `jeansabrina89@gmail.com` |
| Compte | rôle `client` — **le compte de connexion part aussi** |

Ses **quatre** chiens, les deux Poulpi compris :

| `chien_id` | Nom |
|---|---|
| `90491963-a8cd-4369-a750-93b534d99c83` | Hailey |
| `7f6161ca-aaf1-4034-a73a-701e6170da8b` | Pixel — **et sa photo** |
| `71e4dbf9-0656-4a88-ae2a-490cd54801ce` | Poulpi |
| `e0938416-9b0a-4266-b464-351f317e5eee` | Poulpi (doublon) |

Avec eux : ses 9 réservations, ses 13 factures, ses 27 mouvements d'avoir, et
**l'unique photo du bucket `chiens-photos`**.

**Aucun transfert de photo n'est prévu** : Sabrina en remettra une elle-même sur
le Pixel de la fiche B. Le bucket `chiens-photos` finira donc vide, et c'est
voulu.

**Les deux fiches « ZZ Contrôle »** — ce sont des fiches de test, pas du
personnel : « Recette ZZ Contrôle recette boutique (archive) » et « ZZ Contrôle
TVA (recette) ». Ni l'une ni l'autre n'a de compte de connexion, et la seconde
est déjà inactive.

**Tous les autres clients et chiens** : 38 fiches aujourd'hui, **5 après** ;
22 chiens aujourd'hui, **2 après**.

**Toute la comptabilité** : `ecritures` (293), `ecritures_lignes`, `factures`
(140, numérotées et brouillons), `facture_lignes`, `facture_reservations`,
`paiements_resa`, `avoirs_mouvements`, `depenses` (12), `pieces`,
`decomptes_tva`, `exports_comptables`, `exports_comptables_lots`.

**Les compteurs** `facture_numerotation`.

**Les exercices 2024, 2025, 2026 et 2027** — 2026 part aussi, en plus des deux
vides.

**Les réservations**, y compris celles des chiens gardés : `reservations`,
`reservation_chiens`, `reservation_extras`, `occupation_boxes`,
`checkin_checkout`.

**Les ventes, les commandes en ligne, les abonnements et les adhésions** :
`ventes` (75), `ventes_lignes`, `commandes` (15), `commandes_lignes`,
`commandes_choix`, `commandes_personnalisees`, `abonnements`,
`abonnements_mouvements`, `abonnements_prestations`, `cotisations_membres`,
`taches_prestations`, `alertes_stock`, `liste_attente`.

**Les mouvements de stock** : `mouvements_stock` (180). **Et `articles.stock_actuel`
est remis à 0** pour les 121 articles — Sabrina saisira son inventaire
d'ouverture le jour du lancement.

> `stock_reserve` suit, et sans que ce soit une décision de plus : deux articles
> en portent aujourd'hui, réservés par des commandes qui partent. Le laisser non
> nul afficherait une réserve que rien ne justifie plus.

**Tout le RH sauf les personnes et le paramétrage** : `planning_employes` (885),
`timbrage`, `demandes_vacances`, `fiches_salaire`, `fiche_salaire_deductions`,
`indisponibilites`. `employes_rh`, `profiles` et `modeles_deductions` restent.

**Les e-mails envoyés** : `emails_envoyes`, `emails_campagnes`.

**Les PDF du bucket `factures`** (134 fichiers, 123 Mo), le bucket
`justificatifs` (9 fichiers, avec les dépenses), et le bucket `chiens-photos`
(1 fichier).

---

## Le journal des événements : vidé, une fois, puis refermé

**La question posée était : y a-t-il une raison de le garder ? Non, et voici le
chiffre qui tranche.**

Le journal porte **756 lignes**, du 7 au 25 septembre 2026. **Deux** concernent
ce qu'on garde (la fiche B et ses chiens). Tout le reste raconte l'histoire
d'objets qui n'existeront plus : le vider ne perd rien, et le garder laisserait
754 entrées dont les `entite_id` ne désignent plus rien, dans une table faite
pour être relue en cas de doute.

**Deux précisions sur la manière :**

1. **La levée est bornée par construction, pas seulement par discipline.** En
   Postgres, le DDL est transactionnel : si la purge échoue à mi-chemin, le
   `DISABLE TRIGGER` est annulé avec tout le reste. Il n'existe pas d'état où la
   migration se serait interrompue en laissant le garde-fou baissé.

2. **L'ordre compte, et il n'est pas celui qu'on écrirait spontanément.** Les
   deux triggers sont `BEFORE DELETE OR UPDATE` et `BEFORE TRUNCATE` : ils
   **n'empêchent pas l'INSERT**. La ligne « purge des données de test » doit donc
   s'écrire **après** avoir réactivé les triggers :

   ```text
   DISABLE  →  DELETE  →  ENABLE  →  INSERT de la ligne de purge
   ```

   Écrire la première ligne du journal réel alors que son garde-fou est baissé
   serait un mauvais présage, et surtout un mauvais exemple pour le prochain qui
   lira cette migration.

**À signaler** : parmi les 756 lignes, **14 sont des refus d'accès**
(`entite = 'acces'`) — des traces de sécurité. Elles sont de test comme le
reste, donc elles partent ; c'est dit ici pour que personne ne le découvre
après.

---

## L'ordre de suppression, imposé par les contraintes

**Quatre clés étrangères bloquent** la suppression d'un client : elles ne sont ni
`CASCADE` ni `SET NULL`, et la suppression échouera tant que leurs lignes
existent.

| Table | Colonne | `ON DELETE` |
|---|---|---|
| `commandes` | `client_id` | **RESTRICT** |
| `commandes_personnalisees` | `client_id` | **RESTRICT** |
| `abonnements` | `client_id` | **NO ACTION** |
| `abonnements_mouvements` | `client_id` | **NO ACTION** |

L'ordre ci-dessous les respecte. Il va des feuilles vers les racines : à chaque
étape, plus rien ne pointe vers ce qu'on supprime.

```text
 0. SAUVEGARDE de la base.                        ← ne se rattrape pas
 1. Lever les deux triggers de journal_evenements (DISABLE).

 2. LES BLOQUANTES, d'abord et dans cet ordre :
      commandes_choix, commandes_lignes  →  commandes
      commandes_personnalisees
      abonnements_mouvements             →  abonnements

 3. LA COMPTABILITÉ, des lignes vers les pièces :
      ecritures_lignes                   →  ecritures
      facture_lignes, facture_reservations → factures
      paiements_resa
      avoirs_mouvements
      pieces                             →  depenses
      decomptes_tva
      exports_comptables_lots            →  exports_comptables
      facture_numerotation
      exercices                              (2024, 2025, 2026, 2027)

 4. LES VENTES ET LE STOCK :
      ventes_lignes                      →  ventes
      mouvements_stock
      UPDATE articles SET stock_actuel = 0, stock_reserve = 0

 5. LES RÉSERVATIONS :
      reservation_chiens, reservation_extras,
      occupation_boxes, checkin_checkout  →  reservations

 6. LE RESTE DES MOUVEMENTS :
      abonnements_prestations, cotisations_membres,
      taches_prestations, alertes_stock, liste_attente

 7. LE RH (les personnes et modeles_deductions restent) :
      fiche_salaire_deductions           →  fiches_salaire
      planning_employes, timbrage, demandes_vacances, indisponibilites

 8. LES E-MAILS :
      emails_envoyes, emails_campagnes

 9. LES FICHES : tous les clients SAUF 25d00648 et les quatre fiches
      internes du personnel — les deux « ZZ Contrôle » partent.
      Les chiens partent en CASCADE avec leur client, et avec eux leurs
      vaccins, chaleurs, photos_chiens, ententes_chiens.
      Puis le compte auth de la fiche A.

10. LE STOCKAGE : buckets `factures` (134), `justificatifs` (9),
      `chiens-photos` (1 — celle du Pixel de la fiche A).

11. Réactiver les triggers (ENABLE), PUIS écrire au journal :
      « purge des données de test du JJ.MM.AAAA ».
```

**Ce qui part tout seul, en cascade** : supprimer un client emporte ses
`chiens` — donc, en chaîne, leurs `vaccins`, `chaleurs`, `photos_chiens`,
`ententes_chiens`, `checkin_checkout`, `occupation_boxes`,
`reservation_chiens` — ainsi que ses `factures`, `reservations`,
`avoirs_mouvements`, `cotisations_membres`, `abonnements_prestations`,
`contacts_urgence`, `liste_attente`, `taches_prestations`. Les étapes 3 à 6 ne
sont donc pas redondantes : elles vident ce qui n'appartient à aucun client, et
rendent l'ordre lisible.

Trois liens se contentent d'un `SET NULL` : `ventes.client_id`,
`alertes_stock.client_id`, `boxes.proprietaire_client_id` — ce dernier concerne
un box gardé, dont le propriétaire de test disparaîtra proprement.

---

## Les contrôles

### Avant la purge

```sql
-- L'équilibre du grand-livre : 0.00 avant comme après.
select round(sum(coalesce(debit,0) - coalesce(credit,0)), 2) as ecart
from public.ecritures_lignes;
```

### Les six colonnes SANS clé étrangère — un contrôle chacune

Postgres ne les protège pas : après la purge, elles pointeraient dans le vide.
**Chaque requête doit renvoyer 0.**

```sql
-- 1. paiements_resa.client_id → un client qui n'existe plus
select count(*) from public.paiements_resa p
where p.client_id is not null
  and not exists (select 1 from public.clients c where c.id = p.client_id);

-- 2. emails_envoyes.reservation_id → une réservation qui n'existe plus
select count(*) from public.emails_envoyes e
where e.reservation_id is not null
  and not exists (select 1 from public.reservations r where r.id = e.reservation_id);

-- 3. ecritures.piece_id → une pièce qui n'existe plus
--    (piece_id désigne une facture, une dépense ou une vente selon piece_type)
select count(*) from public.ecritures e
where e.piece_id is not null
  and not exists (select 1 from public.factures f where f.id = e.piece_id)
  and not exists (select 1 from public.depenses d where d.id = e.piece_id)
  and not exists (select 1 from public.ventes v where v.id = e.piece_id);

-- 4. pieces.entite_id → la dépense ou la facture qui n'existe plus
select count(*) from public.pieces p
where p.entite_id is not null
  and not exists (select 1 from public.depenses d where d.id = p.entite_id)
  and not exists (select 1 from public.factures f where f.id = p.entite_id);

-- 5. ventes.ecriture_id → une écriture qui n'existe plus
select count(*) from public.ventes v
where v.ecriture_id is not null
  and not exists (select 1 from public.ecritures e where e.id = v.ecriture_id);

-- 6. journal_evenements → vidé puis réamorcé
select count(*) from public.journal_evenements;
--    Attendu : 1 — la seule ligne « purge des données de test du JJ.MM.AAAA ».
```

Les cinq premières portent sur des tables qui seront **vides** après la purge :
le contrôle vaut alors surtout pour la sixième, et pour l'après — le jour où une
de ces tables se remplira pour de vrai, ces requêtes restent le moyen de
vérifier qu'aucun lien ne s'est cassé en silence.

### Le contrôle final

```sql
-- 1. La fiche B et ses deux chiens sont INTACTS.
select
  (select count(*) from public.clients
     where id = '25d00648-555b-46b9-9638-b1ebf8cc6114')            as fiche_b,      -- 1
  (select count(*) from public.chiens
     where client_id = '25d00648-555b-46b9-9638-b1ebf8cc6114')     as ses_chiens,   -- 2
  (select count(*) from public.ententes_chiens
     where chien_id in ('e756238c-d218-42e3-81d9-8f2bd2e14364',
                        '258cc292-174d-465d-963d-8d1629ff50bb'))   as ses_ententes, -- 2
  (select count(*) from public.clients where interne = true)       as internes,     -- 5
  (select count(*) from public.clients)                            as clients,      -- 5
  (select count(*) from public.chiens)                             as chiens;       -- 2

-- 2. La fiche A a bel et bien disparu, avec ses quatre chiens.
select count(*) from public.clients
where id = '7a820aa4-ff87-4261-bf66-072ec2f404c8';                 -- 0

-- 3. Les deux fiches « ZZ Contrôle » sont parties.
select count(*) from public.clients
where nom ilike '%ZZ Contr%' or prenom ilike 'ZZ' or prenom ilike 'Recette'; -- 0

-- 4. Les compteurs de numérotation sont VIDES.
select count(*) from public.facture_numerotation;                  -- 0

-- 5. Plus aucune comptabilité.
select 'ecritures' as t, count(*) from public.ecritures
union all select 'factures', count(*) from public.factures
union all select 'paiements_resa', count(*) from public.paiements_resa
union all select 'avoirs_mouvements', count(*) from public.avoirs_mouvements
union all select 'depenses', count(*) from public.depenses
union all select 'exercices', count(*) from public.exercices;      -- 0 partout

-- 6. LE STOCK : les 121 articles sont là, et tous à zéro.
select
  (select count(*) from public.articles)                                  as articles,       -- 121
  (select count(*) from public.articles
     where coalesce(stock_actuel,0) <> 0)                                 as stock_non_nul,  -- 0
  (select count(*) from public.articles
     where coalesce(stock_reserve,0) <> 0)                                as reserve_non_nul,-- 0
  (select count(*) from public.mouvements_stock)                          as mouvements;     -- 0

-- 7. Le référentiel est intact.
select 'comptes' as t, count(*) from public.comptes                 --  43
union all select 'tarifs', count(*) from public.tarifs               --  40
union all select 'boxes', count(*) from public.boxes                 --  14
union all select 'profiles', count(*) from public.profiles           --  44
union all select 'employes_rh', count(*) from public.employes_rh     --   5
union all select 'modeles_deductions', count(*) from public.modeles_deductions --  6
union all select 'options_groupes', count(*) from public.options_groupes       -- 40
union all select 'options_valeurs', count(*) from public.options_valeurs       -- 273
union all select 'fournisseurs', count(*) from public.fournisseurs   --   4
union all select 'prestations', count(*) from public.prestations     --   3
union all select 'formules', count(*) from public.formules;          --   1

-- 8. Le journal ne porte plus qu'une ligne : celle de la purge.
select entite, evenement, created_at::date from public.journal_evenements;
```

**Et la preuve qui compte** : émettre la première facture réelle doit donner
**`FAC-2027-0001`**. La fonction `prochain_numero_facture` recrée la ligne de
compteur à 1 au premier appel (`insert … on conflict do nothing`), donc vider
`facture_numerotation` suffit — rien à remettre à la main.

**Le bilan de 2027** doit ensuite afficher un actif et un passif à **0.00**, et
la ligne « Résultat des exercices antérieurs non clôturés » disparaître d'elle-
même : elle est calculée, jamais stockée.

---

## Et la règle de la maison s'applique

La migration s'écrit **d'abord** dans un fichier de `supabase/migrations`, et
n'est appliquée **qu'ensuite** — voir AGENTS.md, « Le fichier avant
l'application ». Une purge est exactement le genre d'opération qu'on veut
pouvoir relire six mois plus tard.

**Une sauvegarde de la base se prend avant.** C'est le seul point de ce
document qui ne se rattrape pas.

---

# ☐ 2. Après la purge — ce qui revient à Sabrina

Trois gestes que la migration ne peut pas faire à sa place. Aucun n'est
bloquant pour le lancement, mais le deuxième et le troisième le sont pour le
premier vrai chiffre.

## ☐ 2a. Remettre la photo de Pixel sur la fiche B

Le bucket `chiens-photos` est vide après la purge : la seule photo qu'il portait
appartenait au Pixel de la fiche A, et **aucun transfert n'était prévu**.

Fiche client → Pixel (`258cc292-174d-465d-963d-8d1629ff50bb`) → déposer la
photo. La photo est nettoyée de ses métadonnées au dépôt, coordonnées GPS
comprises.

## ☐ 2b. Saisir l'inventaire d'ouverture du stock

Les 121 articles sont là, tous à `stock_actuel = 0`. Compter les rayons et
saisir les quantités réelles, **avant la première vente** : une vente sur un
stock à zéro est refusée, et une vente sur un stock faux fait une marge fausse.

## ☐ 2c. Vérifier les taux des déductions avant la première vraie paie

`modeles_deductions` a été gardé — c'est du paramétrage. Mais ses 6 lignes
datent des essais : **les taux n'ont jamais été vérifiés contre les barèmes en
vigueur** (AVS/AI/APG, AC, LAA, LPP, impôt à la source le cas échéant).

À relire avant d'établir la première fiche de salaire réelle. Une paie fausse se
corrige, mais elle se corrige devant la personne concernée et devant les
assurances sociales.
