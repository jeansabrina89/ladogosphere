-- Le contrôle du TYPE et du propriétaire reste immédiat : il ne dépend d'aucun
-- autre rang, et vaut mieux être refusé tout de suite.
create or replace function public.verifier_groupe_taille()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_mesure record;
begin
  if new.type <> 'taille' then
    if new.mesure_groupe_id is not null or new.mode_taille is not null then
      new.mesure_groupe_id := null;
      new.mode_taille := null;
    end if;
    return new;
  end if;

  if new.mode_taille is null then
    raise exception 'Une grille de tailles doit dire son mode : seuils (sur mesure) ou plages (réglable).';
  end if;
  if new.mesure_groupe_id is null then
    return new;
  end if;

  select * into v_mesure from public.options_groupes where id = new.mesure_groupe_id;
  if not found then
    raise exception 'La mesure dont cette grille dépend n''existe pas.';
  end if;
  if v_mesure.type <> 'mesure' then
    raise exception 'Une grille de tailles se déduit d''un groupe de type « mesure ».';
  end if;
  if coalesce(v_mesure.article_id, v_mesure.modele_id)
     is distinct from coalesce(new.article_id, new.modele_id)
     and not public.dependance_croisee_permise(new.article_id, v_mesure.modele_id) then
    raise exception 'La mesure doit venir du même catalogue, ou d''un modèle attaché à cet article.';
  end if;

  return new;
end;
$function$;

/**
 * L'ORDRE, lui, se vérifie en fin de transaction.
 *
 * Un réordonnancement écrit les rangs un par un : entre deux écritures, la
 * mesure peut se retrouver un instant après sa grille. Refuser à ce moment-là
 * bloquerait un rangement parfaitement légitime — c'est déjà la raison pour
 * laquelle le contrôle des dépendances est différé.
 */
create or replace function public.verifier_ordre_taille()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_mesure record;
begin
  if new.type <> 'taille' or new.mesure_groupe_id is null then return new; end if;

  select * into v_mesure from public.options_groupes where id = new.mesure_groupe_id;
  if not found then return new; end if;

  -- Entre deux sources (une mesure venue d'un modèle attaché), l'ordre est
  -- acquis par construction : les modèles passent avant les groupes propres.
  if coalesce(v_mesure.article_id, v_mesure.modele_id)
     is distinct from coalesce(new.article_id, new.modele_id) then
    return new;
  end if;

  if v_mesure.ordre >= new.ordre then
    raise exception '« % » se déduit de « % » : la mesure doit être posée avant.',
      new.nom, v_mesure.nom;
  end if;
  return new;
end;
$function$;

drop trigger if exists options_groupes_ordre_taille on public.options_groupes;
create constraint trigger options_groupes_ordre_taille
  after insert or update on public.options_groupes
  deferrable initially deferred
  for each row execute function public.verifier_ordre_taille();