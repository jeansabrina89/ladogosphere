-- APP 26 : `recevoir_marchandise` accepte la dépense et la péremption.
--
-- TROISIÈME passage sur cette fonction dans le même lot, et il faut dire
-- pourquoi plutôt que de le masquer : la fonction a été écrite en regardant le
-- scénario neuf — « Sabrina reçoit des sacs commandés » — et non les chemins
-- qui existaient déjà. Or l'application entre du stock par TROIS portes, et
-- deux d'entre elles viennent d'une dépense comptable :
--
--   * `entrerStockDepuisDepense`, depuis l'écran d'une dépense ;
--   * la même, depuis `app/api/depenses/route.ts`.
--
-- Ces deux-là passent `depense_id` — le lien entre la facture du fournisseur et
-- la marchandise entrée — et `date_peremption`. Brancher la réception sur une
-- fonction qui ne les accepte pas aurait coupé ce lien EN SILENCE : l'entrée
-- aurait eu lieu, le stock aurait été juste, et la dépense n'aurait plus rien
-- montré. On ne s'en serait aperçu qu'au contrôle des comptes, des mois plus
-- tard, sans plus savoir quoi rattacher à quoi.
--
-- `drop` puis `create`, et non `create or replace` : ajouter un paramètre, même
-- avec valeur par défaut, crée une SURCHARGE au lieu de remplacer. Les deux
-- versions auraient coexisté, et un appel à cinq arguments serait resté sur
-- l'ancienne — celle qui perd la dépense. La révocation est reposée après le
-- `drop`, qui emporte les droits avec lui.

drop function if exists public.recevoir_marchandise(uuid, numeric, numeric, text, uuid);

create function public.recevoir_marchandise(
  p_article_id uuid,
  p_quantite numeric,
  p_cout_unitaire numeric default null,
  p_motif text default null,
  p_user_id uuid default null,
  p_depense_id uuid default null,
  p_date_peremption date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reste     numeric := p_quantite;
  v_ligne     record;
  v_couvertes int := 0;
  v_mouvement uuid;
  v_apres     numeric;
  v_reserve   numeric;
begin
  if p_quantite is null or p_quantite <= 0 then
    raise exception 'La quantité reçue doit être supérieure à zéro.';
  end if;

  -- 1. L'entrée en stock, par le passage obligé des mouvements : c'est lui qui
  --    tient le coût moyen et qui refuse tout stock négatif.
  insert into public.mouvements_stock
    (article_id, type, quantite, cout_unitaire, motif, user_id, depense_id, date_peremption)
  values
    (p_article_id, 'entree', p_quantite, p_cout_unitaire, p_motif, p_user_id,
     p_depense_id, p_date_peremption)
  returning id, quantite_apres into v_mouvement, v_apres;

  -- 2. Et, SANS RELÂCHER LA TRANSACTION, la réservation pour ceux qui attendent.
  --
  --    C'est ici que tient toute la sûreté du lot : entre le moment où la
  --    marchandise entre en stock et celui où elle est réservée pour la cliente
  --    qui l'attend, il ne doit exister AUCUN instant. Une caisse ouverte au
  --    même moment la vendrait au premier venu.
  --
  --    L'ordre est celui des dates de commande : la première qui a commandé est
  --    la première servie. Ce n'est pas une optimisation, c'est la seule règle
  --    qu'on puisse expliquer à quelqu'un qui attend.
  for v_ligne in
    select l.id, l.quantite, l.commande_id
      from public.commandes_lignes l
      join public.commandes c on c.id = l.commande_id
     where l.article_id = p_article_id
       and l.sur_commande
       and c.statut = 'confirmee'
     order by c.confirmee_le, l.id
  loop
    exit when v_reste < v_ligne.quantite;

    update public.articles
       set stock_reserve = stock_reserve + v_ligne.quantite
     where id = p_article_id;

    -- La ligne rejoint le flux normal : elle n'attend plus le fournisseur.
    update public.commandes_lignes
       set sur_commande = false
     where id = v_ligne.id;

    v_reste := v_reste - v_ligne.quantite;
    v_couvertes := v_couvertes + 1;
  end loop;

  -- La réserve APRÈS la ronde. Relue, jamais déduite : c'est elle qui dira à
  -- l'application si l'article est vraiment redevenu disponible — et donc s'il
  -- faut, ou non, prévenir les clients inscrits à l'alerte de retour en stock.
  -- Avec la réserve d'avant, on annoncerait un retour déjà promis, et trois
  -- personnes viendraient pour un seul sac.
  select stock_reserve into v_reserve from public.articles where id = p_article_id;

  insert into public.journal_evenements (entite, entite_id, evenement, apres, user_id)
  values ('article', p_article_id, 'reception_marchandise',
          jsonb_build_object('quantite', p_quantite, 'lignes_couvertes', v_couvertes,
                             'reste_libre', v_reste, 'depense_id', p_depense_id),
          p_user_id);

  return jsonb_build_object(
    'mouvement_id', v_mouvement,
    'quantite_apres', v_apres,
    'stock_reserve_apres', v_reserve,
    'lignes_couvertes', v_couvertes,
    'reste_libre', v_reste);
end;
$function$;

comment on function public.recevoir_marchandise(uuid, numeric, numeric, text, uuid, uuid, date) is
  'Entrée de stock ET réservation pour les commandes en attente, dans la MÊME transaction. Sans cela, la marchandise reçue pourrait partir au comptoir avant la cliente qui l''attend. Porte depense_id et date_peremption, sans quoi le lien entre la facture du fournisseur et la marchandise serait rompu en silence.';

revoke all on function public.recevoir_marchandise(uuid, numeric, numeric, text, uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.recevoir_marchandise(uuid, numeric, numeric, text, uuid, uuid, date) to service_role;
