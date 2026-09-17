<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Le fichier avant l'application

Toute modification de schéma s'écrit **d'abord** dans un fichier de
`supabase/migrations`, et n'est appliquée **qu'ensuite**. Jamais l'inverse.

Cela vaut pour tout ce qui touche la structure : table, colonne, index,
contrainte, vue, fonction, trigger, politique RLS, droit. Le fichier se nomme
`<AAAAMMJJhhmmss>_<nom>.sql`, et `<nom>` est exactement le nom sous lequel la
migration est appliquée — sans quoi l'historique du dépôt et celui de Supabase
cessent de se répondre.

Le connecteur Supabase applique en une commande ce qui n'a demandé aucun
fichier : c'est précisément pour cela que la règle est écrite ici. Une base
qu'on ne peut pas reconstruire depuis le dépôt n'est sauvegardée nulle part, et
on s'en aperçoit le jour où l'on essaie — c'est-à-dire le pire jour possible.

# Une fonction SQL naît fermée

Une fonction SQL est créée avec `REVOKE EXECUTE FROM public, anon,
authenticated` ; `GRANT EXECUTE TO service_role`, sauf justification écrite
dans la migration.

C'est l'application, côté serveur, qui appelle la fonction après sa propre
garde de permissions, avec la clé de service. Une fonction laissée ouverte à
anon ou authenticated s'appelle directement par `/rest/v1/rpc` avec la clé
publique du site : la garde est alors enjambée, et une fonction SECURITY
DEFINER traverse en plus les politiques RLS.

La seule exception connue est une fonction citée dans une politique RLS : la
politique s'évalue avec les droits de celui qui interroge la table, donc
`authenticated` doit garder EXECUTE, sinon la requête échoue (42501). Une
telle fonction ne lit que les données de l'appelant, et la migration dit
pourquoi. Un test relit `supabase/migrations` et refuse toute nouvelle
fonction sans révocation explicite.
