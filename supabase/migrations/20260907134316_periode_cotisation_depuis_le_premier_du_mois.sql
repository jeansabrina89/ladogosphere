-- Correctif de recette T12 — la période d'adhésion démarre au 1er du mois du
-- paiement et court douze mois pleins. La date de paiement enregistrée ne
-- change pas : c'est la pièce comptable.
-- Un paiement le 07.09.2026 donne « du 01.09.2026 au 31.08.2027 ».
-- Même règle que src/lib/cotisationPeriode.ts (calculerPeriodeCotisation).
create or replace function public.calculer_periode_cotisation(
  p_client_id uuid,
  p_date_paiement date default current_date,
  p_exclure_id uuid default null
)
returns table(date_debut date, date_fin date)
language sql
stable
set search_path to 'public'
as $function$
  with precedente as (
    select max(c.date_fin) as fin
    from public.cotisations_membres c
    where c.client_id = p_client_id
      and c.statut = 'payee'
      and (p_exclure_id is null or c.id <> p_exclure_id)
      and c.date_fin >= p_date_paiement
  ),
  debut as (
    -- Renouvellement anticipé : on enchaîne le lendemain de la précédente.
    -- Sinon : 1er jour du mois du paiement.
    select coalesce(
             precedente.fin + 1,
             date_trunc('month', p_date_paiement::timestamp)::date
           ) as d
    from precedente
  )
  select debut.d,
         (debut.d + interval '1 year' - interval '1 day')::date
  from debut;
$function$;