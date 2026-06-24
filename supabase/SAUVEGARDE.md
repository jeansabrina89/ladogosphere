# Sauvegarde et restauration

Projet Supabase : lljxyrbocdqerricggfc (region Zurich, plan Free).
Sur le plan Free, Supabase ne fournit pas de sauvegarde automatique restaurable.
La sauvegarde est donc geree manuellement, en deux couches.

## 1. Schema (structure)
Fichier de reference : supabase/schema.sql (versionne dans ce depot, sans donnees).
Regenerer apres tout changement de structure :
  npx --yes supabase@latest db dump --linked --schema public -f supabase/schema.sql

## 2. Donnees
Exporter les donnees a la demande :
  npm run backup:data
Cela cree un fichier backups/donnees-AAAAMMJJ-HHMM.sql .
IMPORTANT : ce fichier contient des donnees clients. Il est ignore par git (jamais sur GitHub).
Le conserver dans un endroit prive et sauvegarde (disque externe ou cloud chiffre).
Frequence conseillee avant lancement : une fois par mois et avant toute grosse migration.

## 3. Restauration
Vers une base PostgreSQL vide (nouveau projet Supabase ou local) :
  1. Appliquer la structure :  psql "<connexion>" -f supabase/schema.sql
  2. Appliquer les donnees  :  psql "<connexion>" -f backups/donnees-AAAAMMJJ-HHMM.sql

## 4. Au lancement
Passer le projet en plan Pro et activer le PITR (point-in-time recovery) pour des
sauvegardes automatiques restaurables des qu'il y aura de vrais clients.
