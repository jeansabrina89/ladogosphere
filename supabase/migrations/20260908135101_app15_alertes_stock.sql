-- APP 15 — Alerte de retour en stock.
--
-- « Prévenez-moi quand il revient. » Une demande, une adresse, un article.
-- Rien d'autre : ni nom, ni téléphone. C'est un message transactionnel
-- sollicité, pas une inscription à une liste.
--
-- La ligne n'est PAS supprimée à la notification : `notifie_le` se remplit et
-- la trace reste. C'est elle qui dit ce qui a manqué, et à combien de monde —
-- l'information de réassort. Seule une désinscription explicite l'efface.

create table if not exists public.alertes_stock (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  -- Null pour une adresse laissée sans compte : on ne crée pas de fiche client
  -- pour une attente.
  client_id uuid references public.clients(id) on delete set null,
  email text not null,
  cree_le timestamptz not null default now(),
  notifie_le timestamptz,
  -- Le jeton de la désinscription : il n'ouvre QUE cette alerte-ci.
  token uuid not null default gen_random_uuid(),
  source text not null default 'en_ligne'
);

comment on table public.alertes_stock is
  'Demandes « prévenez-moi quand cet article revient ». La ligne survit à la notification : c''est la trace du besoin.';
comment on column public.alertes_stock.notifie_le is
  'Rempli à l''envoi RÉUSSI, jamais avant : une reprise après échec ne fait pas de doublon.';
comment on column public.alertes_stock.token is
  'Désinscription de CETTE alerte seule. Sans rapport avec clients.emails_info_ok.';

-- Une même adresse ne s'inscrit pas deux fois sur le même article TANT QU'ELLE
-- N'A PAS ÉTÉ PRÉVENUE. Se réinscrire après notification est normal : l'article
-- peut manquer à nouveau.
create unique index if not exists alertes_stock_en_attente_unique
  on public.alertes_stock (article_id, lower(email))
  where notifie_le is null;

create unique index if not exists alertes_stock_token_unique
  on public.alertes_stock (token);

create index if not exists alertes_stock_article_idx
  on public.alertes_stock (article_id, notifie_le);

alter table public.alertes_stock enable row level security;

-- Un client connecté lit SES alertes, et rien de plus.
-- Aucune politique d'écriture : seul le serveur (clé de service) écrit ici.
drop policy if exists "alertes_stock_lecture_client" on public.alertes_stock;
create policy "alertes_stock_lecture_client"
  on public.alertes_stock for select
  using (
    client_id in (select id from public.clients where auth_user_id = auth.uid())
  );