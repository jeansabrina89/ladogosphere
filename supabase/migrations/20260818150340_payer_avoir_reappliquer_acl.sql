-- CREATE OR REPLACE FUNCTION remet les ACL a zero : on restaure l'etat anterieur
-- (execution reservee a service_role, la RPC est appelee cote serveur uniquement).
REVOKE ALL ON FUNCTION public.payer_reservation_avec_avoir(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payer_reservation_avec_avoir(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.payer_reservation_avec_avoir(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.payer_reservation_avec_avoir(uuid, uuid) TO service_role;
