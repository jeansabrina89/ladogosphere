-- Compta phase 0 — corrections issues de l'audit comptable.
--
-- 1. Statut de facture : 'payee' n'a jamais existé côté contrainte, on unifie
--    sur 'acquittee' (le UPDATE de figerFactureResa échouait en entier).
-- 2. Compte 3800 « Diminutions de produits » : contrepartie des avoirs manuels.
-- 3. paiements_resa.client_id : jamais nul (le client est lu sur la réservation).
-- 4. passer_ecriture : renseigne created_by et contre_passe_id.

-- ── 1. Statut 'payee' sur les factures ──────────────────────────────────────
update public.factures set statut = 'acquittee' where statut = 'payee';

-- ── 2. Compte de diminution de produits ─────────────────────────────────────
insert into public.comptes (numero, libelle, type, actif)
values ('3800', 'Diminutions de produits', 'produit', true)
on conflict (numero) do nothing;

-- ── 3. client_id obligatoire sur le journal des paiements ───────────────────
update public.paiements_resa p
   set client_id = r.client_id
  from public.reservations r
 where r.id = p.reservation_id
   and p.client_id is null
   and r.client_id is not null;

-- Un paiement dont on ne retrouve pas le client n'est pas rattachable : on ne
-- pose la contrainte que si le rattrapage est complet.
do $$
begin
  if exists (select 1 from public.paiements_resa where client_id is null) then
    raise exception 'paiements_resa : % ligne(s) sans client_id, contrainte NOT NULL impossible',
      (select count(*) from public.paiements_resa where client_id is null);
  end if;
  alter table public.paiements_resa alter column client_id set not null;
end $$;

-- ── 4. passer_ecriture : traçabilité de l'auteur et de la contre-passation ──
-- created_by null = traitement automatique (trigger, synchronisation).
drop function if exists public.passer_ecriture(date, text, text, uuid, jsonb);

create or replace function public.passer_ecriture(
  p_date date,
  p_libelle text,
  p_piece_type text,
  p_piece_id uuid,
  p_lignes jsonb,
  p_created_by uuid default null,
  p_contre_passe_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ecriture_id uuid;
  v_total_debit numeric(12,2) := 0;
  v_total_credit numeric(12,2) := 0;
  v_ligne jsonb;
begin
  for v_ligne in select * from jsonb_array_elements(p_lignes) loop
    v_total_debit := v_total_debit + coalesce((v_ligne->>'debit')::numeric, 0);
    v_total_credit := v_total_credit + coalesce((v_ligne->>'credit')::numeric, 0);
  end loop;

  if round(v_total_debit, 2) <> round(v_total_credit, 2) then
    raise exception 'Ecriture desequilibree : total debit % <> total credit %', v_total_debit, v_total_credit;
  end if;
  if round(v_total_debit, 2) = 0 then
    raise exception 'Ecriture vide (montant nul)';
  end if;

  insert into public.ecritures (date_ecriture, libelle, piece_type, piece_id, exercice, created_by, contre_passe_id)
  values (p_date, p_libelle, p_piece_type, p_piece_id, extract(year from p_date)::int, p_created_by, p_contre_passe_id)
  returning id into v_ecriture_id;

  insert into public.ecritures_lignes (ecriture_id, compte_numero, debit, credit)
  select v_ecriture_id,
         (l->>'compte')::text,
         coalesce((l->>'debit')::numeric, 0),
         coalesce((l->>'credit')::numeric, 0)
  from jsonb_array_elements(p_lignes) as l;

  return v_ecriture_id;
end;
$function$;

revoke all on function public.passer_ecriture(date, text, text, uuid, jsonb, uuid, uuid)
  from public, anon, authenticated;
