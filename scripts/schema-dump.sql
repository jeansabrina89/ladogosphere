-- Génère le DDL complet du schéma `public` sous forme d'un seul texte.
-- Utilisé par scripts/sauvegarde-schema.mjs pour produire supabase/schema.sql.
-- Schéma seul : aucune donnée n'est lue.
with
tables_ddl as (
  select string_agg(t.ddl, E'\n\n' order by t.nom) as txt
  from (
    select c.relname as nom,
      'create table if not exists public.' || quote_ident(c.relname) || E' (\n' ||
      (select string_agg(
                '  ' || quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod) ||
                coalesce(' default ' || pg_get_expr(ad.adbin, ad.adrelid), '') ||
                case when a.attnotnull then ' not null' else '' end,
                E',\n' order by a.attnum)
         from pg_attribute a
         left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)
      || E'\n);' as ddl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  ) t
),
contraintes_ddl as (
  select string_agg(
           'alter table public.' || quote_ident(cl.relname) ||
           ' add constraint ' || quote_ident(co.conname) || ' ' ||
           pg_get_constraintdef(co.oid) || ';',
           E'\n' order by case co.contype when 'p' then 1 when 'u' then 2 when 'c' then 3 else 4 end,
                          cl.relname, co.conname) as txt
  from pg_constraint co
  join pg_class cl on cl.oid = co.conrelid
  join pg_namespace n on n.oid = cl.relnamespace
  where n.nspname = 'public' and co.contype in ('p','u','c','f')
),
index_ddl as (
  select string_agg(i.indexdef || ';', E'\n' order by i.tablename, i.indexname) as txt
  from pg_indexes i
  where i.schemaname = 'public'
    and not exists (
      select 1 from pg_constraint co
      join pg_class cl on cl.oid = co.conindid
      where cl.relname = i.indexname)
),
fonctions_ddl as (
  select string_agg(pg_get_functiondef(p.oid) || ';', E'\n\n' order by p.proname, p.oid) as txt
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f','p')
),
triggers_ddl as (
  select string_agg(pg_get_triggerdef(tg.oid) || ';', E'\n' order by cl.relname, tg.tgname) as txt
  from pg_trigger tg
  join pg_class cl on cl.oid = tg.tgrelid
  join pg_namespace n on n.oid = cl.relnamespace
  where n.nspname = 'public' and not tg.tgisinternal
),
rls_ddl as (
  select string_agg('alter table public.' || quote_ident(c.relname) || ' enable row level security;',
                    E'\n' order by c.relname) as txt
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
),
policies_ddl as (
  select string_agg(
           'create policy ' || quote_ident(p.policyname) || ' on public.' || quote_ident(p.tablename) ||
           ' as ' || p.permissive || ' for ' || p.cmd ||
           ' to ' || array_to_string(p.roles, ', ') ||
           coalesce(' using (' || p.qual || ')', '') ||
           coalesce(' with check (' || p.with_check || ')', '') || ';',
           E'\n' order by p.tablename, p.policyname) as txt
  from pg_policies p
  where p.schemaname = 'public'
),
grants_ddl as (
  select string_agg(
           'revoke all on function public.' || quote_ident(p.proname) ||
           '(' || pg_get_function_identity_arguments(p.oid) || ') from anon, authenticated;',
           E'\n' order by p.proname)  as txt
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
)
select
  '-- Schéma de référence de la base La Dogosphère (schéma public, sans données).' || E'\n' ||
  '-- Généré par : npm run backup:schema (scripts/sauvegarde-schema.mjs).' || E'\n' ||
  '-- Ce fichier reproduit la structure complète ; les migrations de supabase/migrations/' || E'\n' ||
  '-- postérieures à sa génération le complètent.' || E'\n\n' ||
  'create extension if not exists "pgcrypto" with schema extensions;' || E'\n\n' ||
  E'-- ── Tables ──────────────────────────────────────────────────────────────\n\n' ||
  coalesce((select txt from tables_ddl), '') || E'\n\n' ||
  E'-- ── Contraintes ─────────────────────────────────────────────────────────\n\n' ||
  coalesce((select txt from contraintes_ddl), '') || E'\n\n' ||
  E'-- ── Index ───────────────────────────────────────────────────────────────\n\n' ||
  coalesce((select txt from index_ddl), '') || E'\n\n' ||
  E'-- ── Fonctions ───────────────────────────────────────────────────────────\n\n' ||
  coalesce((select txt from fonctions_ddl), '') || E'\n\n' ||
  E'-- ── Déclencheurs ────────────────────────────────────────────────────────\n\n' ||
  coalesce((select txt from triggers_ddl), '') || E'\n\n' ||
  E'-- ── Sécurité au niveau ligne ────────────────────────────────────────────\n\n' ||
  coalesce((select txt from rls_ddl), '') || E'\n\n' ||
  coalesce((select txt from policies_ddl), '') || E'\n\n' ||
  E'-- ── Droits sur les fonctions SECURITY DEFINER ───────────────────────────\n\n' ||
  coalesce((select txt from grants_ddl), '') || E'\n'
  as schema_sql;
