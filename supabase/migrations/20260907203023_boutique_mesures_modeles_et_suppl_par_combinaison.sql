-- Trois nouvelles catégories, un type de groupe « mesure », une bibliothèque
-- de modèles d'options, et un supplément propre à chaque combinaison.
-- Rien ne change pour les articles déjà configurés.

-- ── A. Catégories ───────────────────────────────────────────────────────────

alter table public.articles drop constraint if exists articles_categorie_check;
alter table public.articles
  add constraint articles_categorie_check
  check (categorie in (
    'alimentation','friandises','litiere',
    'colliers','laisses','harnais','muselieres','longes',
    'jouets','peluches','couchages','soins','medaillons_accessoires','divers'));

-- ── B. Le type « mesure » ───────────────────────────────────────────────────

alter table public.options_groupes drop constraint if exists options_groupes_type_check;
alter table public.options_groupes
  add constraint options_groupes_type_check
  check (type in ('liste','couleur','texte','booleen','mesure'));

alter table public.options_groupes
  add column if not exists unite               text default 'cm',
  add column if not exists valeur_min          numeric,
  add column if not exists valeur_max          numeric,
  add column if not exists pas                 numeric default 0.5,
  add column if not exists guide_image_path    text,
  add column if not exists alerte_min          numeric,
  add column if not exists alerte_max          numeric,
  add column if not exists seuil_supplement    numeric,
  add column if not exists supplement_au_dela  numeric not null default 0;

comment on column public.options_groupes.valeur_min is
  'Borne qui REFUSE la saisie. alerte_min, plus étroite, se contente d''avertir.';
comment on column public.options_groupes.alerte_min is
  'Borne de vraisemblance : on avertit, on ne bloque pas. Un chihuahua existe.';

alter table public.commandes_choix
  add column if not exists valeur_nombre numeric,
  add column if not exists unite         text;

comment on column public.commandes_choix.valeur_nombre is
  'Mesure figée au moment de la commande, avec son unité. « Tour de cou : 38 cm ».';

-- ── C bis. Supplément par combinaison ───────────────────────────────────────

alter table public.options_dependances
  add column if not exists supplement_prix numeric;

comment on column public.options_dependances.supplement_prix is
  'Supplément propre à cette combinaison. NULL : on retombe sur celui de la valeur. 0 explicite est une valeur, pas une absence.';

-- ── C. Bibliothèque de modèles ──────────────────────────────────────────────

