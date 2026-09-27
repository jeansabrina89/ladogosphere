-- APP 28-BIS : les deux fonctions de trigger naissent fermées, elles aussi.
--
-- Relevé par `tests/fonctionsSqlFermees.test.ts` sur la migration précédente :
-- `lier_client_auth` et `lier_client_auth_confirmee` étaient créées sans
-- révocation. Le test ne contrôle que les migrations postérieures à la
-- fermeture générale du 17.09.2026 — les versions d'origine de
-- `lier_client_auth` datent d'avant, et n'avaient donc jamais été vues.
--
-- ── EST-CE UTILE POUR UNE FONCTION DE TRIGGER ? ───────────────────────────
--
-- Une fonction qui rend `trigger` n'est pas exposée par PostgREST : elle n'est
-- pas appelable par `/rest/v1/rpc`, et un trigger ne vérifie pas le privilège
-- EXECUTE de sa fonction au déclenchement — il l'a vérifié une fois, à la
-- création du trigger. La révocation ne change donc rien au fonctionnement.
--
-- Elle est posée quand même, et pour deux raisons :
--
--   * la règle du dépôt ne fait pas d'exception, et une exception non écrite
--     s'étend toujours. Un jour, quelqu'un s'appuiera sur celle-ci pour ne pas
--     révoquer une fonction qui, elle, serait appelable ;
--   * ce qui rend une fonction de trigger inoffensive — son type de retour —
--     peut changer. `returns trigger` est une ligne qu'une réécriture modifie
--     sans y penser, et la révocation, elle, resterait.
--
-- Autrement dit : cela ne protège rien aujourd'hui, et cela ne coûte rien. La
-- règle garde sa valeur d'être sans exception.

revoke all on function public.lier_client_auth() from public, anon, authenticated;
grant execute on function public.lier_client_auth() to service_role;

revoke all on function public.lier_client_auth_confirmee() from public, anon, authenticated;
grant execute on function public.lier_client_auth_confirmee() to service_role;
