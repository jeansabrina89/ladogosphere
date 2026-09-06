-- Cohabitation du chien en box, déclarée par le propriétaire.
--
-- Jusqu'ici, seule la pension posait `doit_etre_isole` / `famille_uniquement`.
-- Le client peut désormais déclarer lui-même le mode de cohabitation de son
-- chien. Il faut donc savoir QUI a décidé : la décision de la pension prime et
-- verrouille le choix côté client.
--
--   NULL      → jamais fixé explicitement. Les restrictions déjà en base
--               viennent forcément de la pension (le client n'y avait pas accès),
--               elles sont donc traitées comme 'pension'.
--   'pension' → décidé par la pension : verrouillé pour le client.
--   'client'  → déclaré par le propriétaire : il peut le changer.
begin;

alter table public.chiens
  add column if not exists cohabitation_source text
    check (cohabitation_source in ('pension', 'client'));

comment on column public.chiens.cohabitation_source is
  'Qui a fixé le mode de cohabitation en box : pension (verrouillé pour le client) ou client. NULL = jamais fixé ; une restriction déjà posée est réputée venir de la pension.';

commit;
