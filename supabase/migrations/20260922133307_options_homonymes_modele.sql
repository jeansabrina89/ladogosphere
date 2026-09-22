-- Un article rattaché à un modèle ne redéfinit pas un groupe d'options du
-- même nom que le modèle : il le cumulerait au lieu de le préciser. C'est ce
-- qui affichait « Largeur » en double sur le collier 23 (sept largeurs du
-- modèle « Gamme BioTHane », puis les sept mêmes portées par l'article).
--
-- Deux parties :
--   1. La reprise du collier 23 : le groupe « Largeur » de l'article part, celui
--      du modèle reste, et sa valeur « 50 » devient « 50 mm ».
--   2. La contrainte : deux triggers refusent désormais l'homonymie, à la
--      création ou au renommage d'un groupe comme au rattachement d'un modèle.
--
-- Les noms se comparent comme dans l'application (nomNormalise) : espaces en
-- trop et casse ignorés — « Largeur », « largeur » et « Largeur  » sont le
-- même groupe.

-- ── 1. Reprise du collier 23 ──────────────────────────────────────────────

do $reprise$
declare
  v_article constant uuid := 'aa3f80a0-7213-4255-b3ab-ebed65667632';  -- collier 23
  v_groupe_article constant uuid := 'e3ca0211-e39c-4038-b1d3-6da65c7f38f7';
  v_groupe_modele constant uuid := '0d8bb4ec-e4d9-4c65-a403-10693f8c5894';
  v_manquant text;
begin
  -- Les deux groupes sont bien ceux qu'on croit.
  if not exists (select 1 from public.options_groupes
                  where id = v_groupe_article and article_id = v_article and nom = 'Largeur')
     or not exists (select 1 from public.options_groupes g
                      join public.article_modeles am on am.modele_id = g.modele_id
                     where g.id = v_groupe_modele and am.article_id = v_article and g.nom = 'Largeur') then
    raise exception 'Reprise collier 23 : les groupes « Largeur » attendus ont changé, rien n''est fait.';
  end if;

  -- Rien ne pointe, par identifiant, vers le groupe de l'article ou ses valeurs.
  if exists (select 1 from public.options_dependances d
               join public.options_valeurs v on v.id in (d.valeur_id, d.valeur_requise_id)
              where v.groupe_id = v_groupe_article)
     or exists (select 1 from public.options_groupes
                 where depend_de_groupe_id = v_groupe_article or mesure_groupe_id = v_groupe_article) then
    raise exception 'Reprise collier 23 : le groupe « Largeur » de l''article est référencé, rien n''est fait.';
  end if;

  -- La valeur « 50 » du modèle prend le libellé de l'article.
  update public.options_valeurs
     set libelle = '50 mm'
   where groupe_id = v_groupe_modele and libelle = '50';
  if not found then
    raise exception 'Reprise collier 23 : la valeur « 50 » du modèle est introuvable, rien n''est fait.';
  end if;

  -- Chaque libellé de l'article a son équivalent dans le modèle.
  select string_agg(v.libelle, ', ') into v_manquant
    from public.options_valeurs v
   where v.groupe_id = v_groupe_article
     and not exists (select 1 from public.options_valeurs m
                      where m.groupe_id = v_groupe_modele and m.libelle = v.libelle);
  if v_manquant is not null then
    raise exception 'Reprise collier 23 : sans équivalent dans le modèle — %.', v_manquant;
  end if;

  -- Les commandes et paniers citent leurs choix en texte : chaque « Largeur »
  -- cité pour cet article doit exister, au libellé près, dans le modèle.
  select string_agg(distinct x.libelle, ', ') into v_manquant
    from (
      select c.valeur_libelle as libelle
        from public.commandes_choix c
        join public.commandes_personnalisees cp on cp.id = c.commande_id
       where cp.article_id = v_article and c.groupe_nom = 'Largeur'
      union all
      select e->>'valeur_libelle'
        from public.commandes_lignes l
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(l.configuration) = 'array' then l.configuration else '[]'::jsonb end) e
       where l.article_id = v_article and e->>'groupe_nom' = 'Largeur'
    ) x
   where not exists (select 1 from public.options_valeurs m
                      where m.groupe_id = v_groupe_modele and m.libelle = x.libelle);
  if v_manquant is not null then
    raise exception 'Reprise collier 23 : une commande cite une largeur absente du modèle — %.', v_manquant;
  end if;

  -- Le groupe de l'article part ; ses sept valeurs le suivent (cascade).
  delete from public.options_groupes where id = v_groupe_article;
