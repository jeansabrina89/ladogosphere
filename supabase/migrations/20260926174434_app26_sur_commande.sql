-- APP 26 : commander un article que la pension n'a pas en stock.
--
-- Aujourd'hui, une vente sur un stock à zéro est refusée, et tous les articles
-- sont à zéro. Sabrina veut pouvoir commander l'aliment chez son fournisseur, à
-- condition que le client connaisse le délai AVANT d'acheter.
--
-- ── Les quatre décisions qui portent cette migration ──────────────────────
--
-- 1. LE DÉLAI SE RÈGLE PAR FOURNISSEUR, avec exception par article. Un même
--    fournisseur livre à peu près au même rythme ; saisir le délai sur chacun
--    de ses articles serait le saisir cinquante fois, et le corriger cinquante
--    fois le jour où il change.
--
-- 2. UN ARTICLE COCHÉ SANS DÉLAI CONNU N'EST PAS COMMANDABLE. On ne promet pas
--    un délai qu'on ignore : l'article reste « Épuisé » pour le client, et
--    l'écran d'administration le signale à Sabrina. C'est la règle que porte
--    `delai_commande_effectif`, et elle est testée sous mutation.
--
-- 3. UNE LIGNE SUR COMMANDE NE RÉSERVE PAS DE STOCK — décision de Sabrina du
--    26.09.2026, après examen. `reserver_stock_commande` monte `stock_reserve`
--    pour toute ligne sauf les articles sur mesure ; y ajouter les lignes sur
--    commande ferait passer `stock_actuel - stock_reserve` SOUS ZÉRO, et la
--    caisse au comptoir refuserait ensuite des ventes d'articles réellement
--    présents. Les lignes sur commande sont donc exclues, exactement comme les
--    articles sur mesure le sont déjà.
--
-- 4. CE QUI REND LA DÉCISION 3 SÛRE : à la réception, l'entrée en stock et la
--    réservation pour les commandes en attente se font dans la MÊME
--    transaction, par ordre de date de commande (`recevoir_marchandise`). Il
--    n'existe aucun instant où la marchandise reçue serait en stock sans être
--    réservée — sinon elle pourrait partir au comptoir avant le client qui
--    l'attend depuis trois semaines.
--
-- ── Ce qui N'EST PAS touché ───────────────────────────────────────────────
--
-- Le trigger `appliquer_mouvement_stock` garde son refus : aucun stock négatif,
-- pour personne, par aucune voie. C'est le garde-fou commun à la caisse et à la
-- boutique, et ce lot ne l'approche pas.
--
-- La facture part toujours quand la marchandise est remise ou expédiée. Rien
-- n'avance ni ne recule dans la comptabilité.

-- ── Les trois colonnes ajoutées à la vitrine, et pourquoi elles sont publiques
--
-- CETTE VUE EST PUBLIQUE : le site la lit avec la clé anon (garde S-04). Une
-- colonne de plus se décide donc ici, par écrit, jamais au passage.
--
-- `sur_commande` — ce qui s'achète même à stock zéro. C'est le booléen UTILE,
--    et non la case cochée : il vaut vrai seulement si un délai est connu. Le
--    visiteur doit savoir qu'il peut commander ; c'est toute la raison du lot.
--
-- `delai_commande_min_jours`, `delai_commande_max_jours` — le délai annoncé,
--    en jours ouvrables. C'est la condition posée par Sabrina : le client
--    connaît l'attente AVANT de payer, pas après. Un délai caché serait une
--    promesse qu'on n'a pas faite.
--
-- Ce qui N'entre PAS dans la vue, et c'est délibéré : le nom du fournisseur, et
-- son identifiant. Savoir chez quel grossiste la pension se fournit est une
-- donnée commerciale qui ne regarde pas le visiteur. Le délai sort, sa source
-- reste. `delai_commande_effectif` est justement là pour que la vue publie le
-- résultat du calcul sans jamais joindre `fournisseurs` à la vue.

