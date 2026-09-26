-- S-05 : le bucket des photos de chiens passe en PRIVÉ.
--
-- Il était public depuis sa création (17.06.2026). Quiconque connaissait le
-- chemin d'une photo l'ouvrait sans compte, et ces chemins circulaient dans les
-- pages : `photo_principale` contenait l'URL publique complète, rendue telle
-- quelle dans le HTML. Trois lots avaient nettoyé les métadonnées des photos —
-- les coordonnées GPS comprises — mais le nettoyage protège le contenu, jamais
-- l'accès. Une photo de chien est une donnée personnelle rattachée à un
-- propriétaire identifiable : elle se sert désormais comme une facture, par une
-- URL signée d'une heure fabriquée côté serveur après vérification du droit.
--
-- `boutique-photos` reste PUBLIC : c'est son rôle, la vitrine est publique.
--
-- Les filtres posés au lot 18h ne sont pas touchés : 5 Mo, et seulement
-- image/jpeg, image/png, image/webp.

-- 1) Le bucket ne se lit plus par `/object/public/`.
update storage.buckets
   set public = false
 where id = 'chiens-photos';

-- 2) Aucune politique de lecture n'est créée, et c'est le cœur de la mesure.
--
-- `storage.objects` ne porte AUCUNE politique aujourd'hui (vérifié : zéro ligne
-- dans pg_policies pour ce schéma). La lecture publique tenait donc au seul
-- drapeau `public` du bucket. En le retirant sans rien ajouter, `anon` et
-- `authenticated` n'ont plus aucun accès aux objets : la seule façon de lire une
-- photo devient l'URL signée fabriquée par le serveur avec la clé de service,
-- après qu'il a vérifié qui demande et à qui est le chien.
--
-- Écrire ici une politique « le client voit les photos de ses chiens » aurait
-- l'air plus fin et serait moins sûr : il faudrait relier un chemin d'objet à un
-- chien, donc faire confiance au nom du fichier. Le serveur, lui, part de
-- l'identifiant du chien et lit le chemin en base.

-- 3) `photo_principale` range désormais un CHEMIN, plus une URL.
--
-- Une URL publique enregistrée en base serait morte dès ce commit, et elle
-- porterait en plus une promesse fausse : que l'objet est lisible par tous. Le
-- chemin, lui, reste valable quelle que soit la façon de servir le fichier.
update public.chiens
   set photo_principale = regexp_replace(
         photo_principale,
         '^.*/storage/v1/object/public/chiens-photos/',
         ''
       )
 where photo_principale like '%/storage/v1/object/public/chiens-photos/%';

-- La colonne n'est PAS renommée, et c'est un choix.
--
-- `photo_principale` ne promet pas une URL : elle dit « la photo principale de
-- ce chien ». Le nom reste donc juste. La renommer toucherait cinq écrans, une
-- route et les types, pour ne rien clarifier que ce commentaire ne dise mieux —
-- et chaque renommage est une occasion d'oublier un appel.
comment on column public.chiens.photo_principale is
  'CHEMIN de l''objet dans le bucket privé chiens-photos (ex. <chien_id>/<horodatage>.webp), jamais une URL. La lecture passe par urlSigneePhotoChien(), qui vérifie le droit puis signe pour une heure. Converti depuis les URL publiques le 26.09.2026 (S-05).';
