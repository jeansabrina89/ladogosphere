-- Le nom du titulaire se saisit sur l'entité.
--
-- En raison individuelle, la raison sociale doit contenir le nom de famille du
-- titulaire (art. 945 CO). Encore faut-il que l'application sache ce nom.
--
-- APP 16b le cherchait sur `profiles.nom`, où celui de Sabrina est vide.
-- APP 16c y avait ajouté un repli sur la fiche d'employée, qui trouve bien
-- « Jean » — mais un repli reste une devinette : il suppose que la titulaire
-- est aussi une employée, et que les deux adresses e-mail coïncident. Deux
-- suppositions pour une donnée qui tient en un mot.
--
-- Le nom appartient à l'ENTITÉ, comme sa raison sociale et son IDE : c'est un
-- fait daté, qui change si l'entreprise change de mains. Il se saisit là, et
-- nulle part ailleurs.
--
-- La valeur reprise ici est « Jean », lue sur la fiche d'employée de Sabrina —
-- la seule source qui le portait. Ce n'est pas une invention : c'est un
-- déménagement, fait une fois, tracé, et qui ne se rejouera pas.

begin;

alter table public.entites_juridiques
  add column if not exists titulaire_nom text;

comment on column public.entites_juridiques.titulaire_nom is
  'Nom de famille du titulaire. Obligatoire en raison individuelle — la raison sociale doit le contenir (art. 945 CO) — et null pour toute autre forme.';

-- La reprise AVANT la contrainte : sans quoi la ligne existante la violerait
-- au moment où elle se pose.
update public.entites_juridiques
set titulaire_nom = 'Jean'
where forme = 'raison_individuelle'
  and nullif(btrim(coalesce(titulaire_nom, '')), '') is null;

-- Une Sàrl n'a pas de titulaire : la colonne y reste vide, et la contrainte
-- l'impose plutôt que de compter sur la discipline de l'écran.
update public.entites_juridiques
set titulaire_nom = null
where forme <> 'raison_individuelle';

alter table public.entites_juridiques
  drop constraint if exists entites_titulaire_selon_forme;
alter table public.entites_juridiques
  add constraint entites_titulaire_selon_forme check (
    case
      when forme = 'raison_individuelle'
        then nullif(btrim(coalesce(titulaire_nom, '')), '') is not null
      else titulaire_nom is null
    end
  );

-- La trace : d'où vient ce nom, et pourquoi il a changé de place.
insert into public.journal_evenements (entite, entite_id, evenement, avant, apres, motif)
select
  'entite_juridique',
  e.id,
  'identite_corrigee',
  jsonb_build_object('titulaire_nom', null),
  jsonb_build_object('titulaire_nom', e.titulaire_nom),
  'Nom du titulaire repris depuis la fiche d''employée et porté sur l''entité : il ne se déduit plus du profil.'
from public.entites_juridiques e
where e.forme = 'raison_individuelle';

commit;