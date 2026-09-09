-- Inscription : ne JAMAIS détourner la fiche d'un autre compte.
--
-- Le trigger `on_auth_user_created` (fonction lier_client_auth) rattache la
-- fiche `clients` au compte Auth qui vient d'être créé. Deux défauts :
--
-- 1. `ON CONFLICT (email) DO UPDATE SET auth_user_id = NEW.id` réattribuait la
--    fiche même lorsqu'elle appartenait DÉJÀ à un autre compte : quiconque
--    connaissait l'e-mail d'un client pouvait s'inscrire et récupérer sa fiche
--    (réservations, factures, avoirs). On passe à DO NOTHING : sans fiche,
--    l'utilisateur est envoyé vers /mon-compte/completer-profil, où l'action
--    `creerOuLierFicheClient` répond « Un compte existe déjà pour cette
--    adresse, utilisez Mot de passe oublié ».
--
-- 2. `WHERE email = NEW.email` est sensible à la casse : une fiche saisie
--    « Camille@Example.com » n'était pas reconnue pour une inscription en
--    « camille@example.com ». Comparaison en `lower()` désormais.
--
-- Le reste est inchangé : fiche minimale (prénom/nom vides) puis complétée par
-- l'action serveur d'inscription, et profil `client` créé si absent.
begin;

create or replace function public.lier_client_auth()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  -- Rattacher une fiche LIBRE portant le même e-mail (casse ignorée).
  update public.clients
  set auth_user_id = new.id
  where lower(email) = lower(new.email)
    and auth_user_id is null;

  if not found then
    -- Aucune fiche libre : en créer une minimale. DO NOTHING (et non
    -- DO UPDATE) : une fiche déjà rattachée à un autre compte reste intacte.
    insert into public.clients (prenom, nom, email, auth_user_id, actif, membre)
    values ('', '', new.email, new.id, true, false)
    on conflict (email) do nothing;
  end if;

  -- Profil applicatif.
  insert into public.profiles (id, email, role, actif)
  values (new.id, new.email, 'client', true)
  on conflict (id) do nothing;

  return new;
end;
$fn$;

commit;
