-- Garde anti double-clic sur les paiements (defense en profondeur).
-- Refuse un paiement identique (reservation, montant, mode, motif) recu dans les 10 dernieres secondes.
-- N'a aucun effet si l'app envoie deja une cle_idempotence (le doublon n'arrive jamais).
create or replace function public.bloquer_doublon_paiement_resa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.paiements_resa p
    where p.reservation_id = new.reservation_id
      and p.montant = new.montant
      and p.mode = new.mode
      and coalesce(p.motif, '') = coalesce(new.motif, '')
      and p.created_at > (now() - interval '10 seconds')
  ) then
    raise exception 'Paiement identique deja enregistre il y a quelques secondes (protection anti double-clic). Patientez quelques secondes ou modifiez le paiement avant de reessayer.'
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_paiements_resa_anti_doublon on public.paiements_resa;

create trigger trg_paiements_resa_anti_doublon
before insert on public.paiements_resa
for each row
execute function public.bloquer_doublon_paiement_resa();
