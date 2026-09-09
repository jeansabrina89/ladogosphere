/**
 * La base du décompte : les contre-prestations CONVENUES par défaut.
 *
 * C'est le principe légal, et c'est déjà ce que fait le décompte — il agrège
 * par date de facture. Le réglage doit décrire la réalité, pas la contredire.
 *
 * Décompter sur les contre-prestations reçues exige une autorisation de l'AFC :
 * le choix reste possible, mais il s'accompagne d'un avertissement, et le
 * calcul, lui, ne change pas tant que l'autorisation n'est pas obtenue.
 */
alter table public.parametres_tva alter column base_decompte set default 'convenues';

-- La valeur en place venait du défaut d'origine, sans que personne l'ait
-- décidée : on la remet sur ce que l'application applique réellement.
update public.parametres_tva
   set base_decompte = 'convenues'
 where base_decompte = 'recues';

comment on column public.parametres_tva.base_decompte is
  'Contre-prestations convenues (à la facture, le principe légal et ce que le décompte applique) ou reçues (à l''encaissement, sur autorisation de l''AFC seulement).';