-- ── 1. Le délai du fournisseur ────────────────────────────────────────────

alter table public.fournisseurs
  add column if not exists delai_commande_min_jours int,
  add column if not exists delai_commande_max_jours int;

alter table public.fournisseurs drop constraint if exists fournisseurs_delai_commande_check;
alter table public.fournisseurs add constraint fournisseurs_delai_commande_check check (
  (delai_commande_min_jours is null or delai_commande_min_jours >= 0)
  and (delai_commande_max_jours is null or delai_commande_max_jours >= 0)
  and (delai_commande_min_jours is null or delai_commande_max_jours is null
       or delai_commande_min_jours <= delai_commande_max_jours)
);

comment on column public.fournisseurs.delai_commande_min_jours is
  'Délai de commande habituel, en JOURS OUVRABLES, borne basse. NULL = inconnu : ses articles ne sont alors pas commandables en rupture, sauf délai propre à l''article.';
comment on column public.fournisseurs.delai_commande_max_jours is
  'Même délai, borne haute. C''est celle qu''on annonce au client quand on n''en annonce qu''une.';

-- ── 2. L'article : la case, et son exception de délai ─────────────────────

alter table public.articles
  add column if not exists disponible_sur_commande boolean not null default false,
  add column if not exists delai_commande_min_jours int,
  add column if not exists delai_commande_max_jours int;

alter table public.articles drop constraint if exists articles_delai_commande_check;
alter table public.articles add constraint articles_delai_commande_check check (
  (delai_commande_min_jours is null or delai_commande_min_jours >= 0)
  and (delai_commande_max_jours is null or delai_commande_max_jours >= 0)
  and (delai_commande_min_jours is null or delai_commande_max_jours is null
       or delai_commande_min_jours <= delai_commande_max_jours)
);

comment on column public.articles.disponible_sur_commande is
  'Cochée : cet article se commande même à stock zéro, SI un délai effectif est connu (voir delai_commande_effectif). Décochée : « Épuisé », comme avant.';
comment on column public.articles.delai_commande_min_jours is
  'Exception au délai du fournisseur, pour CET article. NULL = on prend celui du fournisseur.';
comment on column public.articles.delai_commande_max_jours is
  'Exception au délai du fournisseur, borne haute.';

-- ── 3. Le délai effectif : UNE seule définition, en base ──────────────────
--
-- En base, et non dans le code, parce que les deux consommateurs sont en SQL :
-- la vue `articles_vitrine`, qui montre le délai au visiteur, et
-- `confirmer_commande`, qui le FIGE sur la ligne. Un calcul écrit en TypeScript
-- devrait être recopié dans la vue, et le jour où les deux divergeraient, le
-- client verrait un délai et la commande en garderait un autre.
--
-- `stable` et non `immutable` : elle lit deux tables.
create or replace function public.delai_commande_effectif(p_article_id uuid)
returns table (min_jours int, max_jours int)
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(a.delai_commande_min_jours, f.delai_commande_min_jours),
         coalesce(a.delai_commande_max_jours, f.delai_commande_max_jours)
    from public.articles a
    left join public.fournisseurs f on f.id = a.fournisseur_id
   where a.id = p_article_id;
$$;

comment on function public.delai_commande_effectif(uuid) is
  'Le délai annoncé pour un article : celui de l''article s''il en a un, sinon celui de son fournisseur. Les deux NULL = délai inconnu, donc article NON commandable en rupture.';

revoke execute on function public.delai_commande_effectif(uuid) from public, anon, authenticated;
grant execute on function public.delai_commande_effectif(uuid) to service_role;

-- ── 4. La ligne de commande : le délai FIGÉ ───────────────────────────────
--
-- Figé comme le sont déjà le prix et le taux de TVA : un fournisseur qui
-- rallonge son délai le mois prochain ne change pas ce qui a été promis à
-- quelqu'un ce mois-ci.
alter table public.commandes_lignes
  add column if not exists sur_commande boolean not null default false,
  add column if not exists delai_commande_min_jours int,
  add column if not exists delai_commande_max_jours int,
  add column if not exists commandee_au_fournisseur_le date;

