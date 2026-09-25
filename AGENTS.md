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

Une migration appliquée par l'outil MCP reçoit sa version **à l'application** :
le fichier du dépôt prend CETTE version, relue dans `schema_migrations`, jamais
une heure choisie à la main. Six fichiers ont porté une version inventée
jusqu'au 24 septembre 2026 — l'heure locale suisse, quand la base enregistre
l'heure UTC. Deux heures d'écart suffisent à ce que les deux historiques ne se
répondent plus, et rien ne le signale.

```sql
select version, name from supabase_migrations.schema_migrations
order by version desc limit 5;
```

Le connecteur Supabase applique en une commande ce qui n'a demandé aucun
fichier : c'est précisément pour cela que la règle est écrite ici. Une base
qu'on ne peut pas reconstruire depuis le dépôt n'est sauvegardée nulle part, et
on s'en aperçoit le jour où l'on essaie — c'est-à-dire le pire jour possible.

Une migration appliquée hors dépôt (depuis une autre session, le tableau de
bord ou un autre outil) doit être rapatriée dans `supabase/migrations`, sous le
nom et la version enregistrés, avant tout autre commit.

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

# Une promesse oubliée ne se voit pas

`npm run lint:types` lance le lint AVEC le typage : il attrape les promesses
mal employées, et d'abord la pire — une promesse servant de condition, comme
un `if (verifierCron(...))` sans `await`, qui est toujours vraie et laisse
donc la garde ouverte.

Il est séparé de `npm run lint`, qui reste rapide : on le lance avant une mise
en ligne, et dans tout lot qui touche à une garde asynchrone ou à une porte de
sécurité.

# Un échec isolé se garde

Si un test échoue une fois puis passe au vert, la sortie complète se garde
**avant** de relancer : le nom du test, le fichier, l'assertion, l'écart
constaté. Sans eux, il ne reste qu'un compte — « 1 failed » — et on corrige à
l'aveugle, ou pire, on décide que ce n'était rien.

Une machine chargée fait expirer une attente ; ce n'est pas un défaut du
logiciel, et les tests de composants ont pour cela un délai confortable
(`tests/setup/attenteJsdom.ts`). Mais l'instabilité qui persiste après ce
relèvement ne vient plus de la charge : c'est une course, et elle se cherche
avec la sortie qu'on a gardée.

**La sortie se garde toute seule** : `npm run test:trace` lance la suite en
écrivant TOUJOURS la sortie complète dans `traces-tests/<horodatage>.txt`
avant tout filtrage, et rend le code de sortie de vitest. C'est lui qu'on
utilise pour les vérifications de fin de lot, `npm test` restant la version
courte. La règle précédente demandait d'y penser au pire moment — celui où
l'on veut juste savoir si c'est vert — et elle a été enfreinte deux fois en
deux jours par celui-là même qui l'avait écrite.

## Sujet ouvert : deux échecs isolés jamais reproduits

Au 24 septembre 2026, deux exécutions de la suite ont signalé un échec, à
deux jours et deux lots différents, sans que la sortie ait été conservée. La
suite a ensuite été lancée **vingt et une fois d'affilée** avec `test:trace` :
aucun échec.

Ce qui a été écarté, preuves à l'appui :

- **la fuite d'état entre fichiers de test** — vitest isole chaque fichier
  (`isolate: true` par défaut, vérifié dans ses valeurs par défaut) : registre
  de modules et environnement neufs à chaque fichier ;
- **le jsdom mal nettoyé** — les trois fichiers jsdom appellent `cleanup()` et
  `vi.unstubAllGlobals()` dans un `afterEach`.

Ce qui reste plausible : les **deux** exécutions en échec étaient deux à quatre
fois plus lentes que la normale (import 125 s contre 65 s ; environnement 104 s
contre 11 s).

**Corrigé le 24 septembre 2026**, non pour faire taire l'échec mais pour qu'il
parle :

- **Les deux délais étaient dans le mauvais ordre.** Le test expirait à 5 000 ms
  quand l'attente de rendu en demandait 4 000 : on recevait « Test timed out »,
  qui ne nomme rien. Le délai des fichiers jsdom est passé à **15 secondes**
  (`tests/setup/attenteJsdom.ts`), l'attente restant à 4 ; les tests en
  environnement node gardent les 5 secondes d'origine. Vérifié : l'échec d'une
  attente dit maintenant `Unable to find role="button" and name …` au lieu de
  `Test timed out`. La règle générale : le délai d'un test reste toujours
  confortablement supérieur à la plus longue attente qu'il contient.
- **`vi.doUnmock("xlsx")` est passé dans un `afterEach`.** En fin de corps de
  test, il ne s'exécutait que si le test réussissait — donc jamais quand on en
  avait besoin — et un échec aurait entraîné les tests suivants du fichier,
  rendant la trace illisible au pire moment.

Non corrigé, et c'est délibéré : les tests qui lisent l'heure réelle
(`tests/encaissement.test.ts`, `tests/paiementDemandeRelance.test.ts`) sont
sensibles à un passage de minuit UTC — soit 2 h du matin ici, ce qui ne
correspond à aucune des deux occurrences. Les figer demanderait de décider
quelle heure ils doivent voir : c'est un sujet en soi, pas un effet de bord à
traiter au passage.

### Le 24 septembre 2026 : l'échec a enfin été attrapé

`npm run test:trace` a conservé la trace
(`traces-tests/2026-09-24T08-50-36.txt`). Le test est nommé :

> `tests/ententesReseau.test.tsx > Ententes : le premier chargement échoue >
> « Réessayer » recharge vraiment, et la liste apparaît`
> `AssertionError: expected <p role="alert">…</p> to be null` (ligne 95)

