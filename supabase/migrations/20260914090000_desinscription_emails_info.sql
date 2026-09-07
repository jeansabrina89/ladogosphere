-- Désinscription des e-mails d'information.
--
-- Le consentement ne porte QUE sur les messages libres (campagnes). Les e-mails
-- liés à une réservation, une facture ou l'adhésion partent dans tous les cas :
-- ils sont la contrepartie d'un contrat, pas de la prospection.

alter table public.clients
  add column if not exists emails_info_ok         boolean not null default true,
  add column if not exists emails_info_modifie_le timestamptz,
  add column if not exists desinscription_token   uuid not null default gen_random_uuid();

-- Un jeton par client, jamais deux fois le même.
create unique index if not exists uq_clients_desinscription_token
  on public.clients(desinscription_token);

-- Les clients existants restent consentants : ils recevront le lien de
-- désinscription dès le prochain envoi d'information.

-- Le jeton n'est lisible que par le service (page publique de désinscription).
-- Les politiques de `clients` ne s'adressent qu'au rôle `authenticated` : le
-- rôle `anon` ne voit aucune ligne, et un client connecté ne voit que la sienne
-- (client_self_select). Personne ne peut donc découvrir le jeton d'un autre.
comment on column public.clients.desinscription_token is
  'Jeton du lien de désinscription. Sert uniquement côté serveur (supabaseAdmin) ; ne jamais le transmettre au navigateur.';
comment on column public.clients.emails_info_ok is
  'Consentement aux e-mails d''information (campagnes). Sans effet sur les e-mails transactionnels.';

-- Le journal des campagnes retient combien de clients ont été écartés.
alter table public.emails_campagnes
  add column if not exists nb_exclus int not null default 0;
