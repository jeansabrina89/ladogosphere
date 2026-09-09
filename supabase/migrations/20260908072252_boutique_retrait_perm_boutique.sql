-- Plus aucun code ne la lit : la colonne d'origine peut partir. Sa valeur a
-- été reportée sur les deux nouvelles par la migration précédente.
alter table public.profiles drop column if exists perm_boutique;