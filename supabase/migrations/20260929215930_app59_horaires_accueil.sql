-- APP 59 — LES HORAIRES D'ACCUEIL DEVIENNENT DES RÉGLAGES
--
-- ── POURQUOI ─────────────────────────────────────────────────────────────
--
-- Les heures étaient écrites en dur à sept endroits : deux encadrés d'e-mail,
-- trois avertissements du personnel, les créneaux proposés au client et les
-- bornes de la journée du personnel. Changer l'heure d'ouverture demandait de
-- les retrouver toutes, et la première oubliée aurait dit autre chose que les
-- six autres sans que rien ne le signale (décision de Sabrina, 29.09.2026).
--
-- ── LA FORME ─────────────────────────────────────────────────────────────
--
-- Un ou plusieurs créneaux séparés par « ; ». Un créneau est « HH:MM-HH:MM »,
-- ou une heure seule quand il n'y a rien à choisir (l'arrivée d'un essai est
-- à 10:00, point).
--
-- Les cinq valeurs posées ici sont celles d'AUJOURD'HUI, au caractère près :
-- le jour du déploiement, chaque e-mail et chaque avertissement reste
-- identique. Des tests comparent les textes rendus à ceux d'hier.
--
-- Une clé absente ou illisible se replie côté application sur cette même
-- valeur : la base ne peut pas fermer la pension par accident.
--
-- `on conflict do nothing` : si quelqu'un a déjà réglé un horaire depuis
-- l'écran, cette migration ne le lui reprend pas.

insert into public.parametres (cle, valeur, description) values
  ('horaires_journee_arrivee', '07:35-10:00',
   'Horaires d''accueil — arrivée d''une garderie (journée). Format « HH:MM-HH:MM », plusieurs créneaux séparés par « ; ».'),
  ('horaires_journee_depart', '17:00-18:00',
   'Horaires d''accueil — départ d''une garderie (journée).'),
  ('horaires_sejour', '09:00-10:00 ; 17:00-18:00',
   'Horaires d''accueil — arrivée ET départ d''un séjour. Deux créneaux, matin et soir.'),
  ('horaires_essai_arrivee', '10:00',
   'Horaires d''accueil — arrivée d''une journée d''essai. Heure fixe.'),
  ('horaires_essai_depart', '17:00-18:00',
   'Horaires d''accueil — départ d''une journée d''essai.')
on conflict (cle) do nothing;
