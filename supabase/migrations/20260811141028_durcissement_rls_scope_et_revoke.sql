-- Lot 2a — Durcissement RLS (audit #5, #8, #20).
-- 1) Re-scope à authenticated les politiques ouvertes à public.
-- 2) Remplace auth.uid()/mon_employe_id()/is_admin() par (select ...) (perf initplan).
-- 3) Révoque l'EXECUTE des 3 fonctions pour PUBLIC/anon, ré-accorde à authenticated+service_role.
-- Ordre impératif : re-scope AVANT revoke, le tout dans une transaction.
BEGIN;

-- ===== profiles =====
DROP POLICY IF EXISTS self_read_profiles ON public.profiles;
CREATE POLICY self_read_profiles ON public.profiles FOR SELECT TO authenticated
  USING (id = (select auth.uid()));

-- ===== clients =====
DROP POLICY IF EXISTS client_self_select ON public.clients;
CREATE POLICY client_self_select ON public.clients FOR SELECT TO authenticated
  USING (auth_user_id = (select auth.uid()));

-- ===== chiens =====
DROP POLICY IF EXISTS client_select_chiens ON public.chiens;
CREATE POLICY client_select_chiens ON public.chiens FOR SELECT TO authenticated
  USING (client_id IN (SELECT clients.id FROM clients WHERE clients.auth_user_id = (select auth.uid())));

-- ===== reservations =====
DROP POLICY IF EXISTS client_select_reservations ON public.reservations;
CREATE POLICY client_select_reservations ON public.reservations FOR SELECT TO authenticated
  USING (client_id IN (SELECT clients.id FROM clients WHERE clients.auth_user_id = (select auth.uid())));

-- ===== reservation_chiens =====
DROP POLICY IF EXISTS client_select_reservation_chiens ON public.reservation_chiens;
CREATE POLICY client_select_reservation_chiens ON public.reservation_chiens FOR SELECT TO authenticated
  USING (reservation_id IN (SELECT r.id FROM reservations r
         WHERE r.client_id IN (SELECT c.id FROM clients c WHERE c.auth_user_id = (select auth.uid()))));

-- ===== avoirs_mouvements =====
DROP POLICY IF EXISTS client_select_avoirs_mouvements ON public.avoirs_mouvements;
CREATE POLICY client_select_avoirs_mouvements ON public.avoirs_mouvements FOR SELECT TO authenticated
  USING (client_id IN (SELECT clients.id FROM clients WHERE clients.auth_user_id = (select auth.uid())));

-- ===== reservation_extras (public -> authenticated) =====
DROP POLICY IF EXISTS client_select_reservation_extras ON public.reservation_extras;
CREATE POLICY client_select_reservation_extras ON public.reservation_extras FOR SELECT TO authenticated
  USING (reservation_id IN (SELECT r.id FROM reservations r
         WHERE r.client_id IN (SELECT c.id FROM clients c WHERE c.auth_user_id = (select auth.uid()))));
DROP POLICY IF EXISTS admin_all_reservation_extras ON public.reservation_extras;
CREATE POLICY admin_all_reservation_extras ON public.reservation_extras FOR ALL TO authenticated
  USING ((select is_admin())) WITH CHECK ((select is_admin()));

-- ===== employes_rh (public -> authenticated) =====
DROP POLICY IF EXISTS employe_self_select_employes_rh ON public.employes_rh;
CREATE POLICY employe_self_select_employes_rh ON public.employes_rh FOR SELECT TO authenticated
  USING (profile_id = (select auth.uid()));

-- ===== demandes_vacances (public -> authenticated) =====
DROP POLICY IF EXISTS employe_self_select_vacances ON public.demandes_vacances;
CREATE POLICY employe_self_select_vacances ON public.demandes_vacances FOR SELECT TO authenticated
  USING (employe_id = (select mon_employe_id()));
