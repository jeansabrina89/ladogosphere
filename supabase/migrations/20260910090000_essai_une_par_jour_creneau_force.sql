-- Une seule journée d'essai par jour, avec forçage admin par créneau.
--
-- `essai_force` / `essai_force_raison` (APP 03) marquent déjà un passage outre
-- de la règle de la journée d'essai par le personnel. On les réutilise ici,
-- et `essai_force_heure` désigne sans ambiguïté le second cas : une SECONDE
-- journée d'essai forcée à une date déjà prise, placée sur un autre créneau.
--   - essai_force_heure NULL  → forçage sur le STATUT d'un chien (APP 03) ;
--   - essai_force_heure posée → forçage sur la DATE d'une journée d'essai.
begin;

alter table public.reservations
  add column if not exists essai_force_heure time;

comment on column public.reservations.essai_force_heure is
  'Créneau d''une seconde journée d''essai forcée par l''admin à une date déjà prise (09:30, 10:30 ou 11:00). NULL si le forçage porte sur le statut d''un chien.';

commit;
