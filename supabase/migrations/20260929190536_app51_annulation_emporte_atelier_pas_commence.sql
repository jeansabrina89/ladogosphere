-- APP 51 — L'ANNULATION D'UNE COMMANDE EN LIGNE EMPORTE L'ATELIER PAS COMMENCÉ
--
-- ── LA RÈGLE (décision de Sabrina, 29.09.2026) ────────────────────────────
--
-- Une commande d'atelier attachée à une commande en ligne annulée passe à
-- « annulee » quand RIEN N'EST ENCORE FABRIQUÉ, c'est-à-dire depuis
-- « attente_paiement » ET depuis « a_faire ».
--
-- « en_cours » et « prete » ne sont PAS touchées, et c'est délibéré : au
-- passage en « en_cours », `changer_statut_commande` a sorti les fournitures
-- du stock (`mouvements_stock`, `composants_consommes = true`). Les annuler
-- ici remettrait le statut à « annulee » SANS rendre les fournitures — la
-- matière serait sortie pour une commande qui n'existe plus, et l'inventaire
-- mentirait en silence. Une pièce déjà commencée, ou déjà prête, se décide à
-- la main : on la finit, on la garde, on la revend. L'action d'annulation le
-- dit à l'écran plutôt que de trancher toute seule.
--
-- « remise » et « annulee » : rien, il n'y a plus rien à faire.
--
-- Le reste de la fonction est INCHANGÉ : même signature, même
-- SECURITY DEFINER, même search_path, mêmes gardes, même libération de stock,
-- même ligne au journal de la commande en ligne.
--
-- ── LE JOURNAL GARDE LE STATUT D'AVANT ────────────────────────────────────
--
-- La version précédente écrivait « attente_paiement » en dur dans `avant` :
-- elle ne pouvait pas se tromper, puisqu'elle n'annulait que celui-là. Avec
-- deux statuts de départ, `avant` se lit sur la ligne (`cp.statut`) — sans
-- quoi une commande annulée depuis « a_faire » serait racontée au journal
-- comme si elle n'avait jamais été payée.

create or replace function public.annuler_commande_en_ligne(
  p_commande_id uuid,
  p_motif       text,
  p_user_id     uuid
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cmd record;
  r     record;
begin
  select * into v_cmd from public.commandes where id = p_commande_id for update;
  if not found then raise exception 'Commande introuvable.'; end if;
  if v_cmd.statut in ('remise', 'expediee') then
    raise exception 'Une commande déjà remise ne s''annule pas : passez un retour.';
  end if;
  if v_cmd.statut = 'annulee' then return; end if;
  if btrim(coalesce(p_motif, '')) = '' then
    raise exception 'Indiquez le motif de l''annulation.';
  end if;

  if v_cmd.statut in ('confirmee', 'en_preparation', 'prete') then
    perform public.reserver_stock_commande(p_commande_id, -1);
  end if;

  update public.commandes
     set statut = 'annulee', motif_annulation = btrim(p_motif)
   where id = p_commande_id;

  -- Rien n'est encore fabriqué : « attente_paiement » et « a_faire ».
  -- « en_cours » et « prete » restent ouvertes (fournitures déjà sorties).
  for r in
    select cp.id, cp.numero, cp.statut
      from public.commandes_lignes cl
      join public.commandes_personnalisees cp on cp.id = cl.commande_personnalisee_id
     where cl.commande_id = p_commande_id
       and cp.statut in ('attente_paiement', 'a_faire')
  loop
    update public.commandes_personnalisees
       set statut = 'annulee'
     where id = r.id and statut in ('attente_paiement', 'a_faire');

    insert into public.journal_evenements
      (entite, entite_id, evenement, avant, apres, motif, user_id)
    values
      ('commande', r.id, 'statut',
       jsonb_build_object('statut', r.statut),
       jsonb_build_object('statut', 'annulee', 'fournitures', 0, 'numero', r.numero),
       btrim(p_motif), p_user_id);
  end loop;

  insert into public.journal_evenements (entite, entite_id, evenement, apres, user_id)
  values ('commande_en_ligne', p_commande_id, 'annulation',
          jsonb_build_object('numero', v_cmd.numero, 'motif', btrim(p_motif)), p_user_id);
end;
$function$;

-- Une fonction SQL naît fermée : `create or replace` ne redonne pas les droits
-- sur une base reconstruite depuis le dépôt, donc on les redit ici.
-- L'appel se fait côté serveur, avec la clé de service, après la garde de
-- permissions de l'action `annulerCommande`.
revoke execute on function public.annuler_commande_en_ligne(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.annuler_commande_en_ligne(uuid, text, uuid) to service_role;
