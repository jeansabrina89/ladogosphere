-- APP 14b — Découper « encaissements » en deux gestes distincts.
--
-- perm_encaissements gardait deux métiers sous un seul nom : le GESTE AU
-- COMPTOIR (encaisser, créer un avoir, enregistrer une adhésion) et le TRAVAIL
-- ADMINISTRATIF (la liste des factures, les relances, l'émission d'une facture
-- libre). Le second n'a rien à faire entre les mains d'une employée qui rend un
-- chien : il ouvrait tout le carnet de factures de la pension.
--
-- Reprise volontairement ASYMÉTRIQUE : personne ne gagne d'accès. Qui avait
-- perm_encaissements le garde, et reçoit perm_factures = false. Certaines
-- employées perdent donc la liste des factures — c'est l'objet de la migration.

alter table public.profiles
  add column if not exists perm_factures boolean not null default false;

comment on column public.profiles.perm_factures is
  'Travail administratif de facturation : liste des factures, relances, émission d''une facture libre. Distincte de perm_encaissements, qui est le geste au comptoir.';

comment on column public.profiles.perm_encaissements is
  'Geste au comptoir : encaisser un paiement, créer un avoir, enregistrer une adhésion ou un abonnement. Ne donne PAS accès à la liste des factures — voir perm_factures.';