DROP POLICY IF EXISTS employe_insert_vacances ON public.demandes_vacances;
CREATE POLICY employe_insert_vacances ON public.demandes_vacances FOR INSERT TO authenticated
  WITH CHECK (employe_id = (select mon_employe_id()));
DROP POLICY IF EXISTS employe_update_vacances ON public.demandes_vacances;
CREATE POLICY employe_update_vacances ON public.demandes_vacances FOR UPDATE TO authenticated
  USING (employe_id = (select mon_employe_id())) WITH CHECK (employe_id = (select mon_employe_id()));

-- ===== fiches_salaire (public -> authenticated) =====
DROP POLICY IF EXISTS employe_self_select_fiches_salaire ON public.fiches_salaire;
CREATE POLICY employe_self_select_fiches_salaire ON public.fiches_salaire FOR SELECT TO authenticated
  USING (employe_id = (select mon_employe_id()));

-- ===== fiche_salaire_deductions (public -> authenticated) =====
DROP POLICY IF EXISTS employe_self_select_fiche_deductions ON public.fiche_salaire_deductions;
CREATE POLICY employe_self_select_fiche_deductions ON public.fiche_salaire_deductions FOR SELECT TO authenticated
  USING (fiche_id IN (SELECT fiches_salaire.id FROM fiches_salaire WHERE fiches_salaire.employe_id = (select mon_employe_id())));

-- ===== indisponibilites (public -> authenticated) =====
DROP POLICY IF EXISTS employe_self_select_indispo ON public.indisponibilites;
CREATE POLICY employe_self_select_indispo ON public.indisponibilites FOR SELECT TO authenticated
  USING (employe_id = (select mon_employe_id()));
DROP POLICY IF EXISTS employe_insert_indispo ON public.indisponibilites;
CREATE POLICY employe_insert_indispo ON public.indisponibilites FOR INSERT TO authenticated
  WITH CHECK (employe_id = (select mon_employe_id()));
DROP POLICY IF EXISTS employe_update_indispo ON public.indisponibilites;
CREATE POLICY employe_update_indispo ON public.indisponibilites FOR UPDATE TO authenticated
  USING (employe_id = (select mon_employe_id())) WITH CHECK (employe_id = (select mon_employe_id()));
DROP POLICY IF EXISTS employe_delete_indispo ON public.indisponibilites;
CREATE POLICY employe_delete_indispo ON public.indisponibilites FOR DELETE TO authenticated
  USING (employe_id = (select mon_employe_id()));

-- ===== planning_employes (public -> authenticated) =====
DROP POLICY IF EXISTS employe_self_select_planning ON public.planning_employes;
CREATE POLICY employe_self_select_planning ON public.planning_employes FOR SELECT TO authenticated
  USING (employe_id = (select mon_employe_id()));

-- ===== timbrage (public -> authenticated) =====
DROP POLICY IF EXISTS employe_self_select_timbrage ON public.timbrage;
CREATE POLICY employe_self_select_timbrage ON public.timbrage FOR SELECT TO authenticated
  USING (employe_id = (select mon_employe_id()));
DROP POLICY IF EXISTS employe_insert_timbrage ON public.timbrage;
CREATE POLICY employe_insert_timbrage ON public.timbrage FOR INSERT TO authenticated
  WITH CHECK (employe_id = (select mon_employe_id()));
DROP POLICY IF EXISTS employe_update_timbrage ON public.timbrage;
CREATE POLICY employe_update_timbrage ON public.timbrage FOR UPDATE TO authenticated
  USING (employe_id = (select mon_employe_id())) WITH CHECK (employe_id = (select mon_employe_id()));

-- ===== Révocation des 3 fonctions pour PUBLIC/anon, ré-octroi authenticated+service_role =====
REVOKE EXECUTE ON FUNCTION public.is_admin()       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_personnel()   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mon_employe_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_admin()       TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.is_personnel()   TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.mon_employe_id() TO authenticated, service_role;

COMMIT;