comment on column public.commandes_lignes.sur_commande is
  'Cette ligne attend une commande chez le fournisseur : au moment de la confirmation, le stock disponible ne la couvrait pas.';
comment on column public.commandes_lignes.delai_commande_min_jours is
  'Le délai PROMIS au client, figé à la confirmation. Un changement chez le fournisseur ne le modifie plus.';
comment on column public.commandes_lignes.commandee_au_fournisseur_le is
  'Date à laquelle Sabrina a passé la commande chez le fournisseur. NULL = pas encore commandée.';

create index if not exists commandes_lignes_sur_commande_idx
  on public.commandes_lignes (article_id)
  where sur_commande and commandee_au_fournisseur_le is null;

-- ── 5. La vitrine publique : trois colonnes de plus, et pas une de plus ───
--
-- Ce que le visiteur doit savoir avant d'acheter : que l'article se commande,
-- et sous combien de jours. Rien d'autre.
--
-- LE NOM DU FOURNISSEUR NE SORT PAS. C'est une donnée commerciale : savoir que
-- la pension se fournit chez tel grossiste ne regarde pas le visiteur, et la
-- liste des colonnes de cette vue tient lieu de garde depuis APP 24-filtres
-- (S-04). On ne publie que le délai, jamais sa source.
--
-- `sur_commande` est le booléen UTILE : coché ET délai connu. Un article coché
-- sans délai sort donc avec `sur_commande = false` et `en_stock = false`, c'est
-- à dire « Épuisé » — la règle n° 2 de l'en-tête, appliquée là où le client la
-- lit.
--
-- La définition ci-dessous est relue par `pg_get_viewdef`, jamais reconstituée :
-- `ordre_categorie` et `en_stock` sont des expressions CALCULÉES et le filtre
-- porte cinq conditions. Au lot APP 25, une vue réécrite de mémoire aurait
-- éteint la vitrine.
create or replace view public.articles_vitrine
with (security_invoker = false) as
select
  a.id,
  a.reference,
  a.nom,
  a.description,
  a.categorie,
  array_position(
    array['alimentation_seche', 'alimentation_humide', 'friandises', 'mastication',
          'litiere', 'colliers', 'laisses', 'harnais', 'muselieres', 'longes',
          'jouets', 'peluches', 'couchages', 'soins', 'medaillons_accessoires',
          'divers']::text[],
    a.categorie
  ) as ordre_categorie,
  a.marque,
  a.prix_vente,
  a.unite,
  a.photo_path,
  a.type_article,
  a.delai_fabrication_jours,
  a.expediable,
  a.poids_grammes,
  a.type_article = 'personnalisable' or (a.stock_actuel - a.stock_reserve) > 0::numeric as en_stock,
  a.date_limite,
  a.remise_membre_exclue,
  a.ages,
  a.besoins,
  a.tailles_chien,
  a.proteines,
  a.sans_cereales,
  a.monoproteine,
  a.taille_article,
  a.couleurs,
  a.matieres,
  a.usages_jouet,
  a.gouts,
  a.disponible_sur_commande and d.max_jours is not null as sur_commande,
  d.min_jours as delai_commande_min_jours,
  d.max_jours as delai_commande_max_jours
from public.articles a
left join lateral public.delai_commande_effectif(a.id) d on true
where a.actif = true
  and a.vendable_en_ligne = true
  and a.composant = false
  and a.statut_vitrine = 'publie'
  and (a.date_publication is null or a.date_publication <= now());

revoke all on public.articles_vitrine from anon, authenticated;
grant select on public.articles_vitrine to anon, authenticated;

