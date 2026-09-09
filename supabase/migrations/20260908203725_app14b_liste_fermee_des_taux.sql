/**
 * Aucun taux inventé, nulle part.
 *
 * Un taux de TVA ne se tape pas : il se choisit dans `taux_tva`. Les écrans le
 * présentent en liste, les actions le valident — et ce garde-fou ferme la
 * porte au niveau de la base, pour que même un script de reprise ou une
 * requête à la main ne puisse pas y glisser 5,3 %.
 *
 * Un taux inventé sur une facture est une faute ; un champ libre finit
 * toujours par en produire un.
 */
create or replace function public.verifier_taux_legal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_taux numeric := new.taux_tva;
begin
  if v_taux is null then
    return new;
  end if;
  if not exists (select 1 from public.taux_tva t where t.taux = v_taux) then
    raise exception
      'Taux de TVA % inconnu : un taux se choisit dans la liste légale, il ne se saisit pas.', v_taux;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_articles_taux_legal on public.articles;
create trigger trg_articles_taux_legal
  before insert or update of taux_tva on public.articles
  for each row execute function public.verifier_taux_legal();

drop trigger if exists trg_facture_lignes_taux_legal on public.facture_lignes;
create trigger trg_facture_lignes_taux_legal
  before insert or update of taux_tva on public.facture_lignes
  for each row execute function public.verifier_taux_legal();

drop trigger if exists trg_ventes_lignes_taux_legal on public.ventes_lignes;
create trigger trg_ventes_lignes_taux_legal
  before insert or update of taux_tva on public.ventes_lignes
  for each row execute function public.verifier_taux_legal();

drop trigger if exists trg_commandes_lignes_taux_legal on public.commandes_lignes;
create trigger trg_commandes_lignes_taux_legal
  before insert or update of taux_tva on public.commandes_lignes
  for each row execute function public.verifier_taux_legal();

drop trigger if exists trg_services_taux_legal on public.services_supplementaires;
create trigger trg_services_taux_legal
  before insert or update of taux_tva on public.services_supplementaires
  for each row execute function public.verifier_taux_legal();

/** Même verrou pour les prestations : le taux vient de taux_tva, ou il n'entre pas. */
create or replace function public.verifier_taux_prestation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.taux_tva t where t.taux = new.taux) then
    raise exception
      'Taux de TVA % inconnu : un taux se choisit dans la liste légale, il ne se saisit pas.', new.taux;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_taux_prestation_legal on public.taux_prestation;
create trigger trg_taux_prestation_legal
  before insert or update on public.taux_prestation
  for each row execute function public.verifier_taux_prestation();

/**
 * Le taux de dette fiscale nette n'est PAS un taux légal.
 *
 * Recopier 8,1 % dans le champ du forfait est l'erreur qui ne se voit qu'au
 * décompte, des mois plus tard, quand le montant dû est faux. La base la
 * refuse aussi.
 */
do $$ begin
  alter table public.parametres_tva add constraint parametres_tva_taux1_plage
    check (taux_tdfn_1 = 0 or (taux_tdfn_1 >= 0.1 and taux_tdfn_1 <= 6.7));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.parametres_tva add constraint parametres_tva_taux2_plage
    check (taux_tdfn_2 is null or taux_tdfn_2 = 0 or (taux_tdfn_2 >= 0.1 and taux_tdfn_2 <= 6.7));
exception when duplicate_object then null; end $$;