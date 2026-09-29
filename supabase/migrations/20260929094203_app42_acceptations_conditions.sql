-- APP 42 — la preuve datée qu'un client a accepté les conditions.
--
-- Les conditions de la pension (réservations) et les conditions de vente
-- (commandes en ligne) sont publiées sur le site. Rien ne gardait trace de leur
-- acceptation : le jour d'un désaccord, il n'y aurait eu que la parole de
-- chacun. Cette table garde QUI a accepté QUOI, QUAND, DANS QUELLE VERSION, et
-- par quel chemin — en ligne ou sur papier à l'accueil.
--
-- ── ELLE NE SE MODIFIE PAS ────────────────────────────────────────────────
--
-- Ni UPDATE, ni DELETE, ni TRUNCATE : deux déclencheurs le refusent, la clé de
-- service comprise. Une acceptation ne se corrige pas — on en ajoute une
-- nouvelle. C'est le régime de `journal_evenements`, et pour la même raison :
-- une preuve qu'on peut réécrire n'est plus une preuve.
--
-- ── CE QUI N'EST PAS ICI, ET POURQUOI ─────────────────────────────────────
--
-- Le TEXTE des conditions n'est pas copié. Il vit sur le site, et la `version`
-- — la date de dernière mise à jour de la page — dit laquelle a été acceptée.
-- Copier le texte demanderait de le tenir à jour à deux endroits, et c'est
-- exactement ainsi qu'on finit par ne plus savoir lequel fait foi.

create table if not exists public.acceptations_conditions (
  id uuid primary key default gen_random_uuid(),

  client_id uuid not null references public.clients(id) on delete cascade,

  -- « pension » : les conditions de séjour. « vente » : celles de la boutique.
  document text not null check (document in ('pension', 'vente')),

  -- La date de mise à jour de la page acceptée, en ISO court : « 2026-09-29 ».
  -- Du texte et non une date : c'est un NUMÉRO DE VERSION qui se trouve avoir
  -- la forme d'une date, et on ne veut pas qu'il se recalcule ou se décale.
  version text not null check (btrim(version) <> ''),

  acceptee_le timestamptz not null default now(),

  -- « en_ligne » : la case cochée par le client. « papier » : la feuille signée
  -- à l'accueil, saisie par une employée.
  mode text not null check (mode in ('en_ligne', 'papier')),

  reservation_id uuid references public.reservations(id) on delete set null,
  commande_id uuid references public.commandes(id) on delete set null,

  -- Qui a saisi, pour le papier. Vide en ligne : c'est le client lui-même.
  saisie_par uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),

  -- Une acceptation naît d'UN geste : une réservation, ou une commande, ou
  -- rien (le papier). Jamais les deux à la fois.
  constraint acceptations_une_seule_origine
    check (reservation_id is null or commande_id is null),

  -- Le papier a forcément quelqu'un qui l'a saisi ; l'en-ligne, personne.
  -- `case` et non `or` : l'ordre d'évaluation d'un `or` n'est pas garanti.
  constraint acceptations_saisie_selon_le_mode
    check (
      case mode
        when 'papier' then saisie_par is not null
        else saisie_par is null
      end
    )
);

-- Les deux lectures faites par l'application : « les acceptations de ce client »
-- et « la dernière pour ce document ».
create index if not exists acceptations_conditions_client_idx
  on public.acceptations_conditions (client_id, document, acceptee_le desc);

-- ── En ajout seul ─────────────────────────────────────────────────────────

create or replace function public.acceptations_conditions_ajout_seul()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  raise exception
    'acceptations_conditions est en ajout seul : une acceptation ne se corrige pas, elle se refait. Ajoutez une nouvelle ligne.'
    using errcode = 'insufficient_privilege';
end;
$function$;

revoke execute on function public.acceptations_conditions_ajout_seul() from public, anon, authenticated;

drop trigger if exists trg_acceptations_conditions_ajout_seul on public.acceptations_conditions;
create trigger trg_acceptations_conditions_ajout_seul
  before update or delete on public.acceptations_conditions
  for each row execute function public.acceptations_conditions_ajout_seul();

drop trigger if exists trg_acceptations_conditions_sans_vidage on public.acceptations_conditions;
create trigger trg_acceptations_conditions_sans_vidage
  before truncate on public.acceptations_conditions
  for each statement execute function public.acceptations_conditions_ajout_seul();

-- ── RLS ───────────────────────────────────────────────────────────────────

/*
 * Le client LIT les siennes, et n'écrit RIEN directement.
 *
 * Aucune politique d'insertion pour `authenticated` : ce n'est pas un oubli.
 * Une acceptation doit naître AVEC le geste qu'elle accompagne — la réservation
 * ou la commande — et c'est l'action serveur qui garantit les deux ensemble.
 * Laisser le navigateur insérer permettrait d'écrire une acceptation sans
 * réservation, ou une réservation sans acceptation.
 *
 * Le personnel lit tout : c'est ce qui lui permet de dire à l'arrivée « les
 * conditions ne sont pas signées ». L'écriture « papier » passe aussi par une
 * action serveur, sous la permission des clients et des chiens.
 */
alter table public.acceptations_conditions enable row level security;

drop policy if exists admin_all_acceptations_conditions on public.acceptations_conditions;
create policy admin_all_acceptations_conditions
  on public.acceptations_conditions for all
  to authenticated
  using (public.is_admin());

drop policy if exists personnel_select_acceptations_conditions on public.acceptations_conditions;
create policy personnel_select_acceptations_conditions
  on public.acceptations_conditions for select
  to authenticated
  using (public.is_personnel());

drop policy if exists client_select_acceptations_conditions on public.acceptations_conditions;
create policy client_select_acceptations_conditions
  on public.acceptations_conditions for select
  to authenticated
  using (
    client_id in (
      select c.id from public.clients c where c.auth_user_id = (select auth.uid())
    )
  );
