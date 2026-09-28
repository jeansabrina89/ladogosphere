-- APP 32 — Supprimer un article qui n'a JAMAIS servi.
--
-- Dès qu'un article a servi, il appartient aux pièces comptables : il ne peut
-- plus qu'être retiré de la vente (actif = false). Ce qui suit ne sert donc
-- qu'au cas inverse — la coquille créée par erreur, jamais vendue, jamais
-- mouvementée.
--
-- ── POURQUOI LES CLÉS ÉTRANGÈRES NE SUFFISENT PAS ──────────────────────────
--
-- Dix tables référencent `articles` (relevé le 28.09.2026), et leur ON DELETE
-- n'est PAS uniforme :
--
--   RESTRICT (4) : ventes_lignes, commandes_lignes, commandes_personnalisees,
--                  mouvements_stock
--   CASCADE  (4) : alertes_stock, article_modeles, options_groupes,
--                  promotions_articles
--   SET NULL (2) : options_valeurs.composant_article_id,
--                  commandes_choix.composant_article_id
--
-- Les quatre RESTRICT bloqueraient un DELETE — mais par une erreur SQL brute,
-- que personne ne devrait avoir à lire. Les six autres sont le vrai danger :
-- elles laisseraient passer la suppression EN SILENCE, en emportant avec elle
-- l'alerte « retour en stock » d'une cliente qui attend, les options d'un
-- article sur mesure, ses lignes de promotion, et en vidant la référence du
-- composant dans des commandes déjà passées.
--
-- D'où une garde explicite, qui ne distingue pas les trois comportements :
-- une ligne quelque part, c'est un article qui a servi.

-- ── LA GARDE ───────────────────────────────────────────────────────────────

create or replace function public.article_supprimable(p_article_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_trouve boolean;
begin
  if p_article_id is null then
    return false;
  end if;

  if not exists (select 1 from public.articles where id = p_article_id) then
    return false;
  end if;

  /*
   * LES TABLES NE SONT PAS ÉNUMÉRÉES À LA MAIN, et c'est le cœur de cette
   * fonction.
   *
   * Une liste écrite ici aurait vieilli à la onzième clé étrangère : quelqu'un
   * ajoute une table qui référence `articles`, oublie cette fonction, et la
   * suppression se remet à détruire en silence ce que la nouvelle table
   * contenait. Le catalogue de Postgres, lui, est toujours à jour — il EST la
   * définition de « quelque chose référence cet article ».
   *
   * `format(%I)` cite les identifiants : aucun nom de table venu du catalogue
   * ne peut être interprété comme du SQL.
   */
  for r in
    select src.relname as table_source,
           att.attname as colonne
      from pg_constraint con
      join pg_class src on src.oid = con.conrelid
      join pg_namespace ns on ns.oid = src.relnamespace
      join lateral unnest(con.conkey) as k(attnum) on true
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
     where con.contype = 'f'
       and con.confrelid = 'public.articles'::regclass
       and ns.nspname = 'public'
  loop
    execute format(
      'select exists (select 1 from public.%I where %I = $1)',
      r.table_source, r.colonne
    ) into v_trouve using p_article_id;

    if v_trouve then
      return false;
    end if;
  end loop;

  return true;
end;
$function$;

comment on function public.article_supprimable(uuid) is
  'Vrai seulement si AUCUNE ligne d''AUCUNE table ne référence cet article. Les tables sont lues dans pg_constraint, jamais énumérées : une onzième clé étrangère est couverte sans qu''on y pense.';

revoke all on function public.article_supprimable(uuid) from public, anon, authenticated;
grant execute on function public.article_supprimable(uuid) to service_role;

-- ── LA SUPPRESSION ─────────────────────────────────────────────────────────

create or replace function public.supprimer_article(
  p_article_id uuid,
  p_user_id uuid default null
)
returns table (reference text, nom text, photo_path text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reference text;
  v_nom text;
  v_photo text;
begin
  /*
   * LA GARDE EST RELUE ICI, DANS LA MÊME TRANSACTION QUE LE DELETE.
   *
   * L'écran l'a déjà demandée pour décider s'il montrait le bouton, mais entre
   * l'affichage et le clic une cliente peut s'être inscrite à l'alerte de
   * retour en stock, ou une vente être passée à la caisse. Un contrôle fait à
   * l'affichage ne protège de rien : il informe.
   *
   * Aucune ligne rendue = refus. Pas d'exception : l'action serveur veut un
   * message pour l'utilisatrice, pas une erreur Postgres à traduire.
   */
  if not public.article_supprimable(p_article_id) then
    return;
  end if;

  select a.reference, a.nom, a.photo_path
    into v_reference, v_nom, v_photo
    from public.articles a
   where a.id = p_article_id;

  delete from public.articles where id = p_article_id;

  /*
   * La trace part APRÈS le DELETE, et dans la même transaction : si la
   * suppression échoue, rien n'est écrit ; si elle réussit, la trace ne peut
   * pas manquer. `journal_evenements` n'a aucune clé étrangère vers
   * `articles` — c'est ce qui permet à la trace de survivre à l'article.
   */
  insert into public.journal_evenements (entite, entite_id, evenement, avant, user_id)
  values (
    'article',
    p_article_id,
    'suppression',
    jsonb_build_object('reference', v_reference, 'nom', v_nom),
    p_user_id
  );

  return query select v_reference, v_nom, v_photo;
end;
$function$;

comment on function public.supprimer_article(uuid, uuid) is
  'Supprime un article SI article_supprimable le permet, relu dans la même transaction que le DELETE. Rend zéro ligne si l''article a servi. Trace le geste au journal.';

revoke all on function public.supprimer_article(uuid, uuid) from public, anon, authenticated;
grant execute on function public.supprimer_article(uuid, uuid) to service_role;
