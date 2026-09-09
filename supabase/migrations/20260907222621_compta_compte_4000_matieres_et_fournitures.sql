-- Ce qu'on TRANSFORME (sangle, boucles, rivets, puces, fil) n'est pas ce qu'on
-- REVEND tel quel. Les deux étaient jusqu'ici confondus sur 4200, ce qui rend
-- la marge de la boutique illisible : le coût d'un collier fabriqué s'y
-- mélangeait au prix d'achat d'un jouet revendu.
--
-- 4000 est le compte des matières et fournitures dans le plan comptable suisse
-- PME ; il se place naturellement à côté de 4200. Vérifié avant création :
-- aucun compte 40xx n'existait, sous ce libellé ni sous un autre.
insert into public.comptes (numero, libelle, type, actif)
values ('4000', 'Achats de matières et fournitures', 'charge', true)
on conflict (numero) do nothing;