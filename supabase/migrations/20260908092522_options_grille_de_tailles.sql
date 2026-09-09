-- Une taille n'est PAS une question posée au client : c'est une valeur d'option
-- calculée depuis une mesure. Ce choix est délibéré — une fois déterminée, elle
-- se comporte comme n'importe quelle autre valeur retenue : elle peut être le
-- parent d'un groupe de largeur, porter un supplement_prix, et porter un
-- supplément par combinaison. Tout l'existant fonctionne alors sans retouche.
alter table public.options_groupes drop constraint if exists options_groupes_type_check;
alter table public.options_groupes add constraint options_groupes_type_check
  check (type = any (array['liste','couleur','texte','booleen','mesure','taille']));

alter table public.options_groupes
  add column if not exists mesure_groupe_id uuid references public.options_groupes(id) on delete set null,
  add column if not exists mode_taille text check (mode_taille in ('seuils','plages')),
  -- Facultatif : de quoi facturer un jour une laisse de 3 m sans créer une
  -- taille par longueur. Inutilisé sur les colliers.
  add column if not exists supplement_par_cm numeric,
  add column if not exists borne_supplement_cm numeric;

comment on column public.options_groupes.mesure_groupe_id is
  'Groupe de type « mesure », d''ordre inférieur, dont ce groupe de taille se déduit.';
comment on column public.options_groupes.mode_taille is
  'seuils : borne_min seule, la haute se déduit de la suivante (sur mesure). plages : les deux bornes, chevauchements permis (réglable).';

-- Les bornes d'une taille, sur options_valeurs.
alter table public.options_valeurs
  add column if not exists borne_min numeric,
  add column if not exists borne_max numeric;

comment on column public.options_valeurs.borne_min is
  'Taille : début de l''intervalle. En mode seuils, c''est le seul stocké.';
comment on column public.options_valeurs.borne_max is
  'Taille en mode plages : fin de l''intervalle. Null en mode seuils, où elle se déduit du seuil suivant.';

-- En mode « seuils », deux tailles ne peuvent pas partager le même seuil :
-- c'est ce qui interdit structurellement trous et chevauchements.
create unique index if not exists options_valeurs_seuil_unique
  on public.options_valeurs (groupe_id, borne_min)
  where borne_min is not null;

/**
 * Un groupe de taille se déduit d'une mesure POSÉE AVANT LUI.
 *
 * L'ordre n'est pas une préférence d'affichage : sans la mesure, la taille ne
 * se calcule pas. On refuse donc l'incohérence au lieu de la réordonner en
 * silence — la personne qui range les groupes doit savoir ce qu'elle casse.
 */
create or replace function public.verifier_groupe_taille()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_mesure record;
begin
  if new.type <> 'taille' then
    -- Un groupe qui n'est plus une taille ne garde pas ses réglages de taille.
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
    return new; -- la mesure se rattache dans un second temps
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
  if v_mesure.ordre >= new.ordre
     and coalesce(v_mesure.article_id, v_mesure.modele_id)
         is not distinct from coalesce(new.article_id, new.modele_id) then
    raise exception '« % » se déduit de « % » : la mesure doit être posée avant.', new.nom, v_mesure.nom;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_groupe_taille on public.options_groupes;
create trigger trg_groupe_taille
  before insert or update on public.options_groupes
  for each row execute function public.verifier_groupe_taille();