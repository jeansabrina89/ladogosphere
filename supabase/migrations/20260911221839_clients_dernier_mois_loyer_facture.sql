-- Le loyer refacturé ne se facture qu'une fois par mois.
--
-- Troisième et dernier composant d'une facture de locataire à protéger, et il
-- fallait les trois marqueurs séparés :
--
--   · les prestations à l'acte portent `taches_prestations.facture_id` ;
--   · le forfait porte `abonnements_prestations.dernier_mois_facture` ;
--   · le loyer porte celui-ci.
--
-- Un verrou unique posé sur la facture entière aurait été plus court à écrire
-- et faux : une balade ajoutée le 28, après la facture du 25, doit encore
-- pouvoir partir sur une seconde facture du même mois. Chaque composant se
-- protège donc là où il vit.

begin;

alter table public.clients
  add column if not exists dernier_mois_loyer_facture text;

comment on column public.clients.dernier_mois_loyer_facture is
  'Dernier mois « AAAA-MM » dont le loyer de box a déjà été refacturé. Empêche de le facturer deux fois.';

alter table public.clients
  drop constraint if exists clients_mois_loyer_facture_format;
alter table public.clients
  add constraint clients_mois_loyer_facture_format
  check (dernier_mois_loyer_facture is null or dernier_mois_loyer_facture ~ '^\d{4}-\d{2}$');

commit;