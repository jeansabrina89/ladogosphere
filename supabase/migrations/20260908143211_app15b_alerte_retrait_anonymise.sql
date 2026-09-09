-- APP 15b — Le retrait d'une alerte efface l'adresse et garde la demande.
--
-- Supprimer la ligne effaçait aussi ce qu'elle apprenait : « quelqu'un a
-- attendu cet article ». On garde donc la DEMANDE — l'article, la date, le fait
-- qu'elle ait été notifiée — et on efface la PERSONNE : plus d'adresse, plus de
-- client, plus de jeton.
--
-- Un jeton mis à null n'est plus utilisable : le lien de l'e-mail cesse d'ouvrir
-- quoi que ce soit, ce qui est exactement l'effet voulu.

alter table public.alertes_stock
  add column if not exists retire_le timestamptz;

comment on column public.alertes_stock.retire_le is
  'Retrait à la demande : l''adresse, le client et le jeton ont été effacés. La demande, elle, reste — elle dit ce qui manquait.';

-- Une ligne retirée n'a plus ni adresse ni jeton.
alter table public.alertes_stock alter column email drop not null;
alter table public.alertes_stock alter column token drop not null;

-- Les deux index ne portent plus que sur les lignes qui ont encore une valeur :
-- une ligne retirée ne doit bloquer personne, et la même personne doit pouvoir
-- se réinscrire plus tard en repartant de zéro.
drop index if exists public.alertes_stock_en_attente_unique;
create unique index alertes_stock_en_attente_unique
  on public.alertes_stock (article_id, lower(email))
  where notifie_le is null and email is not null;

drop index if exists public.alertes_stock_token_unique;
create unique index alertes_stock_token_unique
  on public.alertes_stock (token)
  where token is not null;

-- Le déclenchement lit « en attente » : ni notifiée, ni retirée.
create index if not exists alertes_stock_a_notifier_idx
  on public.alertes_stock (article_id)
  where notifie_le is null and retire_le is null;

-- Garde-fou : une ligne retirée ne garde AUCUNE donnée personnelle. Si un jour
-- un chemin oubliait d'effacer l'un des trois champs, l'écriture serait refusée
-- plutôt que de laisser traîner une adresse qu'on a promis d'effacer.
alter table public.alertes_stock
  drop constraint if exists alertes_stock_retrait_anonyme;
alter table public.alertes_stock
  add constraint alertes_stock_retrait_anonyme check (
    retire_le is null
    or (email is null and client_id is null and token is null)
  );