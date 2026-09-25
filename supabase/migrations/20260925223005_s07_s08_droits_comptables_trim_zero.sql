-- S-07 et S-08 : les droits résiduels des six tables comptables, et le
-- search_path de trim_zero.
--
-- Ces six tables ne sont lues et écrites QUE par le serveur, avec la clé de
-- service (service_role) : vérifié fichier par fichier au lot 23 — aucun des
-- 40 sites qui les touchent ne passe par un client de session. Elles portent
-- RLS sans aucune politique, donc une requête faite avec la clé publique
-- renvoie déjà zéro ligne. Les GRANT hérités de `public` ne servaient donc à
-- rien, mais ils survivraient à la première politique écrite par distraction :
-- on les retire pendant qu'ils sont encore inertes. Aucune politique n'est
-- voulue sur ces tables.
--
-- trim_zero est SECURITY INVOKER : elle s'exécute avec les droits de
-- l'appelant, et son absence de search_path ne donne donc rien à personne.
-- On le fixe quand même : la fonction n'a aucune raison de dépendre du chemin
-- de recherche de qui l'appelle, et l'advisor cessera de la signaler.

revoke all on public.comptes, public.ecritures,
  public.ecritures_lignes, public.exercices,
  public.fermetures_essai, public.paiements_resa
  from anon, authenticated;

alter function public.trim_zero(numeric) set search_path = public;
