-- Deux modèles homonymes seraient impossibles à distinguer dans une liste
-- déroulante : le nom est l'identité d'un modèle, on l'impose unique.
create unique index if not exists modeles_options_nom_unique
  on public.modeles_options (lower(btrim(nom)));

-- Une valeur citée par une commande ne se supprime pas. La règle valait pour
-- les options d'un article ; elle doit valoir aussi pour celles d'un modèle,
-- où la citation se cherche à travers les articles qui l'ont attaché.
create or replace function public.options_valeurs_citees()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_article uuid;
  v_modele  uuid;
begin
  select g.article_id, g.modele_id into v_article, v_modele
    from public.options_groupes g where g.id = old.groupe_id;

  if exists (
    select 1
      from public.commandes_choix c
      join public.commandes_personnalisees cp on cp.id = c.commande_id
      join public.options_groupes g on g.id = old.groupe_id
     where c.groupe_nom = g.nom
       and c.valeur_libelle = old.libelle
       and (
         (v_article is not null and cp.article_id = v_article)
         or (v_modele is not null and exists (
               select 1 from public.article_modeles am
                where am.modele_id = v_modele
                  and am.article_id = cp.article_id))
       )
  ) then
    raise exception 'Cette option est citée par une commande : désactivez-la, elle ne se supprime pas.';
  end if;
  return old;
end;
$function$;