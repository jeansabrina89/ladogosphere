-- Suivi des relances de paiement par reservation (sejours).
-- paiement_demande_le : date d'envoi automatique de la demande de paiement (14 j avant le debut).
-- relance_niveau : 0 aucune, 1 relance (14 j apres), 2 premier rappel (1 mois), 3 deuxieme rappel (2 mois).
-- relance_le : date d'envoi de la derniere relance validee manuellement.
alter table public.reservations
  add column if not exists paiement_demande_le date,
  add column if not exists relance_niveau integer not null default 0,
  add column if not exists relance_le date;
