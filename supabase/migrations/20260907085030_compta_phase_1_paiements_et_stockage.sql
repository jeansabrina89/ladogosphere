-- Compta phase 1 — encaissement et stockage des PDF.

-- Mode « carte » (terminal) : compte de passage 1021, comme TWINT et Stripe.
alter table public.paiements_resa drop constraint if exists paiements_resa_mode_check;
alter table public.paiements_resa add constraint paiements_resa_mode_check
  check (mode in ('cash', 'twint', 'carte', 'stripe', 'virement', 'avoir'));

-- Arrondi des espèces aux 5 centimes : `montant` est ce qui est imputé à la
-- pièce, `arrondi` la différence réellement encaissée en plus ou en moins.
-- L'écart part en charge (6940) s'il manque, en produit (3800) s'il excède.
alter table public.paiements_resa
  add column if not exists arrondi numeric not null default 0;

-- Bucket PRIVÉ des PDF de factures (chemin exercice/numero.pdf). Les documents
-- ne sont servis que par URL signée de courte durée, jamais en accès direct.
insert into storage.buckets (id, name, public)
values ('factures', 'factures', false)
on conflict (id) do nothing;

-- Coordonnées de l'en-tête des factures. Vides tant qu'elles ne sont pas
-- renseignées : la ligne correspondante disparaît alors du document.
insert into public.parametres (cle, valeur, description) values
  ('email_entreprise',     '', 'E-mail affiché sur les factures'),
  ('telephone_entreprise', '', 'Téléphone affiché sur les factures'),
  ('ide',                  '', 'Numéro IDE (CHE-...) affiché sur les factures')
on conflict (cle) do nothing;
