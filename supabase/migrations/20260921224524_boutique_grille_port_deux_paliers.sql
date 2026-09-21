-- Boutique en ligne : la grille des frais de port passe à deux paliers.
--
--   jusqu'à 2 kg  →  9.00
--   jusqu'à 10 kg → 12.00
--
-- Elle remplace la grille à quatre paliers (1 kg 9.– / 2 kg 11.– / 5 kg 14.– /
-- 10 kg 20.–). Même format qu'avant — celui que lit fraisPort, un tableau
-- [{jusqu_a_grammes, prix}] trié par poids croissant — : il n'y a qu'un format.
--
-- poids_max_colis_grammes ne change pas : 10 000. Le dernier palier l'atteint
-- exactement, comme l'exigera désormais l'écran Réglages → Boutique : aucun
-- colis entre le dernier palier et le maximum ne reste sans tarif.
--
-- Le changement est tracé au journal, comme le seront ceux faits par l'écran :
-- la grille d'avant y reste lisible. Aucune commande confirmée ne bouge — ses
-- frais de port sont figés dans commandes.frais_port.

with avant as (
  select id, valeur from public.parametres where cle = 'frais_port_grille'
),
maj as (
  update public.parametres
     set valeur = '[{"jusqu_a_grammes":2000,"prix":9},{"jusqu_a_grammes":10000,"prix":12}]',
         updated_at = now()
   where cle = 'frais_port_grille'
  returning id, valeur
)
insert into public.journal_evenements (entite, entite_id, evenement, avant, apres, motif)
select 'parametre', maj.id, 'frais_port_grille',
       jsonb_build_object('valeur', avant.valeur),
       jsonb_build_object('valeur', maj.valeur),
       'Grille ramenée à deux paliers : 2 kg → 9.–, 10 kg → 12.– (migration du 22 septembre 2026).'
  from maj, avant;