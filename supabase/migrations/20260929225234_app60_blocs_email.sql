-- APP 60 — TOUS LES TEXTES DES E-MAILS DEVIENNENT MODIFIABLES
--
-- ── CE QUE CETTE COLONNE PORTE ───────────────────────────────────────────
--
-- Les quatre champs d'origine — sujet, titre, intro, message_final — ne
-- couvraient qu'une partie des textes d'un e-mail. Tout le reste était écrit
-- dans le HTML : les paragraphes, les titres d'encadrés, les lignes de listes,
-- les phrases d'aide. Sabrina ne pouvait pas les reformuler sans un lot
-- (décision de Sabrina, 29.09.2026).
--
-- `blocs` les porte, par clé. Un e-mail y range ce qu'il a de propre :
--
--   { "disponibilite": "Nous restons à votre disposition…",
--     "avantages_titre": "🐾 Avantages membres",
--     "avantages_lignes": ["✔ …", "✔ …"] }
--
-- ── LES DÉFAUTS NE SONT PAS ICI ──────────────────────────────────────────
--
-- La colonne naît à `{}` et ne contient QUE ce qui a été réellement changé.
-- Les valeurs d'origine vivent dans le code, à côté des quatre champs. Trois
-- conséquences voulues :
--
--  · le jour du déploiement, rien ne change — un test compare les vingt-et-un
--    e-mails rendus, au caractère près, à ceux d'avant le lot ;
--  · « Revenir au texte d'origine » n'écrit rien : il EFFACE la clé ;
--  · une clé qui disparaît du code est ignorée, et une clé inconnue en base
--    aussi. La base ne peut pas inventer un texte que le code n'attend pas.
--
-- ── RIEN NE CASSE DE L'EXISTANT ──────────────────────────────────────────
--
-- La colonne est ajoutée, pas remplacée : les lignes déjà présentes gardent
-- leurs quatre champs et reçoivent `{}`. `not null default` évite d'avoir à
-- distinguer « pas de blocs » de « blocs vides » dans chaque lecture.

alter table public.modeles_email
  add column if not exists blocs jsonb not null default '{}'::jsonb;

comment on column public.modeles_email.blocs is
  'Les textes modifiables d''un e-mail, au-delà des quatre champs d''origine, par clé. Une valeur est une phrase ou une liste de lignes. Une clé absente ou vide se replie sur le défaut écrit dans le code (APP 60).';
