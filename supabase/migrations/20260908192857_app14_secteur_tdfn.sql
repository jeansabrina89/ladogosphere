-- Le secteur de dette fiscale nette : à quelle activité se rattache ce qui est
-- vendu. Il sert au décompte, jamais à la facture.
alter table public.articles
  add column if not exists secteur_tdfn text not null default 'commerce';

do $$ begin
  alter table public.articles add constraint articles_secteur_tdfn_check
    check (secteur_tdfn in ('pension','commerce'));
exception when duplicate_object then null; end $$;

alter table public.services_supplementaires
  add column if not exists taux_tva numeric not null default 8.1,
  add column if not exists secteur_tdfn text not null default 'pension';

do $$ begin
  alter table public.services_supplementaires add constraint services_secteur_tdfn_check
    check (secteur_tdfn in ('pension','commerce'));
exception when duplicate_object then null; end $$;

-- La colonne existante était numérique et n'a jamais été renseignée (elle
-- visait un taux, pas un secteur). Elle devient le secteur, en texte.
alter table public.facture_lignes drop column if exists secteur_tdfn;
alter table public.facture_lignes add column secteur_tdfn text;
alter table public.ventes_lignes add column if not exists secteur_tdfn text;
alter table public.commandes_lignes add column if not exists secteur_tdfn text;

do $$ begin
  alter table public.facture_lignes add constraint facture_lignes_secteur_check
    check (secteur_tdfn is null or secteur_tdfn in ('pension','commerce'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ventes_lignes add constraint ventes_lignes_secteur_check
    check (secteur_tdfn is null or secteur_tdfn in ('pension','commerce'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.commandes_lignes add constraint commandes_lignes_secteur_check
    check (secteur_tdfn is null or secteur_tdfn in ('pension','commerce'));
exception when duplicate_object then null; end $$;

comment on column public.facture_lignes.secteur_tdfn is
  'Secteur figé au moment de l''émission. Null sur les pièces antérieures à APP 14 : elles ne se recalculent pas.';

-- Le taux par défaut de chaque catégorie : ce qui se mange est au taux réduit.
-- C'est une PROPOSITION reprise sur les articles existants ; chaque fiche
-- garde ensuite son taux propre, modifiable.
update public.articles
   set taux_tva = 2.6
 where categorie in ('alimentation_seche','alimentation_humide','friandises','mastication','litiere')
   and taux_tva <> 2.6;

update public.articles
   set taux_tva = 8.1
 where categorie not in ('alimentation_seche','alimentation_humide','friandises','mastication','litiere')
   and taux_tva not in (8.1, 2.6, 0);