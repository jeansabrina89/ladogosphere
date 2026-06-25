-- Le reglement d'une reservation par carte d'abonnement ecrit mode_paiement='abonnement'
-- dans reservations (consommerAbonnementResa). La contrainte ne l'autorisait pas -> violation.
-- On etend la liste autorisee, comme cela avait ete fait pour 'avoir'.
alter table public.reservations
  drop constraint if exists reservations_mode_paiement_check;

alter table public.reservations
  add constraint reservations_mode_paiement_check
  check (mode_paiement = any (array['twint','cash','iban','stripe','autre','avoir','abonnement']));
