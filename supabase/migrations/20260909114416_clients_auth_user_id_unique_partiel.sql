-- L'index des comptes clients : le dépôt reproduit celui de la production.
--
-- Le fichier du 9 septembre (20260909110621) crée un index unique ORDINAIRE :
--
--     create unique index if not exists clients_auth_user_id_unique
--       on public.clients (auth_user_id);
--
-- La production, elle, porte un index PARTIEL, créé à la main le 7 septembre :
--
--     create unique index clients_auth_user_id_unique
--       on public.clients (auth_user_id) where auth_user_id is not null;
--
-- La garantie est identique : PostgreSQL tient deux NULL pour distincts, un
-- index unique ordinaire sur une colonne nullable accepte donc lui aussi
-- autant de fiches sans compte qu'on veut. Mais l'OBJET diffère — l'index
-- partiel n'indexe pas les lignes sans compte, il est plus petit — et une base
-- reconstruite depuis le dépôt n'obtenait donc pas le même. C'est la
-- production qui est la référence ; le dépôt doit la décrire, pas proposer une
-- variante qui lui ressemble.
--
-- Le fichier du 9 septembre n'est pas réécrit : une migration appliquée ne se
-- corrige pas, elle se complète par la suivante. C'est celle-ci.
--
-- Les deux instructions tiennent dans UNE transaction : il ne doit exister
-- aucun instant, si court soit-il, où deux fiches pourraient se rattacher au
-- même compte Auth. Le commentaire est reposé à l'identique — un `drop index`
-- l'emporterait avec lui, et la production ne doit rien perdre.

begin;

drop index if exists public.clients_auth_user_id_unique;

create unique index clients_auth_user_id_unique
  on public.clients (auth_user_id)
  where auth_user_id is not null;

comment on index public.clients_auth_user_id_unique is
  'Un compte Auth ne tient qu''une fiche client. Les fiches sans compte (auth_user_id null) ne sont pas concernées : deux NULL sont distincts.';

commit;