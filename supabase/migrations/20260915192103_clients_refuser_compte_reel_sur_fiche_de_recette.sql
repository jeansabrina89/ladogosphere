-- Une fiche de recette ne reçoit jamais le compte d'une vraie personne.
--
-- Le 7 septembre 2026, la recette d'APP 13 a posé le compte admin de Sabrina
-- (ladogosphere@gmail.com) sur la fiche de test « Recette ZZ Contrôle recette
-- boutique ». Son espace client a montré pendant huit jours les factures et
-- les ventes de la recette, et le chien saisi le 15 septembre a atterri là.
--
-- Le code de l'application n'y est pour rien : aucune de ses trois voies
-- d'écriture ne peut poser ce rattachement, elles apparient toutes par
-- adresse e-mail et les deux adresses diffèrent. L'écriture vient d'un harnais
-- de recette branché en service_role, hors du dépôt. Un contrôle applicatif ne
-- l'aurait donc pas arrêté : celui-ci est en base, où tout le monde passe.
--
-- Ce qui est refusé, c'est le MÉLANGE : un compte réel sur une fiche de
-- recette. Une recette qui apparie son propre compte de test à sa propre fiche
-- de test reste permise, sans quoi ce garde-fou casserait la recette au lieu
-- de la protéger. C'est le cas de la fiche
-- 4df91d76-8983-4c41-9ebb-c01f3e1333ed (« ZZ17 Client Pension »), appariée à
-- un compte `.invalid` banni : elle reste valide et n'est pas touchée.
--
-- Détacher reste toujours permis : c'est le geste de réparation.

begin;

create or replace function public.clients_refuser_compte_reel()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_email_compte text;
begin
  -- Rien à contrôler si le rattachement ne bouge pas, ou s'il disparaît.
  if new.auth_user_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.auth_user_id is not distinct from old.auth_user_id then
    return new;
  end if;

  -- La fiche porte-t-elle une marque de recette ?
  if not (
    lower(coalesce(new.email, '')) like '%.test'
    or lower(coalesce(new.email, '')) like '%.invalid'
    or upper(coalesce(new.nom, '')) like 'ZZ%'
    or upper(coalesce(new.prenom, '')) like 'ZZ%'
  ) then
    return new;
  end if;

  -- Fiche de recette : seul un compte de recette peut s'y poser.
  select email into v_email_compte from auth.users where id = new.auth_user_id;
  if lower(coalesce(v_email_compte, '')) like '%.test'
     or lower(coalesce(v_email_compte, '')) like '%.invalid' then
    return new;
  end if;

  raise exception
    'Fiche de recette % (% %, %) : le compte réel % ne peut pas y être rattaché.',
    new.id, new.prenom, new.nom, new.email, coalesce(v_email_compte, new.auth_user_id::text)
    using errcode = 'check_violation';
end;
$fn$;

drop trigger if exists clients_refuser_compte_reel on public.clients;

create trigger clients_refuser_compte_reel
before insert or update of auth_user_id on public.clients
for each row execute function public.clients_refuser_compte_reel();

commit;