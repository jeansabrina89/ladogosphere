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