-- ── 6. La confirmation : ce qui manque part « sur commande » ──────────────
--
-- Le contrôle de stock existant refusait toute la commande dès qu'un article
-- manquait. Il garde ce refus pour les articles qui ne se commandent pas, et
-- laisse passer ceux qui se commandent — en MARQUANT la ligne et en y figeant
-- le délai.
--
-- La ligne passe ENTIÈRE sur commande, jamais coupée en deux : le client qui
-- en veut trois et dont il reste un attend ses trois ensemble. Couper la ligne
-- lui ferait deux retraits, deux trajets, pour une seule envie.
create or replace function public.confirmer_commande(
  p_commande_id uuid, p_mode_remise text, p_reservation_id uuid, p_adresse jsonb,
  p_frais_port numeric, p_remise_membre numeric, p_montant_total numeric,
  p_mode_paiement text, p_cle_idempotence text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cmd      record;
  v_exercice int := extract(year from now())::int;
  v_numero   text;
  v_manque   record;
begin
  select * into v_cmd from public.commandes where id = p_commande_id for update;
  if not found then raise exception 'Commande introuvable.'; end if;

  if v_cmd.statut <> 'panier' then
    return jsonb_build_object('id', v_cmd.id, 'numero', v_cmd.numero, 'deja', true);
  end if;

  if p_cle_idempotence is not null then
    perform 1 from public.commandes
      where cle_idempotence = p_cle_idempotence and id <> p_commande_id;
    if found then raise exception 'Cette commande a déjà été enregistrée.'; end if;
  end if;

  if not exists (select 1 from public.commandes_lignes where commande_id = p_commande_id) then
    raise exception 'Votre panier est vide.';
  end if;

  -- Ce qui manque ET ne se commande pas : le refus d'avant, mot pour mot.
  select ar.nom, ar.stock_actuel - ar.stock_reserve as dispo, sum(l.quantite) as demande
    into v_manque
    from public.commandes_lignes l
    join public.articles ar on ar.id = l.article_id
    left join lateral public.delai_commande_effectif(ar.id) d on true
   where l.commande_id = p_commande_id
     and ar.type_article <> 'personnalisable'
     and not (ar.disponible_sur_commande and d.max_jours is not null)
   group by ar.id, ar.nom, ar.stock_actuel, ar.stock_reserve
  having sum(l.quantite) > ar.stock_actuel - ar.stock_reserve
   limit 1;

  if found then
    raise exception '« % » n''est plus disponible en quantité suffisante : il en reste %, vous en demandez %.',
      v_manque.nom, greatest(v_manque.dispo, 0), v_manque.demande;
  end if;

  -- Ce qui manque ET se commande : la ligne part sur commande, avec son délai
  -- figé. On compare la ligne au disponible de SON article, quantité comprise.
  update public.commandes_lignes l
     set sur_commande = true,
         delai_commande_min_jours = d.min_jours,
         delai_commande_max_jours = d.max_jours
    from public.articles ar
    left join lateral public.delai_commande_effectif(ar.id) d on true
   where l.commande_id = p_commande_id
     and ar.id = l.article_id
     and ar.type_article <> 'personnalisable'
     and ar.disponible_sur_commande
     and d.max_jours is not null
     and l.quantite > ar.stock_actuel - ar.stock_reserve;

  perform public.reserver_stock_commande(p_commande_id, 1);

  v_numero := public.prochain_numero_facture(v_exercice, 'WEB');

  update public.commandes
     set numero = v_numero,
         statut = 'confirmee',
         mode_remise = p_mode_remise,
         reservation_id = p_reservation_id,
         adresse_livraison = p_adresse,
         frais_port = coalesce(p_frais_port, 0),
         remise_membre = coalesce(p_remise_membre, 0),
         montant_total = p_montant_total,
         mode_paiement = p_mode_paiement,
         exercice = v_exercice,
         cle_idempotence = p_cle_idempotence,
         confirmee_le = now()
   where id = p_commande_id;

  insert into public.journal_evenements (entite, entite_id, evenement, apres, user_id)
  values ('commande_en_ligne', p_commande_id, 'confirmation',
          jsonb_build_object('numero', v_numero, 'total', p_montant_total,
                             'mode_remise', p_mode_remise, 'mode_paiement', p_mode_paiement,
                             'remise_membre', coalesce(p_remise_membre, 0),
                             'frais_port', coalesce(p_frais_port, 0),
                             'lignes_sur_commande',
                             (select count(*) from public.commandes_lignes
                               where commande_id = p_commande_id and sur_commande)),
          p_user_id);

  return jsonb_build_object('id', p_commande_id, 'numero', v_numero, 'deja', false);
end;
$function$;

revoke all on function public.confirmer_commande(uuid, text, uuid, jsonb, numeric, numeric, numeric, text, text, uuid) from public, anon, authenticated;
grant execute on function public.confirmer_commande(uuid, text, uuid, jsonb, numeric, numeric, numeric, text, text, uuid) to service_role;

-- ── 7. La réservation : les lignes sur commande en sont exclues ───────────
--
-- Décision de Sabrina du 26.09.2026 (voir l'en-tête, décision 3). Réserver un
-- stock qui n'existe pas ferait passer le disponible sous zéro, et la caisse
-- refuserait des ventes d'articles présents.
create or replace function public.reserver_stock_commande(p_commande_id uuid, p_sens integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.articles a
     set stock_reserve = greatest(a.stock_reserve + p_sens * s.q, 0)
    from (
      select l.article_id, sum(l.quantite) as q
        from public.commandes_lignes l
        join public.articles ar on ar.id = l.article_id
       where l.commande_id = p_commande_id
         and ar.type_article <> 'personnalisable'
         and not l.sur_commande
       group by l.article_id
    ) s
   where a.id = s.article_id;
end;
$function$;

revoke all on function public.reserver_stock_commande(uuid, integer) from public, anon, authenticated;
grant execute on function public.reserver_stock_commande(uuid, integer) to service_role;

-- ── 8. La réception : entrée et réservation dans la MÊME transaction ──────
--
-- C'est cette fonction qui rend sûre la décision de ne pas réserver.
--
-- Entre le moment où la marchandise entre en stock et celui où elle est
-- réservée pour le client qui l'attend, il ne doit exister AUCUN instant : une
-- caisse ouverte au même moment la vendrait au premier venu, et le client qui
-- patiente depuis trois semaines repartirait les mains vides. Les deux gestes
-- tiennent donc dans une seule fonction, donc dans une seule transaction.
--
-- L'ordre est celui des dates de commande : le premier qui a commandé est le
-- premier servi. Ce n'est pas une optimisation, c'est la seule règle qu'on
-- puisse expliquer à quelqu'un qui attend.
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
  v_reste    numeric := p_quantite;
  v_ligne    record;
  v_couvertes int := 0;
begin
  if p_quantite is null or p_quantite <= 0 then
    raise exception 'La quantité reçue doit être supérieure à zéro.';
  end if;

  -- 1. L'entrée en stock, par le passage obligé des mouvements : c'est lui qui
  --    tient le coût moyen et qui refuse tout stock négatif.
  insert into public.mouvements_stock (article_id, type, quantite, cout_unitaire, motif, user_id)
  values (p_article_id, 'entree', p_quantite, p_cout_unitaire, p_motif, p_user_id);

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

  insert into public.journal_evenements (entite, entite_id, evenement, apres, user_id)
  values ('article', p_article_id, 'reception_marchandise',
          jsonb_build_object('quantite', p_quantite, 'lignes_couvertes', v_couvertes,
                             'reste_libre', v_reste),
          p_user_id);

  return jsonb_build_object('lignes_couvertes', v_couvertes, 'reste_libre', v_reste);
end;
$function$;

comment on function public.recevoir_marchandise(uuid, numeric, numeric, text, uuid) is
  'Entrée de stock ET réservation pour les commandes en attente, dans la MÊME transaction. Sans cela, la marchandise reçue pourrait partir au comptoir avant le client qui l''attend.';

revoke all on function public.recevoir_marchandise(uuid, numeric, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.recevoir_marchandise(uuid, numeric, numeric, text, uuid) to service_role;
