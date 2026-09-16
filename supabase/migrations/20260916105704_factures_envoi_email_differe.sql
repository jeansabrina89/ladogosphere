-- Une facture ne part plus par e-mail à son émission.
--
-- Jusqu'ici, émettre une facture l'envoyait aussitôt. Désormais l'émission
-- produit le document (PDF, dépôt, trace) et rien d'autre ; l'e-mail part le
-- lendemain matin si la facture est encore impayée, ou à la main depuis
-- l'écran. Deux colonnes portent ce qui se décide alors.
--
-- `email_envoye_le` : le dernier envoi RÉUSSI. Posé par l'envoi lui-même, jamais
-- par une tentative qui échoue. Tant qu'il est null, la facture n'est jamais
-- arrivée chez le client — c'est ce qui permet à l'envoi du matin de rattraper
-- aussi bien un oubli qu'un envoi manuel tombé en erreur.
--
-- `envoi_auto_exclu` : la facture ne partira JAMAIS d'elle-même. Posé sur les
-- factures qui ont leur propre chemin : celles des locataires de box, que
-- Sabrina compose et envoie à la main, et celles d'une commande en ligne dont
-- le PDF est déjà parti avec la confirmation.

begin;

alter table public.factures
  add column email_envoye_le timestamptz null,
  add column envoi_auto_exclu boolean not null default false;

comment on column public.factures.email_envoye_le is
  'Dernier envoi réussi de la facture par e-mail. Null : jamais arrivée chez le client.';
comment on column public.factures.envoi_auto_exclu is
  'Vrai : l''envoi du matin ne touche jamais cette facture (locataire de box, commande dont le PDF est déjà parti).';

-- Les factures déjà envoyées sous l'ancien régime le sont vraiment : sans ce
-- rattrapage, la colonne mentirait dès le premier jour et l'envoi du matin
-- réexpédierait une facture que le client a déjà reçue. Le journal garde une
-- trace `envoi` par envoi réussi : c'est elle qui fait foi.
update public.factures f
set email_envoye_le = j.dernier_envoi
from (
  select entite_id, max(created_at) as dernier_envoi
  from public.journal_evenements
  where entite = 'facture' and evenement = 'envoi'
  group by entite_id
) j
where f.id = j.entite_id;

commit;