-- Un refus de cron laisse UNE trace par tâche et par jour, pas une par appel.
--
-- L'adresse d'un cron est publique : quelqu'un qui essaie une clé fausse en
-- boucle ne doit pas pouvoir remplir le journal, ni déclencher une alerte par
-- tentative. La limitation posée en mémoire au 18c-ter ne tenait pas : chaque
-- instance serverless comptait pour elle seule. C'est donc la BASE qui borne,
-- puisqu'elle est le seul endroit que toutes les instances partagent.
--
-- Deux pièces :
--   1. un index unique PARTIEL sur (tâche, jour) ;
--   2. une fonction qui insère « sans rien faire en cas de conflit » et dit si
--      elle a créé la ligne — c'est cette réponse qui décide de l'alerte.

-- ── 1. L'index ────────────────────────────────────────────────────────────
--
-- Il ne regarde QUE les refus de cron : la clause `where` exige l'entité
-- « acces », l'événement « refus » ET `apres->>'action' = 'cron'`. Les refus de
-- la garde applicative (garde.ts), qui portent la même entité et le même
-- événement mais une autre action, restent donc hors de l'index : ils peuvent
-- se répéter autant que nécessaire.
--
-- Le JOUR est écrit dans la trace (`apres->>'jour'`, date UTC en AAAA-MM-JJ) et
-- non déduit de `created_at` : la conversion d'un horodatage vers une date
-- dépend du fuseau de la session, elle n'est pas immuable, et Postgres refuse
-- de l'indexer. L'extraction d'une clé jsonb, elle, l'est.

create unique index if not exists journal_refus_cron_un_par_jour
  on public.journal_evenements ((apres->>'tache'), (apres->>'jour'))
  where entite = 'acces'
    and evenement = 'refus'
    and apres->>'action' = 'cron';

-- ── 2. L'écriture qui décide ──────────────────────────────────────────────
--
-- `on conflict do nothing` ne modifie aucune ligne existante : les triggers
-- d'immuabilité (BEFORE UPDATE, BEFORE DELETE, BEFORE TRUNCATE) ne sont pas
-- concernés. Une insertion reste une insertion.
--
-- Rend vrai quand la ligne vient d'être créée (première tentative du jour pour
-- cette tâche), faux quand elle existait déjà.

create or replace function public.tracer_refus_cron(p_tache text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_jour text := to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD');
  v_id   uuid;
begin
  insert into public.journal_evenements (entite, entite_id, evenement, apres, user_id)
  values (
    'acces',
    '00000000-0000-0000-0000-000000000000',
    'refus',
    jsonb_build_object('action', 'cron', 'tache', p_tache, 'motif', 'secret_faux', 'jour', v_jour),
    null
  )
  on conflict do nothing
  returning id into v_id;

  return v_id is not null;
end;
$function$;

-- Appelée par le serveur seul, derrière la porte des crons.
revoke execute on function public.tracer_refus_cron(text) from public, anon, authenticated;
grant execute on function public.tracer_refus_cron(text) to service_role;