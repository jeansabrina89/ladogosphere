-- APP 14a — L'atelier, séparé de la boutique.
--
-- Sabrina fabrique une partie de ce qu'elle vend. Ses fournitures (sangle au
-- mètre, boucles, mousquetons, rivets, puces, fil) sont déjà distinguées par
-- articles.composant = true et comptablement par le compte 4000 ; il leur
-- manquait une porte à elles.
--
-- perm_atelier est INDÉPENDANTE des permissions boutique : on peut tenir le
-- stock du magasin sans toucher aux fournitures de fabrication, et l'inverse.
-- Aucune permission existante n'est modifiée ici.

alter table public.profiles
  add column if not exists perm_atelier boolean not null default false;

comment on column public.profiles.perm_atelier is
  'Atelier : les fournitures de fabrication, leur inventaire et leurs entrées de stock. Indépendante des permissions boutique.';

-- Même mécanisme que peut_boutique_gestion(), peut_depenses(), etc. : le rôle
-- d'abord, la permission ensuite, et jamais un profil inactif.
create or replace function public.peut_atelier()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and actif is not false
      and (role = 'admin' or (role = 'employe' and perm_atelier))
  );
$function$;

comment on function public.peut_atelier() is
  'Vrai si le profil connecté a accès à l''atelier (admin, ou employé portant perm_atelier).';