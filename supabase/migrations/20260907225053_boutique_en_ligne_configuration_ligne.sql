-- Un article configuré mis au panier n'est pas encore une commande d'atelier :
-- il ne doit pas apparaître en fabrication tant que le client n'a pas validé.
-- Ses choix figés attendent donc ici, et commandes_personnalisees n'est créée
-- qu'à la confirmation — c'est elle qui remplit commande_personnalisee_id.
alter table public.commandes_lignes
  add column if not exists configuration jsonb;

comment on column public.commandes_lignes.configuration is
  'Choix figés d''un article personnalisable, en attente de confirmation. Null une fois commande_personnalisee_id renseigné.';