Ce n'est **pas** un dépassement de délai : la liste est bien chargée, et le
bandeau d'erreur est encore là au moment de l'assertion. Fréquence observée :
une fois sur huit exécutions complètes le 24 septembre ; **zéro sur
vingt-cinq** exécutions du seul fichier — il faut la suite entière pour le
voir.

Deux mécanismes candidats, non tranchés et **non corrigés** :

1. une lecture périmée qui écrit son échec APRÈS le succès de la suivante —
   `charger()` d'`Ententes.tsx` n'a aucune garde de séquence, donc une
   réponse en retard peut écraser l'état d'une réponse plus récente. Ce
   serait alors un vrai défaut du composant, visible en production sur un
   réseau instable, c'est-à-dire exactement la situation pour laquelle il a
   été écrit ;
2. un reste de DOM du test voisin : `screen` interroge tout `document.body`,
   et le test précédent du même fichier affiche le même bandeau.

**Le test est instrumenté depuis le 24 septembre** : il compte les bandeaux
DANS son conteneur et dans tout le document, et joint à l'échec l'ordre réel
des appels. Un bandeau dans le conteneur accusera le composant ; un bandeau
ailleurs accusera le nettoyage entre tests. L'assertion est plus stricte
qu'avant, pas moins.

**Vingt exécutions complètes de plus, aucun échec** — dix avec le simulateur
instrumenté, dix avec sa forme d'origine. Non reproduit, donc non corrigé :
`Ententes.tsx` n'a toujours aucune garde de séquence.

Un fait mesuré, qui ne prouve rien à lui seul mais qui oriente : le simulateur
de ce test partage UN SEUL objet `Response` entre tous les appels qui
réussissent. Or un corps de réponse ne se lit qu'une fois — un troisième appel
lèverait « Body is unusable: Body has already been read », que `appelerApi`
traite en échec réseau et affiche avec le message exact vu dans la trace. Il
manque le déclencheur : dans le scénario nominal, le composant n'appelle que
deux fois (mesuré).

Deux occurrences réelles ne s'effacent pas parce qu'on n'a pas su les
reproduire. Celle-ci, on l'a.

# Un lot de sécurité ouvre le suivi, et le referme

Tout lot de sécurité ouvre `docs/SUIVI-AUDIT-2026-09-22.md` au début et le met
à jour à la fin.

La numérotation des lots 18b à 18g a dérivé : le contenu assigné à trois
d'entre eux n'a jamais été reporté, et personne ne s'en est aperçu pendant
trois semaines. Un tableau qu'on ouvre avant de commencer ne se perd pas de la
même façon qu'une intention.

# À traiter au lot 19d : une facture renoncée empêche de clore l'exercice

Depuis le 24 septembre 2026, la réconciliation quotidienne des documents de
facture **renonce** après six échecs consécutifs : la facture sort de la ronde,
cesse d'alerter, et attend une reprise à la main depuis l'écran d'export
comptable (`document_renonce_le`).

**La clôture d'exercice du lot 19d DOIT refuser de clore tant qu'une facture de
l'exercice porte `document_renonce_le` non nul.** Sans cela, on aura remplacé
une alerte quotidienne qu'on finissait par ignorer par un état parfaitement
silencieux — ce qui est un recul, pas un progrès. Une pièce comptable sans
document est exactement ce qu'une clôture doit empêcher de sceller.

Le refus nomme les factures concernées et renvoie à l'écran d'export, où le
bouton « Reprendre » existe déjà.

# Dette de test datée : l'avertissement de `emettreFactureCommande`

**Ouverte le 24 septembre 2026.** Quand une commande en ligne est payée par
facture et que le document ne peut pas être fabriqué, la cliente reçoit
« Commande confirmée » **suivi de l'avertissement** — la facture est émise, sa
pièce suivra. Cette propagation n'est pas testée.

**Ce qu'un test prouverait :** que l'avertissement traverse
`emettreFactureCommande` → `confirmerCommande` → le message rendu, et qu'il
n'écrase pas la confirmation elle-même (la commande tient, c'est le premier
point à ne pas perdre).

**Coût estimé :** `confirmerCommande` a huit dépendances — session, panier,
catalogue, TVA, RPC d'émission, e-mail, journal, revalidation. Monter le décor
demanderait une bonne heure, pour prouver trois lignes de propagation.

**Pourquoi c'est écrit plutôt que clos.** La même phrase — « il faut un décor
trop gros » — a été écrite au lot 18g à propos de `GestionOptions`, et s'est
révélée fausse deux lots plus tard : il suffisait de rendre l'écran et
d'ouvrir le formulaire d'ajout. Un œil neuf trouvera peut-être le même
raccourci ici. Une dette écrite se rouvre ; une question close, non.

# Avant la première écriture réelle : la check-list de production

`docs/MISE-EN-PRODUCTION.md` porte les étapes qui n'appartiennent à aucun lot,
parce qu'elles se font ENTRE deux lots. La première est le retrait des données
comptables de test de 2024 à 2027.

**Aucun exercice ne se clôture d'ici là.** Clôturer 2026 ferait passer son
résultat — −7 942, entièrement de test — dans le 2970, donc dans les fonds
propres de la vraie comptabilité, et cela ne se défait pas. Le report « exercices
antérieurs non clôturés » tient les bilans justes en attendant.

Une étape qui n'est écrite dans aucun lot ne se rappelle nulle part : c'est
exactement ainsi que le contenu des lots 18e à 18g s'est perdu.
