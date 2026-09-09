-- La vue gagne des colonnes au milieu : « create or replace » ne sait pas le
-- faire, on la repose. Le site vitrine est un projet séparé qui la relit.
drop view if exists public.articles_vitrine;

create view public.articles_vitrine as
  select reference,
         nom,
         description,
         categorie,
         array_position(array[
           'alimentation_seche', 'alimentation_humide', 'friandises', 'mastication', 'litiere',
           'colliers', 'laisses', 'harnais', 'muselieres', 'longes',
           'jouets', 'peluches', 'couchages', 'soins', 'medaillons_accessoires', 'divers'
         ], categorie) as ordre_categorie,
         marque,
         prix_vente,
         unite,
         photo_path,
         type_article,
         delai_fabrication_jours,
         expediable,
         poids_grammes,
         greatest(stock_actuel - stock_reserve, 0) as stock_disponible,
         type_article = 'personnalisable'
           or (stock_actuel - stock_reserve) > 0::numeric as en_stock
    from articles a
   where actif = true and vendable_en_ligne = true and composant = false;

alter table public.commandes enable row level security;
alter table public.commandes_lignes enable row level security;

drop policy if exists commandes_client_lecture on public.commandes;
create policy commandes_client_lecture on public.commandes for select
  using (
    public.peut_boutique()
    or client_id in (select id from public.clients where auth_user_id = auth.uid())
  );

drop policy if exists commandes_personnel_ecriture on public.commandes;
create policy commandes_personnel_ecriture on public.commandes for all
  using (public.peut_boutique()) with check (public.peut_boutique());

drop policy if exists commandes_lignes_lecture on public.commandes_lignes;
create policy commandes_lignes_lecture on public.commandes_lignes for select
  using (
    public.peut_boutique()
    or commande_id in (
      select c.id from public.commandes c
       join public.clients cl on cl.id = c.client_id
      where cl.auth_user_id = auth.uid()
    )
  );

drop policy if exists commandes_lignes_personnel on public.commandes_lignes;
create policy commandes_lignes_personnel on public.commandes_lignes for all
  using (public.peut_boutique()) with check (public.peut_boutique());