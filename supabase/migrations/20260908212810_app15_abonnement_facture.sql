-- La carte prépayée porte désormais une FACTURE, comme une adhésion ou un
-- séjour : même numérotation, même PDF, même bulletin QR.
alter table public.abonnements
  add column if not exists facture_id uuid references public.factures(id) on delete set null;

create index if not exists idx_abonnements_facture on public.abonnements(facture_id);

comment on column public.abonnements.facture_id is
  'La facture qui porte la carte. Null sur les cartes d''avant APP 15 : elles gardent leur comptabilisation d''origine.';

/**
 * Sur quelle base le décompte TVA se fait.
 *
 * « reçues » : la TVA est due au moment de l'ENCAISSEMENT. C'est le régime
 * usuel avec la dette fiscale nette, et le défaut ici.
 * « convenues » : elle est due dès l'émission de la facture.
 *
 * Le choix change le moment où un abonnement payé d'avance entre dans le
 * décompte — c'est pour cela qu'il est écrit, plutôt que supposé.
 */
alter table public.parametres_tva
  add column if not exists base_decompte text not null default 'recues';

do $$ begin
  alter table public.parametres_tva add constraint parametres_tva_base_check
    check (base_decompte in ('convenues','recues'));
exception when duplicate_object then null; end $$;

comment on column public.parametres_tva.base_decompte is
  'Contre-prestations convenues (à la facture) ou reçues (à l''encaissement). Défaut : reçues, le régime usuel en dette fiscale nette.';