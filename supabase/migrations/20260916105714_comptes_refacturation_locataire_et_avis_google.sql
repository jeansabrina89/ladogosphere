-- Deux comptes de produits pour ce qu'on refacture à un locataire de box, et le
-- réglage du lien d'avis Google.
--
-- ALIMENTATION ET VÉTÉRINAIRE REFACTURÉS
--
-- Sur la facture d'un locataire, Sabrina ajoute des lignes libres : la
-- nourriture qu'elle a achetée pour le chien, une consultation qu'elle a
-- avancée. Ce ne sont pas des ventes de la boutique (3200, marchandises en
-- stock) : ce sont des prestations annexes, qui ne font que transiter.
--
-- Ils rejoignent donc la série 302x, à côté de 3020 (prestations annexes) et
-- de 3021 (loyers de box refacturés), sur des comptes distincts : un montant
-- qui transite doit rester lisible comme tel, sans se mêler au chiffre
-- d'affaires des services rendus. « Autre prestation » reste sur 3020.
--
-- LIEN D'AVIS GOOGLE
--
-- Une clé de plus dans la table clé/valeur, vide par défaut. Tant qu'elle est
-- vide, aucun e-mail ne change.

begin;

insert into public.comptes (numero, libelle, type, actif)
values
  ('3022', 'Alimentation refacturée', 'produit', true),
  ('3023', 'Frais vétérinaires refacturés', 'produit', true)
on conflict (numero) do nothing;

insert into public.parametres (cle, valeur, description)
values (
  'avis_google_url',
  '',
  'Lien pour donner un avis Google, affiché au pied de chaque e-mail. Vide : rien n''est affiché.'
)
on conflict (cle) do nothing;

commit;