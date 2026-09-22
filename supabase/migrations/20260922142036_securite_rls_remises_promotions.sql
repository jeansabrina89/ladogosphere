-- S-01 (audit du 22 septembre 2026) : trois tables sans RLS, ouvertes aux rôles publics.
-- Même serrure que parametres : lecture personnel, écriture admin. Le serveur (service_role) n'est pas concerné.

alter table public.remise_membre_categories enable row level security;
alter table public.promotions enable row level security;
alter table public.promotions_articles enable row level security;

revoke all on public.remise_membre_categories, public.promotions, public.promotions_articles from anon;
revoke all on public.remise_membre_categories, public.promotions, public.promotions_articles from authenticated;
grant select on public.remise_membre_categories, public.promotions, public.promotions_articles to authenticated;

create policy "personnel_select_remise_membre_categories" on public.remise_membre_categories
  for select to authenticated using (is_personnel());
create policy "admin_all_remise_membre_categories" on public.remise_membre_categories
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "personnel_select_promotions" on public.promotions
  for select to authenticated using (is_personnel());
create policy "admin_all_promotions" on public.promotions
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "personnel_select_promotions_articles" on public.promotions_articles
  for select to authenticated using (is_personnel());
create policy "admin_all_promotions_articles" on public.promotions_articles
  for all to authenticated using (is_admin()) with check (is_admin());