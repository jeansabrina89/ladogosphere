-- Accord de publication des photos, par client.
--
-- Coché par défaut : les clients existants passent donc à `true` (voulu — c'est
-- la pratique en vigueur ; le client peut retirer son accord à tout moment
-- depuis « Mon profil », ce qui horodate `photos_ok_modifie_le`).
-- `photos_ok_modifie_le` reste NULL tant que personne n'a touché à la valeur :
-- NULL = accord implicite jamais modifié, non NULL = choix explicite daté.
begin;

alter table public.clients
  add column if not exists photos_ok boolean not null default true,
  add column if not exists photos_ok_modifie_le timestamptz;

comment on column public.clients.photos_ok is
  'Accord du client pour la publication de photos de son chien (site + réseaux sociaux). Coché par défaut.';
comment on column public.clients.photos_ok_modifie_le is
  'Horodatage du dernier changement explicite de photos_ok. NULL = jamais modifié depuis la valeur par défaut.';

commit;
