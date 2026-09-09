-- Une chaîne matière → largeur → coloris s'étend d'un modèle à l'article :
-- le modèle apporte la matière et la largeur, l'article ajoute ses coloris.
-- On ouvre donc la dépendance CROISÉE, dans un seul sens :
--
--   groupe d'ARTICLE  →  groupe d'un MODÈLE ATTACHÉ À CET ARTICLE   : permis
--   groupe de MODÈLE  →  groupe d'un article                        : refusé
--
-- Le sens inverse rendrait le modèle inutilisable ailleurs : il ne serait plus
-- réutilisable, il serait accroché à un article. La comparaison des ordres ne
-- vaut que dans une même source ; entre sources, la résolution place toujours
-- les modèles avant les groupes propres, l'ordre est donc acquis.

create or replace function public.dependance_croisee_permise(
  p_enfant public.options_groupes, p_parent public.options_groupes)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p_enfant.article_id is not null
     and p_parent.modele_id  is not null
     and exists (
       select 1 from public.article_modeles am
        where am.article_id = p_enfant.article_id
          and am.modele_id  = p_parent.modele_id);
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

  v_croise := public.dependance_croisee_permise(new, v_parent);

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

  v_croise := public.dependance_croisee_permise(v_groupe, v_requis);

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

-- Détacher un modèle dont un groupe propre dépend laisserait ce groupe
-- orphelin : la dépendance pointerait dans le vide. On refuse le détachement,
-- l'écran dit quoi retirer d'abord.
create or replace function public.verifier_detachement_modele()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_nom text;
begin
  select ge.nom into v_nom
    from public.options_groupes ge
    join public.options_groupes gp on gp.id = ge.depend_de_groupe_id
   where ge.article_id = old.article_id
     and gp.modele_id  = old.modele_id
   limit 1;

  if v_nom is not null then
    raise exception '« % » dépend d''une question de ce modèle : retirez d''abord cette dépendance.', v_nom;
  end if;
  return old;
end;
$function$;

drop trigger if exists trg_detachement_modele on public.article_modeles;
create trigger trg_detachement_modele
  before delete on public.article_modeles
  for each row execute function public.verifier_detachement_modele();