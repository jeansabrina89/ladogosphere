-- Justificatifs : on conserve aussi le fichier remis par l'employé.
--
-- Depuis le 50538e9, une photo de justificatif est convertie en WebP pour lui
-- retirer ses métadonnées, et le fichier d'origine n'existait plus nulle part.
-- Le droit suisse impose dix ans de conservation des pièces comptables, et
-- rien ne nous dit qu'une conversion soit admise. Plutôt que de parier sur une
-- interprétation, on garde les deux : l'original pour la conservation, la
-- version nettoyée pour l'affichage.
--
-- Les trois colonnes sont NULLABLES : les pièces déposées avant ce jour n'ont
-- pas d'original conservé, et un PDF n'en a pas besoin — il EST l'original.
-- `origine_path is null` est la distinction, sans drapeau ni énumération à
-- tenir d'accord avec le reste.

alter table public.pieces
  add column if not exists origine_path   text,
  add column if not exists origine_mime   text,
  add column if not exists origine_sha256 text;

comment on column public.pieces.sha256 is
  'Empreinte du fichier CONSERVÉ ET AFFICHÉ (WebP nettoyé pour une image, PDF original pour un PDF). N''atteste PAS du fichier remis par l''employé : voir origine_sha256.';

comment on column public.pieces.origine_sha256 is
  'Empreinte du fichier REMIS PAR L''EMPLOYÉ, conservé tel quel avec ses métadonnées. Null pour un PDF (déjà l''original) et pour les pièces antérieures au 24 septembre 2026.';

comment on column public.pieces.origine_path is
  'Chemin de l''original dans le bucket privé. Null = aucun original conservé. Ce fichier porte l''EXIF et la position : il ne s''affiche JAMAIS.';

comment on column public.pieces.origine_mime is
  'Type du fichier remis (image/jpeg, image/png). Le nettoyé, lui, est toujours image/webp — colonne mime.';
