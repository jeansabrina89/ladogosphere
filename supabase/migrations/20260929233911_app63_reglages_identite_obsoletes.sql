-- APP 63 — LES ANCIENS RÉGLAGES D'IDENTITÉ QUITTENT `parametres`
--
-- ── CE QUI S'EST PASSÉ ───────────────────────────────────────────────────
--
-- L'identité de paiement — IBAN, titulaire, adresse — vit sur
-- `entites_juridiques` depuis APP 18 : elle est DATÉE, parce qu'une pièce émise
-- garde l'identité de sa date. Mais sept clés de `parametres` en gardaient une
-- copie, et l'écran Tarifs les lisait pour les renvoyer à l'entité en vigueur à
-- CHAQUE sauvegarde des prix.
--
-- Le 29.09.2026 à 20:45 UTC, enregistrer un tarif a donc mis l'IBAN de l'entité
-- à null et changé sa raison sociale (`journal_evenements`, événement
-- « coordonnees »). Personne ne l'avait demandé, et rien ne l'a signalé : une
-- seconde source de vérité ne se trahit qu'en écrasant la première.
--
-- ── CE QUE CETTE MIGRATION FAIT ──────────────────────────────────────────
--
-- Elle supprime les sept clés. Plus rien ne les lit : l'écran Tarifs affiche
-- désormais l'identité en lecture seule depuis `entites_juridiques`, et la
-- route qui les y renvoyait est supprimée.
--
-- Leur contenu avant suppression, pour mémoire :
--
--   iban            « CH00 …masqué… 0 » — le gabarit de test, jamais un vrai compte
--   titulaire       « La Dogosphère Sàrl »
--   adresse_pays    « CH »
--   adresse_rue / adresse_numero / adresse_npa / adresse_ville  — vides
--
-- Aucune donnée réelle n'est perdue : l'IBAN et la raison sociale se
-- ressaisissent dans Réglages → Entreprise, où ils vivent.
--
-- ── ELLES NE REVIENDRONT PAS PAR MÉGARDE ─────────────────────────────────
--
-- `delete` et non `update` : une clé vide se relirait, et le prochain écran qui
-- la trouverait pourrait croire qu'elle veut dire quelque chose. Une clé
-- absente, elle, ne se replie sur rien.

delete from public.parametres
 where cle in (
   'iban',
   'titulaire',
   'adresse_rue',
   'adresse_numero',
   'adresse_npa',
   'adresse_ville',
   'adresse_pays'
 );
