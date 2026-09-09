-- ── APP 16 · C14/C16 : la remise se FIGE sur la ligne ─────────────────────
--
-- `prix_unitaire` reste ce qui est RÉELLEMENT payé — c'est lui qui fait le
-- montant, l'écriture et la ventilation de TVA. À côté, la ligne garde le prix
-- de base réel et l'origine nommée de la remise, pour que la facture et le
-- ticket puissent dire les trois chiffres : prix de base, remise, prix payé.
--
-- Une action qui se termine ne change AUCUN document émis : ces colonnes sont
-- écrites une fois, à la vente, et ne se recalculent jamais.

do $$
declare t text;
begin
  foreach t in array array['ventes_lignes', 'facture_lignes', 'commandes_lignes'] loop
    execute format($f$
      alter table public.%I
        add column if not exists prix_base numeric null,
        add column if not exists remise_pourcentage numeric null,
        add column if not exists remise_origine text null,
        add column if not exists remise_libelle text null
    $f$, t);

    if not exists (
      select 1 from pg_constraint where conname = t || '_remise_origine_check'
    ) then
      execute format($f$
        alter table public.%I add constraint %I
        check (remise_origine is null or remise_origine in ('action', 'anti_gaspillage', 'membre'))
      $f$, t, t || '_remise_origine_check');
    end if;
  end loop;
end $$;

comment on column ventes_lignes.prix_base is
  'Prix de base réel de l''article, hors action. Jamais un « prix habituel » gonflé : l''ordonnance sur l''indication des prix l''interdit.';
comment on column facture_lignes.remise_libelle is
  'L''origine de la remise, en toutes lettres : « Action du mois −20 % », « Anti-gaspillage −30 % », « Remise membre −10 % ».';