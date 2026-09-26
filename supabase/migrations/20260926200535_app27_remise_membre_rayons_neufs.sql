-- APP 27 : la remise membre sur les trois rayons neufs.
--
-- Trouvé par un test qui comptait « les seize catégories du magasin ». Il
-- rougissait parce qu'il y en a dix-neuf — mais derrière le chiffre, il y avait
-- un vrai défaut, et c'est pour cela que ce fichier existe.
--
-- ── LE DÉFAUT, ET POURQUOI IL SERAIT PASSÉ INAPERÇU ───────────────────────
--
-- La remise d'adhésion se règle rayon par rayon, dans `remise_membre_categories`.
-- Les deux côtés ne traitent PAS une ligne manquante de la même façon :
--
--   * l'écran de gestion (`remiseMembre.listerRemises`) parcourt
--     CATEGORIES_ARTICLE et propose 10 % actif pour un rayon sans ligne ;
--   * le calcul du prix (`prix.ts`) ne lit QUE les lignes existantes, et
--     `pourcentageEffectif(null)` vaut zéro.
--
-- Autrement dit : Sabrina aurait lu « 10 % » sur son écran pour les cages, les
-- griffoirs et l'alimentation complète, et une membre aurait payé le plein tarif.
-- Personne ne s'en plaint : on ne réclame pas une remise dont on ignore
-- l'existence. Le défaut aurait duré jusqu'à ce que quelqu'un refasse le calcul
-- à la main.
--
-- Les trois lignes sont donc posées ici, au même taux que les seize autres, et
-- dans la migration plutôt qu'à la main : une base qu'on ne peut pas
-- reconstruire depuis le dépôt n'est sauvegardée nulle part.
--
-- `on conflict do nothing` : si Sabrina a déjà réglé un de ces rayons entre-temps,
-- son choix l'emporte. Une migration ne défait pas une décision.

insert into public.remise_membre_categories (categorie, pourcentage, actif)
values ('alimentation_complete', 10, true),
       ('griffoirs', 10, true),
       ('cages_enclos', 10, true)
on conflict (categorie) do nothing;
