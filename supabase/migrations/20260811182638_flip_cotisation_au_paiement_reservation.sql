-- Flip automatique de l'adhésion embarquée dans une réservation.
-- Quand une réservation devient ENTIÈREMENT payée (statut_paiement -> 'paye'),
-- la/les cotisation(s) 'en_attente' liée(s) à CETTE réservation passent 'payee'
-- (date = date de paiement de la résa). Couvre TOUS les chemins de paiement
-- (admin JS + RPC avoir), là où un helper JS raterait la RPC SQL.
-- Pas de revert au dé-paiement (une cotisation en_attente compte déjà « à jour »).
-- SET search_path = public : évite l'alerte function_search_path_mutable.
create or replace function public.flip_cotisation_au_paiement_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.statut_paiement is distinct from 'paye') and (new.statut_paiement = 'paye') then
    update public.cotisations_membres
    set statut = 'payee',
        date_paiement = coalesce(new.date_paiement, current_date)
    where reservation_id = new.id
      and statut = 'en_attente';
  end if;
  return new;
end;
$$;

-- PostgREST expose les fonctions SECURITY DEFINER en RPC : sans ce REVOKE,
-- l'advisor anon/authenticated_security_definer_function_executable réapparaît
-- (nettoyé au Lot 2a). Un trigger se déclenche SANS privilège EXECUTE, donc
-- révoquer l'exécution n'affecte pas son fonctionnement.
revoke execute on function public.flip_cotisation_au_paiement_reservation() from public, anon, authenticated;

drop trigger if exists trg_flip_cotisation_au_paiement on public.reservations;
create trigger trg_flip_cotisation_au_paiement
after update of statut_paiement on public.reservations
for each row
execute function public.flip_cotisation_au_paiement_reservation();
