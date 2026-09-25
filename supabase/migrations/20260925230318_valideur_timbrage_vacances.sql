-- Qui a validé, et quand.
--
-- Le lot 23 a posé la question et n'a trouvé personne pour y répondre :
-- `timbrage` ne portait qu'un booléen `valide_admin`, `demandes_vacances` qu'un
-- `statut`, et aucune des deux routes n'écrivait au journal. On savait QUE
-- c'était validé, jamais PAR QUI.
--
-- Deux colonnes plutôt qu'une entrée de journal : la question se pose EN FACE
-- de la ligne, sur l'écran du timbrage, et une colonne y répond sans jointure.
-- Un `valide_admin` repassé à false puis à true laisserait deux entrées de
-- journal là où une colonne dit simplement l'état actuel.
--
-- « traite » pour les vacances, et non « valide » : une demande est acceptée
-- OU refusée, et les deux méritent qu'on sache qui a tranché.
--
-- Les lignes existantes restent à NULL. On ne sait pas qui les a validées, et
-- on ne l'invente pas : un défaut posé aujourd'hui désignerait quelqu'un au
-- hasard, ce qui est pire que de ne rien dire.

alter table public.timbrage
  add column if not exists valide_par uuid null references public.profiles(id) on delete set null,
  add column if not exists valide_le  timestamptz null;

comment on column public.timbrage.valide_par is
  'Profil qui a validé cette ligne. NULL = validée avant le 26.09.2026, ou pas validée : le valideur n''est pas connu et n''a pas été deviné.';
comment on column public.timbrage.valide_le is
  'Horodatage de la validation. NULL quand valide_par l''est.';

alter table public.demandes_vacances
  add column if not exists traite_par uuid null references public.profiles(id) on delete set null,
  add column if not exists traite_le  timestamptz null;

comment on column public.demandes_vacances.traite_par is
  'Profil qui a accepté ou refusé cette demande. NULL = traitée avant le 26.09.2026, ou encore en attente.';
comment on column public.demandes_vacances.traite_le is
  'Horodatage de l''acceptation ou du refus. NULL quand traite_par l''est.';
