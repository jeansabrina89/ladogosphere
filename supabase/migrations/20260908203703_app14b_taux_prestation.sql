-- Le taux de TVA des prestations, historisé par date d'effet.
-- Un changement ne vaut QUE pour les pièces suivantes : les lignes déjà émises
-- ont figé le leur, et on ne relit jamais une facture avec le taux d'après.
create table if not exists public.taux_prestation (
  code text not null,
  date_debut date not null,
  taux numeric not null,
  /** Obligatoire à 0 % : repris tel quel sur la facture. */
  motif_exonere text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (code, date_debut),
  constraint taux_prestation_code_check check (code in (
    'sejour','essai','adhesion','abonnement','prestation_annexe','frais_annulation'
  )),
  constraint taux_prestation_motif_check check (taux <> 0 or coalesce(btrim(motif_exonere), '') <> '')
);

comment on table public.taux_prestation is
  'Taux de TVA des prestations (hors boutique), historisé par date d''effet. Le taux vient toujours de taux_tva : aucune valeur libre.';

-- Les six prestations démarrent au taux normal. L'adhésion comprise : c'est une
-- contre-prestation, pas une cotisation de membre exclue au sens de l'art. 21
-- LTVA — exclusion qui vise les associations, pas une Sàrl.
insert into public.taux_prestation (code, date_debut, taux)
select c, '2024-01-01'::date, 8.1
  from unnest(array['sejour','essai','adhesion','abonnement','prestation_annexe','frais_annulation']) as c
on conflict (code, date_debut) do nothing;

alter table public.taux_prestation enable row level security;

drop policy if exists taux_prestation_lecture on public.taux_prestation;
create policy taux_prestation_lecture on public.taux_prestation
  for select to authenticated using (true);

drop policy if exists taux_prestation_admin on public.taux_prestation;
create policy taux_prestation_admin on public.taux_prestation
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Le motif d'exonération voyage avec la ligne, figé à l'émission comme le prix.
alter table public.articles          add column if not exists motif_tva text;
alter table public.facture_lignes    add column if not exists motif_tva text;
alter table public.ventes_lignes     add column if not exists motif_tva text;
alter table public.commandes_lignes  add column if not exists motif_tva text;

comment on column public.facture_lignes.motif_tva is
  'Pourquoi cette ligne est à 0 %. Repris tel quel sur la facture — une ligne à zéro sans explication est incompréhensible.';