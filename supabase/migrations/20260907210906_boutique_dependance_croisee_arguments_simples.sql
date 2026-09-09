-- La variante précédente prenait deux lignes entières en argument, ce que
-- PL/pgSQL ne sait pas transmettre depuis un `record` : « cannot cast type
-- record to options_groupes ». On lui passe les deux identifiants, c'est tout
-- ce dont la règle a besoin.
drop function if exists public.dependance_croisee_permise(public.options_groupes, public.options_groupes);

create or replace function public.dependance_croisee_permise(
  p_article_enfant uuid, p_modele_parent uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p_article_enfant is not null
     and p_modele_parent  is not null
     and exists (
       select 1 from public.article_modeles am
        where am.article_id = p_article_enfant
          and am.modele_id  = p_modele_parent);
$function$;

create or replace function public.verifier_dependance_groupe()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_parent record;
  v_croise boolean;
begin
  if new.depend_de_groupe_id is null then return new; end if;

  if new.depend_de_groupe_id = new.id then
    raise exception 'Un groupe ne dépend pas de lui-même.';
  end if;

  select * into v_parent from public.options_groupes where id = new.depend_de_groupe_id;
  if not found then
    raise exception 'Le groupe dont celui-ci dépend n''existe pas.';
  end if;

  v_croise := public.dependance_croisee_permise(new.article_id, v_parent.modele_id);

  if not v_croise
     and coalesce(v_parent.article_id, v_parent.modele_id)
         is distinct from coalesce(new.article_id, new.modele_id) then
    raise exception 'Un groupe ne peut dépendre que d''un groupe du même article, du même modèle, ou d''un modèle attaché à cet article.';
  end if;

  -- Entre deux sources, l'ordre ne se compare pas : les modèles passent avant.
  if not v_croise and v_parent.ordre >= new.ordre then
    raise exception '« % » dépend de « % » : il doit rester après lui.', new.nom, v_parent.nom;
  end if;

  if v_parent.depend_de_groupe_id = new.id then
    raise exception 'Ces deux groupes dépendraient l''un de l''autre.';
  end if;

  return new;
end;
$function$;

create or replace function public.verifier_dependance_valeur()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_groupe  record;
  v_requis  record;
  v_croise  boolean;
begin
  select g.* into v_groupe
    from public.options_valeurs v join public.options_groupes g on g.id = v.groupe_id
   where v.id = new.valeur_id;
  select g.* into v_requis
    from public.options_valeurs v join public.options_groupes g on g.id = v.groupe_id
   where v.id = new.valeur_requise_id;

  if v_groupe.id is null or v_requis.id is null then
    raise exception 'Option introuvable.';
  end if;

  v_croise := public.dependance_croisee_permise(v_groupe.article_id, v_requis.modele_id);

  if not v_croise
     and coalesce(v_groupe.article_id, v_groupe.modele_id)
         is distinct from coalesce(v_requis.article_id, v_requis.modele_id) then
    raise exception 'Une dépendance ne relie que des options du même article, du même modèle, ou d''un modèle attaché à cet article.';
  end if;
  if v_groupe.id = v_requis.id then
    raise exception 'Une option ne dépend pas d''une option du même groupe.';
  end if;
  if not v_croise and v_requis.ordre >= v_groupe.ordre then
    raise exception 'Une option ne peut dépendre que d''une question posée avant elle.';
  end if;

  return new;
end;
$function$;