# Corrections de données

Ce dossier garde la trace des scripts SQL qui corrigent des **données**, jamais
le schéma. Un script de correction ne rejoue pas l'histoire du schéma : monter
une base vide depuis `supabase/migrations` ne doit rien exécuter d'ici.

C'est pourquoi ils vivent à côté et non dedans. Le dossier des migrations porte
une promesse vérifiée — chaque fichier correspond octet pour octet à une ligne
de `supabase_migrations.schema_migrations` — et y déposer un script de données
la romprait.

Chaque script se nomme `<AAAAMMJJ>_<nom>.sql`, s'exécute dans une seule
transaction, et écrit au `journal_evenements` ce qu'il a déplacé, avec son
motif. Il est joué une fois, à la main, via le connecteur Supabase.
