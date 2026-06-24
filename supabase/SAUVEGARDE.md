# Sauvegarde et restauration

Projet Supabase lljxyrbocdqerricggfc (region Zurich, plan Free).
Sur le plan Free, Supabase ne fournit pas de sauvegarde automatique restaurable.
La sauvegarde est donc geree manuellement, en deux couches. (Le CLI Supabase exige Docker :
on ne l'utilise pas, on passe par une connexion directe a la base.)

## 1. Schema (structure)
Fichier de reference versionne : supabase/schema.sql (sans donnees).

## 2. Donnees
1. Recuperer la chaine "Session pooler" dans Supabase : Settings > Database > Connection string >
   Session pooler. Forme : postgresql://postgres.lljxyrbocdqerricggfc:[MOT-DE-PASSE]@...pooler.supabase.com:5432/postgres
   Remplacer [MOT-DE-PASSE] par le mot de passe de la base.
2. Definir la variable d'environnement SUPABASE_DB_URL avec cette chaine.
3. Lancer : npm run backup:data
Cree backups/donnees-AAAAMMJJ-HHMM.sql (donnees uniquement).
IMPORTANT : contient des donnees clients. Ignore par git. A conserver dans un endroit prive et sauvegarde.
Frequence conseillee avant lancement : une fois par mois et avant toute grosse migration.

## 3. Restauration (vers une base PostgreSQL vide)
1. Structure : psql "<connexion cible>" -f supabase/schema.sql
2. Donnees  : psql "<connexion cible>" -f backups/donnees-AAAAMMJJ-HHMM.sql

## 4. Au lancement
Passer en plan Pro et activer le PITR pour des sauvegardes automatiques restaurables.
