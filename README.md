# La Dogosphere

Application de gestion de La Dogosphere, pension canine située à Sion (Valais, Suisse).

Elle couvre l'ensemble de l'activité :

- réservations et suivi des séjours,
- check-in / check-out des chiens,
- facturation avec QR-facture suisse,
- comptabilité en partie double,
- gestion RH : planning, timbrage, vacances, fiches de salaire.

L'application expose trois espaces distincts : client, employé et administrateur.

## Stack

- **Next.js 16** (App Router, Turbopack) et **React 19**
- **Tailwind CSS v4**
- **Supabase** : Postgres, Auth et RLS
- **Resend** pour les emails transactionnels
- **swissqrbill** pour la génération des QR-factures
- **Vitest** pour les tests
- Déploiement sur **Vercel**

## Démarrage

Prérequis : Node 20.9 ou plus récent (contrainte de Next 16).

```bash
npm install
cp .env.example .env.local   # puis renseigner les variables
npm run dev
```

Les variables attendues sont listées et commentées dans [.env.example](.env.example).

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Démarre le serveur de développement. |
| `npm run build` | Compile l'application pour la production. |
| `npm run start` | Démarre le serveur à partir du build de production. |
| `npm run lint` | Lance ESLint sur le dépôt. |
| `npm run test` | Exécute la suite de tests Vitest. |
| `npm run backup:data` | Exporte les données via `scripts/sauvegarde-donnees.mjs`. |

## Architecture

| Dossier | Rôle |
| --- | --- |
| [app/(admin)/](app/(admin)/) | Espace administrateur et employé. |
| [app/(client)/](app/(client)/) | Espace client. |
| [app/(public)/](app/(public)/) | Pages publiques. |
| [app/api/](app/api/) | Route handlers (API, webhooks, tâches cron). |
| [app/components/ui/](app/components/ui/) | Kit UI partagé. |
| [src/lib/](src/lib/) | Logique métier : tarification, facturation, comptabilité, planning. |
| [supabase/schema.sql](supabase/schema.sql) | Structure complète de la base (référence). |
| [supabase/migrations/](supabase/migrations/) | Migrations SQL versionnées. |
| [tests/](tests/) | Tests unitaires et d'intégration. |

## Base de données

La référence de la structure est [supabase/schema.sql](supabase/schema.sql) : un
export du schéma `public` (tables, contraintes, index, fonctions, déclencheurs,
RLS), sans aucune donnée. Les migrations de
[supabase/migrations/](supabase/migrations/) postérieures à sa date de génération
le complètent — le dossier des migrations à lui seul ne reproduit pas le schéma,
plusieurs tables historiques n'y figurant pas.

Pour recréer une base à l'identique :

```bash
psql "<connexion cible>" -f supabase/schema.sql
# puis les migrations postérieures à l'en-tête du fichier
```

Pour regénérer le fichier après une série de migrations (nécessite la chaîne de
connexion « Session pooler » dans `SUPABASE_DB_URL`) :

```bash
npm run backup:schema
```

Toute modification de schéma passe par une migration versionnée dans
[supabase/migrations/](supabase/migrations/), jamais par une modification manuelle
en console.

## Tests

```bash
npm run test
```

Outre les tests unitaires, [tests/exerciceComptableComplet.test.ts](tests/exerciceComptableComplet.test.ts)
est un test d'intégration qui simule un exercice comptable complet à travers le
code de comptabilité réel et vérifie l'équilibre des livres.
