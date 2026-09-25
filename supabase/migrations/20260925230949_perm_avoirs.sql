-- Le droit de créditer un avoir, séparé des encaissements.
--
-- C-07a, ouvert depuis l'audit du 22 septembre : `ajouterAvoir` vivait sous
-- `perm_encaissements`, et aucune permission « avoirs » n'existait. Le lot
-- 22-ter avait répondu à une autre question — celle de l'appartenance — et
-- laissé celle-ci ouverte.
--
-- Décision de Sabrina, 26 septembre 2026 : créditer un avoir revient à DONNER
-- de l'argent à un client. Encaisser, c'est recevoir ; créditer, c'est donner,
-- et les deux ne se confondent pas. Le geste manuel — créditer, corriger,
-- retirer — passe désormais par `perm_avoirs`. Utiliser un avoir comme moyen
-- de paiement à la caisse reste sous `perm_encaissements` : c'est un
-- encaissement, pas une libéralité.
--
-- `default false`, et PERSONNE ne le reçoit par cette migration : une
-- permission qui s'accorde toute seule au déploiement n'a jamais été accordée
-- par quiconque. L'administratrice le coche pour qui elle veut, depuis la
-- fiche de l'employé. Elle-même n'en a pas besoin : l'admin passe partout.

alter table public.profiles
  add column if not exists perm_avoirs boolean not null default false;

comment on column public.profiles.perm_avoirs is
  'Créditer, corriger ou retirer un avoir client à la main. Distincte de perm_encaissements depuis le 26.09.2026 : encaisser c''est recevoir, créditer c''est donner.';
