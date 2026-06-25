-- #1 CRITIQUE : le grand-livre ne doit etre ecrit que par le service_role (serveur).
-- L'app appelle passer_ecriture uniquement via supabaseAdmin (service_role), donc revoquer
-- aux autres roles ne casse rien et ferme la faille d'injection d'ecritures.
revoke execute on function public.passer_ecriture(date, text, text, uuid, jsonb) from public, anon, authenticated;

-- #8 Retirer de l'API publique (RPC) les fonctions de trigger : elles firent via les triggers,
-- jamais appelees en RPC par l'app. (is_admin/is_personnel/mon_employe_id sont VOLONTAIREMENT
-- conservees : elles sont appelees dans les politiques RLS et doivent rester executables.)
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.lier_client_auth() from public, anon, authenticated;
revoke execute on function public.bloquer_ecriture_exercice_cloture() from public, anon, authenticated;
revoke execute on function public.ecritures_append_only() from public, anon, authenticated;
revoke execute on function public.avoirs_mouvements_append_only() from public, anon, authenticated;
revoke execute on function public.paiements_resa_append_only() from public, anon, authenticated;
revoke execute on function public.factures_inalterabilite() from public, anon, authenticated;
revoke execute on function public.facture_reservations_integrite() from public, anon, authenticated;

-- #7 Figer le search_path des triggers (hygiene). Tous referencent soit rien,
-- soit public.factures en qualifie -> search_path vide est sans danger.
alter function public.ecritures_append_only() set search_path = '';
alter function public.avoirs_mouvements_append_only() set search_path = '';
alter function public.paiements_resa_append_only() set search_path = '';
alter function public.factures_inalterabilite() set search_path = '';
alter function public.facture_reservations_integrite() set search_path = '';
