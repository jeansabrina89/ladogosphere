-- L'imputation d'un avoir, figée sur la pièce.
--
-- POURQUOI
--   Un avoir efface d'abord ce qui restait DÛ sur la facture (crédit 1100) ;
--   seul l'excédent — la part déjà encaissée — devient un crédit au client
--   (2035) ou un remboursement (1000 / 1020 / 1021). Jusqu'ici, la part
--   créditée se relisait dans le registre des avoirs, ce qui ne dit rien d'un
--   remboursement : tout un avoir « remboursé » se créditait au 1100, même
--   quand la facture était déjà payée et que la créance était nulle.
--
--   La répartition se décide à l'émission, à partir du reste à payer de ce
--   jour-là. Elle ne doit plus bouger ensuite : un encaissement ou une
--   annulation ultérieurs sur la facture d'origine ne peuvent pas déplacer
--   l'écriture d'une pièce déjà émise. Elle est donc ÉCRITE sur l'avoir.
--
-- CE QUI NE CHANGE PAS
--   Les avoirs déjà émis n'ont pas cette colonne (null) : le moteur comptable
--   garde pour eux exactement son calcul d'aujourd'hui, et leurs écritures ne
--   bougent pas d'un centime. Les 20 pièces fausses de la base restent telles
--   quelles : le journal est immuable, ses erreurs comprises.

begin;

-- ── La colonne ────────────────────────────────────────────────────────────
alter table public.factures
  add column if not exists imputation_avoir jsonb;

comment on column public.factures.imputation_avoir is
  'Avoir seulement : imputation figée à l''émission — {creance, credit, remboursements:[{compte,montant}]}. Null pour les avoirs antérieurs, qui gardent l''ancien calcul.';

-- ── Figée, comme le reste de la pièce ─────────────────────────────────────
-- Même verrou que le numéro, les montants et la date : une fois la pièce
-- émise, son imputation ne se réécrit plus.
create or replace function public.factures_inalterabilite()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if (TG_OP = 'DELETE') then
    if OLD.numero is not null then
      raise exception 'Facture % deja emise : suppression interdite (passer par un avoir).', OLD.numero;
    end if;
    return OLD;
  end if;

  if OLD.numero is not null then
    if NEW.numero             is distinct from OLD.numero
    or NEW.type               is distinct from OLD.type
    or NEW.type_facture       is distinct from OLD.type_facture
    or NEW.client_id          is distinct from OLD.client_id
    or NEW.reservation_id     is distinct from OLD.reservation_id
    or NEW.facture_origine_id is distinct from OLD.facture_origine_id
    or NEW.date_facture       is distinct from OLD.date_facture
    or NEW.date_echeance      is distinct from OLD.date_echeance
    or NEW.montant_total      is distinct from OLD.montant_total
    or NEW.montant_ht         is distinct from OLD.montant_ht
    or NEW.montant_tva        is distinct from OLD.montant_tva
    or NEW.montant_ttc        is distinct from OLD.montant_ttc
    or NEW.motif              is distinct from OLD.motif
    or NEW.reference_qr       is distinct from OLD.reference_qr
    or NEW.emise_par          is distinct from OLD.emise_par
    or NEW.emise_le           is distinct from OLD.emise_le
    or NEW.exercice           is distinct from OLD.exercice
    or NEW.imputation_avoir   is distinct from OLD.imputation_avoir
    then
      raise exception 'Facture % deja emise : seuls le statut, le suivi de paiement et le PDF peuvent changer.', OLD.numero;
    end if;
  end if;
  return NEW;
end;
$function$;

-- Une fonction SQL naît fermée (AGENTS.md) : celle-ci ne s'appelle que par son
-- trigger, jamais par un rôle public.
revoke execute on function public.factures_inalterabilite() from public, anon, authenticated;
grant execute on function public.factures_inalterabilite() to service_role;

commit;