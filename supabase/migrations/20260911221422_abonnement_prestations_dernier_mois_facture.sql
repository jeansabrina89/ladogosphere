-- Un forfait ne se facture qu'une fois par mois.
--
-- Les prestations à l'acte sont déjà protégées : `taches_prestations.facture_id`
-- marque celles qui sont parties, et elles ne reviennent pas le mois suivant.
-- Le FORFAIT, lui, ne s'appuie sur aucune tâche — il ne portait donc aucune
-- marque, et rouvrir l'écran de facturation le reproposait indéfiniment.
--
-- Le défaut s'est vu au premier parcours : après émission, la ligne de forfait
-- réapparaissait, prête à être facturée une seconde fois. C'est le genre
-- d'erreur qu'on ne découvre qu'au moment où un client la signale.

begin;

alter table public.abonnements_prestations
  add column if not exists dernier_mois_facture text;

comment on column public.abonnements_prestations.dernier_mois_facture is
  'Dernier mois « AAAA-MM » déjà facturé pour ce forfait. Empêche de le facturer deux fois.';

alter table public.abonnements_prestations
  drop constraint if exists abo_prestations_mois_facture_format;
alter table public.abonnements_prestations
  add constraint abo_prestations_mois_facture_format
  check (dernier_mois_facture is null or dernier_mois_facture ~ '^\d{4}-\d{2}$');

commit;