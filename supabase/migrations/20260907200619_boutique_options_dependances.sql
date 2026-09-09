-- Dépendances entre options : un coloris peut n'exister qu'en 19 mm.
--
-- Un groupe déclare UN parent, jamais plusieurs : on garde une chaîne
-- lisible, pas un arbre. Et une option ne peut dépendre que d'une question
-- posée avant elle — l'ordre des groupes fait foi.

alter table public.options_groupes
  add column if not exists depend_de_groupe_id uuid
    references public.options_groupes(id) on delete set null;

comment on column public.options_groupes.depend_de_groupe_id is
  'Groupe parent, d''ordre inférieur et du même article. Null : le groupe ne dépend de rien.';

create table if not exists public.options_dependances (
  id                uuid primary key default gen_random_uuid(),
  valeur_id         uuid not null references public.options_valeurs(id) on delete cascade,
  valeur_requise_id uuid not null references public.options_valeurs(id) on delete cascade,
  created_at        timestamptz not null default now(),
  unique (valeur_id, valeur_requise_id)
);

create index if not exists options_dependances_valeur_idx  on public.options_dependances (valeur_id);
create index if not exists options_dependances_requise_idx on public.options_dependances (valeur_requise_id);

comment on table public.options_dependances is
  'Une valeur sans aucune ligne est toujours disponible. Avec des lignes, elle exige qu''AU MOINS UNE de ses valeurs requises soit choisie — un OU, pas un ET.';

-- ── Garde-fous ──────────────────────────────────────────────────────────────

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
  if v_parent.article_id <> new.article_id then
    raise exception 'Un groupe ne peut dépendre que d''un groupe du même article.';
  end if;
  if v_parent.ordre >= new.ordre then
    raise exception '« % » dépend de « % » : il doit rester après lui.', new.nom, v_parent.nom;
  end if;
  -- Une chaîne, pas un arbre : le parent n'a pas lui-même de parent qui
  -- reboucle. Un seul niveau de remontée suffit à l'interdire.
  if v_parent.depend_de_groupe_id = new.id then
    raise exception 'Ces deux groupes dépendraient l''un de l''autre.';
  end if;

  return new;
end;
$$;

-- Contrainte DIFFÉRÉE : un réordonnancement passe par plusieurs lignes, et
-- n'est cohérent qu'une fois toutes écrites. On vérifie au COMMIT.
drop trigger if exists options_groupes_dependance on public.options_groupes;
create constraint trigger options_groupes_dependance
  after insert or update on public.options_groupes
  deferrable initially deferred
  for each row execute function public.verifier_dependance_groupe();

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
  if v_groupe.article_id <> v_requis.article_id then
    raise exception 'Une dépendance ne relie que des options du même article.';
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

drop trigger if exists options_dependances_coherentes on public.options_dependances;
create trigger options_dependances_coherentes
  before insert on public.options_dependances
  for each row execute function public.verifier_dependance_valeur();

-- ── Réordonnancement en une transaction ─────────────────────────────────────
-- Écrire les ordres un par un ferait échouer la contrainte sur un état
-- intermédiaire pourtant valide. Tout part ensemble.
create or replace function public.ordonner_groupes_options(
  p_article_id uuid,
  p_ids        uuid[]
) returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  update public.options_groupes g
     set ordre = t.rang
    from (select unnest(p_ids) as id, generate_subscripts(p_ids, 1) as rang) t
   where g.id = t.id and g.article_id = p_article_id;
end;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.options_dependances enable row level security;

drop policy if exists "options_dependances lecture personnel" on public.options_dependances;
create policy "options_dependances lecture personnel" on public.options_dependances
  for select to authenticated using (public.is_personnel());

drop policy if exists "options_dependances ecriture boutique" on public.options_dependances;
create policy "options_dependances ecriture boutique" on public.options_dependances
  for insert to authenticated with check (public.peut_boutique());

drop policy if exists "options_dependances suppression boutique" on public.options_dependances;
create policy "options_dependances suppression boutique" on public.options_dependances
  for delete to authenticated using (public.peut_boutique());

revoke all on public.options_dependances from anon;