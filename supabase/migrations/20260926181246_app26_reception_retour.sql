-- APP 26 : `recevoir_marchandise` rend ce que l'application doit savoir.
--
-- La fonction posée plus tôt dans ce lot faisait le bon travail — entrée en
-- stock ET réservation dans la MÊME transaction — mais ne rendait que le
-- décompte des lignes couvertes. Or `enregistrerMouvement`, le point unique par
-- lequel tout mouvement de stock passe dans l'application, a besoin de trois
-- choses de plus pour continuer son travail :
--
--   * `mouvement_id`       — il le rend à son appelant ;
--   * `quantite_apres`     — le stock après coup, tenu par le trigger ;
--   * `stock_reserve_apres`— la réservation APRÈS la ronde, et c'est le point
--                            délicat : celle d'avant est périmée dès que la
--                            fonction a servi une commande en attente.
--
-- Sans `stock_reserve_apres`, l'application calculerait le disponible d'après
-- avec la réserve d'avant. Elle croirait l'article « revenu en stock », et
-- préviendrait les clients inscrits à l'alerte pour une marchandise déjà
-- promise à quelqu'un d'autre. Trois personnes viendraient pour un sac.
--
-- La logique de la fonction ne change pas d'une ligne : seul son retour
-- s'étoffe.

create or replace function public.recevoir_marchandise(
  p_article_id uuid,
  p_quantite numeric,
  p_cout_unitaire numeric default null,
  p_motif text default null,
  p_user_id uuid default null
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
  insert into public.mouvements_stock (article_id, type, quantite, cout_unitaire, motif, user_id)
  values (p_article_id, 'entree', p_quantite, p_cout_unitaire, p_motif, p_user_id)
  returning id, quantite_apres into v_mouvement, v_apres;

  -- 2. Et, SANS RELÂCHER LA TRANSACTION, la réservation pour ceux qui attendent.
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
  -- l'application si l'article est vraiment redevenu disponible.
  select stock_reserve into v_reserve from public.articles where id = p_article_id;

  insert into public.journal_evenements (entite, entite_id, evenement, apres, user_id)
  values ('article', p_article_id, 'reception_marchandise',
          jsonb_build_object('quantite', p_quantite, 'lignes_couvertes', v_couvertes,
                             'reste_libre', v_reste),
          p_user_id);

  return jsonb_build_object(
    'mouvement_id', v_mouvement,
    'quantite_apres', v_apres,
    'stock_reserve_apres', v_reserve,
    'lignes_couvertes', v_couvertes,
    'reste_libre', v_reste);
end;
$function$;

comment on function public.recevoir_marchandise(uuid, numeric, numeric, text, uuid) is
  'Entrée de stock ET réservation pour les commandes en attente, dans la MÊME transaction. Sans cela, la marchandise reçue pourrait partir au comptoir avant le client qui l''attend. Rend mouvement_id, quantite_apres et stock_reserve_apres : l''application en a besoin pour ne pas annoncer un retour en stock déjà promis.';

revoke all on function public.recevoir_marchandise(uuid, numeric, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.recevoir_marchandise(uuid, numeric, numeric, text, uuid) to service_role;
