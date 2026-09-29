-- APP 59 — LA VERSION DES CONDITIONS DEVIENT UN RÉGLAGE
--
-- ── POURQUOI ─────────────────────────────────────────────────────────────
--
-- La date de « Dernière mise à jour » de chaque page de conditions était une
-- constante du code (`liensLegaux.ts`). Quand Sabrina modifie les conditions
-- sur le site, elle ne peut pas modifier le code : il fallait un lot pour
-- reporter une date. Entre les deux, les clientes continuaient d'accepter sous
-- l'ANCIEN numéro — et l'on aurait cru qu'elles avaient lu un texte qu'elles
-- n'avaient pas vu. C'est une erreur silencieuse, et c'est exactement celle
-- que ce réglage ferme (décision de Sabrina, 29.09.2026).
--
-- ── CE QUE LA VERSION FAIT, ET CE QU'ELLE NE FAIT PAS ────────────────────
--
-- Elle est enregistrée avec chaque acceptation, et elle décide du repère
-- « ancienne version » montré au personnel. Elle ne BLOQUE rien : une version
-- périmée se signale, elle ne barre pas la route (APP 42).
--
-- Les deux valeurs posées ici sont celles d'aujourd'hui, relevées sur le site
-- le 29.09.2026. Une clé absente ou illisible se replie sur cette même valeur :
-- une base muette ne doit pas faire passer tout le monde pour « à jour ».

insert into public.parametres (cle, valeur, description) values
  ('conditions_pension_version', '2026-09-29',
   'Version des conditions de la pension : la date « Dernière mise à jour » de https://ladogosphere.ch/conditions-pension, au format AAAA-MM-JJ.'),
  ('conditions_vente_version', '2026-09-29',
   'Version des conditions de vente : la date « Dernière mise à jour » de https://ladogosphere.ch/conditions-vente, au format AAAA-MM-JJ.')
on conflict (cle) do nothing;
