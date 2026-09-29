-- APP 56 — LA DATE D'OUVERTURE, UNE SEULE SOURCE
--
-- ── LA DÉCISION ───────────────────────────────────────────────────────────
--
-- La Dogosphère ouvre le lundi 1er mars 2027 (décision de Sabrina,
-- 29.09.2026 ; c'était le 15 octobre 2026). Les clients peuvent réserver dès
-- maintenant, mais aucune date avant l'ouverture. La boutique en ligne ouvre
-- le même jour.
--
-- ── POURQUOI UNE LIGNE DE PARAMÈTRE, ET RIEN D'AUTRE ──────────────────────
--
-- `parametres` n'a aucune contrainte sur `cle` (hors le cas particulier
-- d'`animaux_en_ligne`) : une nouvelle clé n'appelle donc aucun changement de
-- structure. Cette migration n'écrit qu'une donnée — mais elle est écrite ici,
-- et pas posée à la main, pour que la base se reconstruise depuis le dépôt
-- avec la même date. Un réglage absent ne ferait rien planter : il laisserait
-- simplement la maison ouverte à toutes les dates, c'est-à-dire l'inverse de
-- ce qui est décidé, et sans que rien ne le signale.
--
-- ── EFFACER LA DATE EST PRÉVU ─────────────────────────────────────────────
--
-- La valeur vide veut dire « aucune restriction ». C'est ainsi qu'on refermera
-- le sujet le jour de l'ouverture : on vide le champ dans Réglages →
-- Entreprise, et tout redevient normal sans toucher au code.
--
-- `on conflict` ne remplace pas une valeur déjà posée : si quelqu'un a déjà
-- réglé la date depuis l'écran, cette migration ne doit pas la lui reprendre.

insert into public.parametres (cle, valeur, description)
values (
  'date_ouverture',
  '2027-03-01',
  'Date d''ouverture de la pension et de la boutique en ligne (YYYY-MM-DD). Avant cette date, les clients ne peuvent ni réserver ni commander en ligne. Vide = aucune restriction.'
)
on conflict (cle) do nothing;