end
$reprise$;

-- ── 2. La contrainte ──────────────────────────────────────────────────────

-- Un groupe créé ou renommé : sur un article, il ne reprend pas le nom d'un
-- groupe d'un modèle attaché ; sur un modèle, celui d'un groupe d'un article
-- qui l'a attaché.
create or replace function public.verifier_groupe_homonyme()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_nom  text := lower(btrim(regexp_replace(new.nom, '\s+', ' ', 'g')));
  v_qui  text;
  v_quoi text;
begin
  if new.article_id is not null then
    select m.nom, g.nom into v_qui, v_quoi
      from public.article_modeles am
      join public.modeles_options m on m.id = am.modele_id
      join public.options_groupes g on g.modele_id = am.modele_id
     where am.article_id = new.article_id
       and lower(btrim(regexp_replace(g.nom, '\s+', ' ', 'g'))) = v_nom
     order by am.ordre
     limit 1;
    if found then
      raise exception 'Le modèle « % » porte déjà un groupe « % ». Modifiez-le sur le modèle, ou détachez l''article du modèle.',
        v_qui, v_quoi;
    end if;
  elsif new.modele_id is not null then
    select a.nom, g.nom into v_qui, v_quoi
      from public.article_modeles am
      join public.articles a on a.id = am.article_id
      join public.options_groupes g on g.article_id = am.article_id
     where am.modele_id = new.modele_id
       and lower(btrim(regexp_replace(g.nom, '\s+', ' ', 'g'))) = v_nom
     order by a.nom
     limit 1;
    if found then
      raise exception 'L''article « % », rattaché à ce modèle, porte déjà un groupe « % ». Supprimez-le de l''article, ou détachez l''article du modèle.',
        v_qui, v_quoi;
    end if;
  end if;
  return new;
end;
$function$;

revoke execute on function public.verifier_groupe_homonyme() from public, anon, authenticated;
grant execute on function public.verifier_groupe_homonyme() to service_role;

create trigger options_groupes_homonyme
  before insert or update of nom, article_id, modele_id on public.options_groupes
  for each row execute function public.verifier_groupe_homonyme();

-- Un modèle attaché à un article qui porte déjà un groupe du même nom : refusé,
-- avec la liste de tous les groupes en conflit.
create or replace function public.verifier_rattachement_homonyme()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_modele   text;
  v_conflits text;
  v_nombre   integer;
begin
  select string_agg('« ' || a.nom || ' »', ', ' order by a.ordre), count(*)
    into v_conflits, v_nombre
    from public.options_groupes a
   where a.article_id = new.article_id
     and exists (select 1 from public.options_groupes m
                  where m.modele_id = new.modele_id
                    and lower(btrim(regexp_replace(m.nom, '\s+', ' ', 'g')))
                      = lower(btrim(regexp_replace(a.nom, '\s+', ' ', 'g'))));
  if v_nombre > 0 then
    select nom into v_modele from public.modeles_options where id = new.modele_id;
    if v_nombre > 1 then
      raise exception 'Le modèle « % » ne peut pas être attaché : l''article porte déjà des groupes du même nom — %. Supprimez-les de l''article, ou modifiez le modèle.',
        v_modele, v_conflits;
    end if;
    raise exception 'Le modèle « % » ne peut pas être attaché : l''article porte déjà un groupe du même nom — %. Supprimez-le de l''article, ou modifiez le modèle.',
      v_modele, v_conflits;
  end if;
  return new;
end;
$function$;

revoke execute on function public.verifier_rattachement_homonyme() from public, anon, authenticated;
grant execute on function public.verifier_rattachement_homonyme() to service_role;

create trigger article_modeles_homonyme
  before insert or update of article_id, modele_id on public.article_modeles
  for each row execute function public.verifier_rattachement_homonyme();