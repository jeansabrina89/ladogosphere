# Migrations — le dépôt et la base, comparés dans les deux sens

Fait au lot 22-ter, le 24 septembre 2026. **Lecture seule : la base n'a été
modifiée d'aucune façon.**

AGENTS.md pose la règle — « une base qu'on ne peut pas reconstruire depuis le
dépôt n'est sauvegardée nulle part, et on s'en aperçoit le jour où l'on
essaie ». Ce document dit où en est cette promesse le 24 septembre 2026.

## Les quatre listes

| | Nombre |
|---|---|
| **Concordantes** (même version, même nom, même effet) | **170** |
| Même version et même nom, **contenu différent** | 2 |
| **En base, pas dans le dépôt** | 1 |
| **Dans le dépôt, pas en base** | **0** |
| Même nom, version différente | **0** |

174 lignes dans `supabase_migrations.schema_migrations`, 173 fichiers dans
`supabase/migrations`. Rien n'a été renommé : aucun fichier ne portait une
version que la base ne connaît pas.

**Aucune migration du dépôt n'est absente de la base.** C'est le cas qui
brûlerait : un `db push` rejouerait un fichier jamais appliqué. Il ne se
présente pas.

## Comment la comparaison a été faite

Sur le nom et la version d'abord. Puis, **sur le contenu** : empreinte MD5 du
SQL des deux côtés, après avoir mis en minuscules, retiré les commentaires et
réduit les espaces. Trois différences de forme ont été neutralisées une à une,
et seulement après avoir vérifié qu'elles étaient bien de forme :

- le `begin;` / `commit;` du fichier, que le connecteur n'enregistre pas
  puisqu'il enveloppe lui-même chaque migration (4 fichiers) ;
- les accents, perdus à l'application sur quatre migrations du 6 septembre
  (voir plus bas) ;
- les commentaires, absents des `statements` pour une partie des migrations.

## En base, pas dans le dépôt (1)

| Version | Nom |
|---|---|
| `20260906164724` | `cotisations_montant_default_200` |

Contenu enregistré :

```sql
alter table public.cotisations_membres alter column montant set default 200;
```

C'est **le doublon exact** de `20260906162821`, qui porte le même nom, le même
SQL et qui, elle, a son fichier. La même instruction a été appliquée deux fois
à deux minutes d'intervalle ; elle est idempotente, la seconde n'a rien changé.

**Rien n'a été recréé** : la décision de rapatrier ou non ce doublon revient à
Sabrina. Écrire un second fichier au même nom reviendrait à inscrire dans le
dépôt une répétition sans objet ; ne rien écrire laisse une ligne de la base
sans fichier.

## Contenu différent (2)

Les deux vont dans le même sens : **le fichier en dit plus que ce qui a été
appliqué**. Dans les deux cas l'effet manquant est bien présent en base
aujourd'hui, arrivé par un autre chemin — vérifié, pas supposé.

### `20260811182638_flip_cotisation_au_paiement_reservation`

Le fichier porte une ligne que la base n'a pas enregistrée :

```sql
revoke execute on function public.flip_cotisation_au_paiement_reservation()
  from public, anon, authenticated;
```

C'est la règle « une fonction SQL naît fermée ». **Vérifié en base :**
`has_function_privilege` renvoie `false` pour `anon`, `authenticated` et
`public`, `true` pour `service_role`. La fonction est fermée — refermée par
`20260917181950_fonctions_sql_fermees_roles_publics`, qui a repris l'ensemble.

### `20260907085030_compta_phase_1_paiements_et_stockage`

Le fichier porte en plus :

```sql
insert into public.parametres (cle, valeur, description) values
  ('email_entreprise',     '', 'E-mail affiché sur les factures'),
  ('telephone_entreprise', '', 'Téléphone affiché sur les factures'),
  ('ide',                  '', 'Numéro IDE (CHE-...) affiché sur les factures')
on conflict (cle) do nothing;
```

**Vérifié en base :** les trois clés existent, vides. L'`on conflict do
nothing` rend d'ailleurs l'instruction sans effet si elle était rejouée.

Conséquence des deux : rejouer le dépôt sur une base vide donnerait l'état
actuel. Le dépôt est la version la plus complète des deux.

## Les accents perdus (4, sans conséquence)

`journee_essai_resultat_par_chien`, `personnel_fiches_et_box_internes`,
`essai_une_par_jour_creneau_force` et `cohabitation_declaree_par_le_client`
ont été appliquées avec leurs accents remplacés par des lettres nues — « Source
de verite », « reservations du personnel ». L'écart ne porte que sur le texte
des `comment on column` : structure, contraintes et index sont identiques. Les
fichiers, eux, sont accentués.

Ce n'est pas un défaut de sécurité, mais c'est la trace d'un passage où
l'encodage s'est perdu entre le fichier et la commande appliquée. À surveiller
si un lot futur applique des migrations depuis un outil qui n'est pas en UTF-8.
