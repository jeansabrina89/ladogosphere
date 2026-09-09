-- ── A0. Alimentation sèche / humide ────────────────────────────────────────
-- Croquettes et pâtées ne se rangent, ne se pèsent ni ne se conservent pareil.
-- La reprise met TOUT l'existant en « sèche » : c'est le cas le plus fréquent,
-- et une pâtée mal classée se corrige à la main en un clic. L'inverse aurait
-- forcé à relire chaque croquette.
alter table public.articles drop constraint if exists articles_categorie_check;

update public.articles set categorie = 'alimentation_seche' where categorie = 'alimentation';

alter table public.articles add constraint articles_categorie_check
  check (categorie = any (array[
    'alimentation_seche', 'alimentation_humide', 'friandises', 'mastication', 'litiere',
    'colliers', 'laisses', 'harnais', 'muselieres', 'longes',
    'jouets', 'peluches', 'couchages', 'soins', 'medaillons_accessoires', 'divers'
  ]));

-- ── A1. Poids et expédiabilité ─────────────────────────────────────────────
alter table public.articles add column if not exists poids_grammes int
  check (poids_grammes is null or poids_grammes > 0);
alter table public.articles add column if not exists expediable boolean not null default true;

-- Seules les trois catégories lourdes sortent du colis. Les friandises et la
-- mastication sont légères : elles restent expédiables, comme tout le reste.
update public.articles set expediable = false
 where categorie in ('alimentation_seche', 'alimentation_humide', 'litiere');

-- ── A4. Réservation de stock ───────────────────────────────────────────────
-- Réservé à la CONFIRMATION, sorti seulement à la remise. Entre les deux,
-- l'article est promis à quelqu'un sans avoir quitté l'étagère.
alter table public.articles add column if not exists stock_reserve numeric not null default 0
  check (stock_reserve >= 0);

-- ── A5. Paramètres de la vente en ligne ────────────────────────────────────
insert into public.parametres (cle, valeur) values
  ('frais_port_grille', '[{"jusqu_a_grammes":1000,"prix":9},{"jusqu_a_grammes":2000,"prix":11},{"jusqu_a_grammes":5000,"prix":14},{"jusqu_a_grammes":10000,"prix":20}]'),
  ('poids_max_colis_grammes', '10000'),
  ('remise_membre_pourcent', '10'),
  ('delai_preparation_jours', '2')
on conflict (cle) do nothing;

-- ── A2. Commandes en ligne ─────────────────────────────────────────────────
create table if not exists public.commandes (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  client_id uuid not null references public.clients(id) on delete restrict,
  statut text not null default 'panier'
    check (statut in ('panier','confirmee','en_preparation','prete','remise','expediee','annulee')),
  mode_remise text check (mode_remise in ('retrait','depart_chien','postal')),
  reservation_id uuid references public.reservations(id) on delete set null,
  adresse_livraison jsonb,
  frais_port numeric not null default 0 check (frais_port >= 0),
  remise_membre numeric not null default 0 check (remise_membre >= 0),
  montant_total numeric not null default 0,
  mode_paiement text check (mode_paiement in ('sur_place','facture','en_ligne')),
  paiement_statut text not null default 'en_attente'
    check (paiement_statut in ('en_attente','paye','echoue','rembourse')),
  paiement_reference text,
  vente_id uuid references public.ventes(id) on delete set null,
  facture_id uuid references public.factures(id) on delete set null,
  numero_suivi text,
  motif_annulation text,
  exercice int,
  cle_idempotence text unique,
  created_at timestamptz not null default now(),
  confirmee_le timestamptz
);

-- Un seul panier par client : c'est ce qui rend « le panier » sans ambiguïté.
create unique index if not exists commandes_un_panier_par_client
  on public.commandes (client_id) where statut = 'panier';

create index if not exists commandes_statut_idx on public.commandes (statut);
create index if not exists commandes_client_idx on public.commandes (client_id, created_at desc);
create index if not exists commandes_reservation_idx on public.commandes (reservation_id)
  where reservation_id is not null;

-- ── A3. Lignes de commande ─────────────────────────────────────────────────
create table if not exists public.commandes_lignes (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete restrict,
  commande_personnalisee_id uuid references public.commandes_personnalisees(id) on delete set null,
  libelle text not null,
  quantite numeric not null check (quantite > 0),
  prix_unitaire numeric not null check (prix_unitaire >= 0),
  taux_tva numeric not null default 0,
  montant numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists commandes_lignes_commande_idx
  on public.commandes_lignes (commande_id, created_at);