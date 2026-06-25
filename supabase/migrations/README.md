# Migrations versionnees - La Dogosphere

Ce dossier contient l'historique complet et ordonne des migrations SQL de la base
Supabase de production (`lljxyrbocdqerricggfc`), une par fichier, nommees
`<version>_<nom>.sql` ou `version` est un horodatage UTC `AAAAMMJJhhmmss`.

Rejouees dans l'ordre sur une base vide, ces 58 migrations reproduisent
exactement le schema de production (tables, RLS, fonctions, triggers, seed du
plan comptable). C'est la source de verite du schema : il remplace l'ancien
dump `schema.sql`.

## A quoi ca sert
- Reproductibilite : monter une base de staging identique a la prod.
- Historique : savoir quoi a change, quand et pourquoi.
- Rollback : revenir a un etat connu.

## Convention pour la suite
Chaque nouveau changement de schema (DDL) = un NOUVEAU fichier ici, jamais une
modification d'un fichier existant. Le nom de fichier doit correspondre au nom
de la migration appliquee sur Supabase, pour que l'historique du depot et celui
de Supabase restent alignes.

Les fichiers existants ne doivent jamais etre edites : ils refletent ce qui a
deja ete applique en production.
