-- Vendre et gérer ne sont pas le même métier. Une vendeuse au comptoir encaisse,
-- rend, prépare des commandes ; elle n'a rien à faire dans les prix d'achat ni
-- dans l'inventaire — et n'a pas à porter la responsabilité d'y toucher.
alter table public.profiles
  add column if not exists perm_boutique_vente boolean not null default false,
  add column if not exists perm_boutique_gestion boolean not null default false;

-- Reprise : qui avait la boutique reçoit les deux. Au moment de ce passage,
-- aucun profil ne portait perm_boutique — la reprise ne déplace donc rien,
-- mais elle doit exister pour le jour où ce ne serait plus vrai.
update public.profiles
   set perm_boutique_vente = true, perm_boutique_gestion = true
 where perm_boutique is true;

comment on column public.profiles.perm_boutique_vente is
  'Caisse, ventes et retours, catalogue en lecture, commandes sur mesure et en ligne.';
comment on column public.profiles.perm_boutique_gestion is
  'Articles, options, modèles, inventaire, entrées de stock, prix d''achat. Implique la vente.';

-- La gestion IMPLIQUE la vente : un profil qui aurait la gestion sans la vente
-- est traité comme ayant les deux. La règle vit ici comme dans le code, pour
-- que RLS et écrans disent exactement la même chose.
create or replace function public.peut_boutique()
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
      and (role = 'admin'
           or (role = 'employe' and (perm_boutique_vente or perm_boutique_gestion)))
  );
$function$;

/** Réservé à la gestion : articles, options, modèles, inventaire, prix d'achat. */
create or replace function public.peut_boutique_gestion()
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
      and (role = 'admin' or (role = 'employe' and perm_boutique_gestion))
  );
$function$;