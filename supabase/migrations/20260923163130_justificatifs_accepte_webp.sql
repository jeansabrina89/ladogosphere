-- Les justificatifs arrivent désormais en WebP.
--
-- Une photo de ticket passe par le dépôt commun (src/lib/depotImage.ts), qui
-- la convertit pour lui retirer ses métadonnées — la position du domicile d'un
-- client, notamment. Elle ressort donc en image/webp, que ce bucket refusait.
--
-- Le HEIC et le HEIF sortent de la liste : sharp ne sait pas les lire (aucun
-- codec HEVC dans ses binaires), donc nous ne savons pas les nettoyer. Ils sont
-- refusés à l'entrée, avec une phrase qui dit quoi faire. Voir docs/SECURITE.md.
--
-- Le PDF reste : il ne se convertit pas, il est déposé tel quel, et ce bucket
-- est privé — lu uniquement par URL signée de courte durée.

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'justificatifs';
