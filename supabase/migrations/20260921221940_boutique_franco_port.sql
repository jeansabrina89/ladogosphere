-- Boutique en ligne : livraison offerte à partir d'un montant d'articles.
--
-- Le paramètre franco_port_des est le seuil, en francs, à partir duquel
-- l'envoi postal ne coûte rien au client. Il se compare au montant des
-- articles APRÈS les remises de ligne (remise membre comprise) et AVANT le
-- port : c'est ce que le client paie pour la marchandise.
--
-- La table parametres est une table clé / valeur en texte, dont la valeur ne
-- peut pas être nulle. « Jamais de livraison offerte » s'y écrit donc par une
-- valeur VIDE : l'application la lit comme null. Toute autre valeur doit être
-- un nombre positif ; l'écran Réglages → Boutique n'en accepte pas d'autre.
--
-- Valeur initiale : 100 francs, décidée par Sabrina.
--
-- Rien d'autre ne change : le seuil ne rend pas expédiable ce qui ne l'est pas
-- (articles non expédiables, poids au-delà du colis maximum), et une commande
-- confirmée garde les frais de port figés dans commandes.frais_port.

insert into public.parametres (cle, valeur, description)
values (
  'franco_port_des',
  '100',
  'Livraison offerte à partir de ce montant d''articles (CHF, après remises, avant port). Vide = jamais.'
)
on conflict (cle) do nothing;