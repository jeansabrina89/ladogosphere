alter table public.profiles
  add column if not exists perm_chiens_creer boolean not null default true,
  add column if not exists perm_journee_essai boolean not null default true,
  add column if not exists perm_encaissements boolean not null default true,
  add column if not exists perm_box boolean not null default true,
  add column if not exists perm_timbrage_equipe boolean not null default false,
  add column if not exists perm_vacances_equipe boolean not null default false;
