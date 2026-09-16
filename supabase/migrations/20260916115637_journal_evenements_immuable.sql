-- Le journal des événements ne se modifie pas.
--
-- Il répond à « qui a fait quoi, quand, et pourquoi ». Une trace qu'on peut
-- corriger ne prouve plus rien : une erreur se corrige par un NOUVEAU geste,
-- lui-même journalisé, jamais en réécrivant l'ancien.
--
-- Le verrou sur UPDATE et DELETE existe depuis la phase 1 de la comptabilité
-- (20260907084540_compta_phase_1_modele.sql). Il est restitué ici tel quel, avec
-- un message qui dit comment corriger, pour que cette migration porte à elle
-- seule toute la règle.
--
-- Il manquait TRUNCATE. Un trigger de ligne ne le voit pas : vider la table
-- d'un coup passait, y compris pour le service role. Un trigger d'instruction
-- BEFORE TRUNCATE ferme cette porte.
--
-- La technique est celle des taux de TVA (APP 14b) : un trigger BEFORE qui lève
-- une exception. Un trigger s'exécute pour tous les rôles, service role compris
-- — seul un superutilisateur qui désactive les triggers le contourne, et aucun
-- rôle de l'application ne l'est.

begin;

create or replace function public.journal_evenements_append_only()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  raise exception
    'journal_evenements est en ajout seul : ni modification, ni suppression, ni vidage. Une erreur se corrige par un nouveau geste, lui-même journalisé.'
    using errcode = 'insufficient_privilege';
end;
$function$;

drop trigger if exists trg_journal_evenements_append_only on public.journal_evenements;
create trigger trg_journal_evenements_append_only
  before update or delete on public.journal_evenements
  for each row execute function public.journal_evenements_append_only();

drop trigger if exists trg_journal_evenements_sans_vidage on public.journal_evenements;
create trigger trg_journal_evenements_sans_vidage
  before truncate on public.journal_evenements
  for each statement execute function public.journal_evenements_append_only();

commit;