create table if not exists public.modeles_options (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  description text,
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.modeles_options is
  'Gamme réutilisable : ses groupes, ses valeurs et ses dépendances voyagent ensemble. Le lien avec un article est VIVANT — les commandes, elles, figent leurs choix.';

create table if not exists public.article_modeles (
  article_id uuid not null references public.articles(id) on delete cascade,
  modele_id  uuid not null references public.modeles_options(id) on delete restrict,
  ordre      integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (article_id, modele_id)
);

create index if not exists article_modeles_modele_idx on public.article_modeles (modele_id);

-- Un groupe appartient soit à un article, soit à un modèle. Jamais aux deux.
alter table public.options_groupes
  add column if not exists modele_id uuid references public.modeles_options(id) on delete cascade;

alter table public.options_groupes alter column article_id drop not null;

alter table public.options_groupes drop constraint if exists options_groupes_proprietaire_check;
alter table public.options_groupes
  add constraint options_groupes_proprietaire_check
  check (num_nonnulls(article_id, modele_id) = 1);

create index if not exists options_groupes_modele_idx on public.options_groupes (modele_id, ordre);

-- ── Cohérence : le propriétaire, article ou modèle ──────────────────────────

create or replace function public.proprietaire_groupe(p_groupe uuid)
returns text
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(article_id::text, modele_id::text)
    from public.options_groupes where id = p_groupe;
$$;

create or replace function public.verifier_dependance_groupe()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare v_parent record;
begin
  if new.depend_de_groupe_id is null then return new; end if;

  if new.depend_de_groupe_id = new.id then
    raise exception 'Un groupe ne dépend pas de lui-même.';
  end if;

  select * into v_parent from public.options_groupes where id = new.depend_de_groupe_id;
  if not found then
    raise exception 'Le groupe dont celui-ci dépend n''existe pas.';
  end if;
  if coalesce(v_parent.article_id, v_parent.modele_id)
     is distinct from coalesce(new.article_id, new.modele_id) then
    raise exception 'Un groupe ne peut dépendre que d''un groupe du même article ou du même modèle.';
  end if;
  if v_parent.ordre >= new.ordre then
    raise exception '« % » dépend de « % » : il doit rester après lui.', new.nom, v_parent.nom;
  end if;
  if v_parent.depend_de_groupe_id = new.id then
    raise exception 'Ces deux groupes dépendraient l''un de l''autre.';
  end if;

  return new;
end;
$$;

create or replace function public.verifier_dependance_valeur()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_groupe  record;
  v_requis  record;
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
  if coalesce(v_groupe.article_id, v_groupe.modele_id)
     is distinct from coalesce(v_requis.article_id, v_requis.modele_id) then
    raise exception 'Une dépendance ne relie que des options du même article ou du même modèle.';
  end if;
  if v_groupe.id = v_requis.id then
    raise exception 'Une option ne dépend pas d''une option du même groupe.';
  end if;
  if v_requis.ordre >= v_groupe.ordre then
    raise exception 'Une option ne peut dépendre que d''une question posée avant elle.';
  end if;

  return new;
end;
$$;

-- Réordonnancement d'un modèle, comme pour un article : tout en une fois.
create or replace function public.ordonner_groupes_modele(
  p_modele_id uuid,
  p_ids       uuid[]
) returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  update public.options_groupes g
     set ordre = t.rang
    from (select unnest(p_ids) as id, generate_subscripts(p_ids, 1) as rang) t
   where g.id = t.id and g.modele_id = p_modele_id;
end;
$$;

-- ── Duplication : d'un article ou d'un modèle vers l'un ou l'autre ──────────

create or replace function public.dupliquer_options(
  p_source_article uuid,
  p_source_modele  uuid,
  p_cible_article  uuid,
  p_cible_modele   uuid
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_g        record;
  v_nouveau  uuid;
  v_ordre    int;
  v_groupes  int := 0;
  v_valeurs  int := 0;
  v_n        int;
  -- Les identifiants d'origine et leurs copies, pour rejouer les dépendances.
  v_corres   jsonb := '{}'::jsonb;
begin
  if num_nonnulls(p_source_article, p_source_modele) <> 1
     or num_nonnulls(p_cible_article, p_cible_modele) <> 1 then
    raise exception 'Il faut exactement une source et une cible.';
  end if;
  if p_source_article is not null and p_source_article = p_cible_article then
    raise exception 'La source et la cible sont le même article.';
  end if;
  if p_source_modele is not null and p_source_modele = p_cible_modele then
    raise exception 'La source et la cible sont le même modèle.';
  end if;

  select coalesce(max(ordre), 0) into v_ordre
    from public.options_groupes
   where article_id is not distinct from p_cible_article
     and modele_id  is not distinct from p_cible_modele;

  for v_g in
    select * from public.options_groupes
     where article_id is not distinct from p_source_article
       and modele_id  is not distinct from p_source_modele
     order by ordre, created_at
  loop
    v_ordre := v_ordre + 1;
    insert into public.options_groupes
      (article_id, modele_id, nom, type, obligatoire, ordre, aide, max_caracteres,
       unite, valeur_min, valeur_max, pas, guide_image_path, alerte_min, alerte_max,
       seuil_supplement, supplement_au_dela)
    values
      (p_cible_article, p_cible_modele, v_g.nom, v_g.type, v_g.obligatoire, v_ordre,
       v_g.aide, v_g.max_caracteres, v_g.unite, v_g.valeur_min, v_g.valeur_max, v_g.pas,
       v_g.guide_image_path, v_g.alerte_min, v_g.alerte_max, v_g.seuil_supplement,
       v_g.supplement_au_dela)
    returning id into v_nouveau;

    v_corres := v_corres || jsonb_build_object(v_g.id::text, v_nouveau::text);
    v_groupes := v_groupes + 1;

    -- Les valeurs, avec leur correspondance pour les dépendances.
    with copiees as (
      insert into public.options_valeurs
        (groupe_id, libelle, image_path, code_couleur, supplement_prix,
         supplement_delai_jours, composant_article_id, composant_quantite, actif, ordre, defaut)
      select v_nouveau, libelle, image_path, code_couleur, supplement_prix,
             supplement_delai_jours, composant_article_id, composant_quantite, actif, ordre, defaut
        from public.options_valeurs where groupe_id = v_g.id
      returning id, libelle, ordre
    )
    select count(*) into v_n from copiees;
    v_valeurs := v_valeurs + v_n;
  end loop;

  -- Les liens de parenté entre groupes, rejoués sur les copies.
  update public.options_groupes c
     set depend_de_groupe_id = (v_corres->>(o.depend_de_groupe_id::text))::uuid
    from public.options_groupes o
   where o.article_id is not distinct from p_source_article
     and o.modele_id  is not distinct from p_source_modele
     and o.depend_de_groupe_id is not null
     and c.id = (v_corres->>(o.id::text))::uuid;

  -- Les dépendances entre valeurs, retrouvées par (groupe copié, libellé).
  insert into public.options_dependances (valeur_id, valeur_requise_id, supplement_prix)
  select cv.id, cr.id, d.supplement_prix
    from public.options_dependances d
    join public.options_valeurs ov on ov.id = d.valeur_id
    join public.options_valeurs orq on orq.id = d.valeur_requise_id
    join public.options_groupes gv on gv.id = ov.groupe_id
    join public.options_groupes gr on gr.id = orq.groupe_id
    join public.options_valeurs cv
      on cv.groupe_id = (v_corres->>(gv.id::text))::uuid and cv.libelle = ov.libelle
    join public.options_valeurs cr
      on cr.groupe_id = (v_corres->>(gr.id::text))::uuid and cr.libelle = orq.libelle
   where gv.article_id is not distinct from p_source_article
     and gv.modele_id  is not distinct from p_source_modele
  on conflict (valeur_id, valeur_requise_id) do nothing;

  return jsonb_build_object('groupes', v_groupes, 'valeurs', v_valeurs);
end;
$function$;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.modeles_options enable row level security;
alter table public.article_modeles enable row level security;

do $$
declare t text;
begin
  foreach t in array array['modeles_options','article_modeles'] loop
    execute format('drop policy if exists "%s lecture personnel" on public.%I', t, t);
    execute format('create policy "%s lecture personnel" on public.%I for select to authenticated using (public.is_personnel())', t, t);
    execute format('drop policy if exists "%s ecriture boutique" on public.%I', t, t);
    execute format('create policy "%s ecriture boutique" on public.%I for insert to authenticated with check (public.peut_boutique())', t, t);
    execute format('drop policy if exists "%s maj boutique" on public.%I', t, t);
    execute format('create policy "%s maj boutique" on public.%I for update to authenticated using (public.peut_boutique()) with check (public.peut_boutique())', t, t);
    execute format('drop policy if exists "%s suppression boutique" on public.%I', t, t);
    execute format('create policy "%s suppression boutique" on public.%I for delete to authenticated using (public.peut_boutique())', t, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

drop policy if exists "options_dependances maj boutique" on public.options_dependances;
create policy "options_dependances maj boutique" on public.options_dependances
  for update to authenticated using (public.peut_boutique()) with check (public.peut_boutique());