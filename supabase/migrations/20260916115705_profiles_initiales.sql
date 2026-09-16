-- Les initiales du personnel.
--
-- Le journal enregistre qui a fait chaque geste. À l'écran, cet auteur se lit
-- en deux ou trois lettres — « 14.09.2026 17:32 · Départ · SJ » — et ces lettres
-- doivent désigner une seule personne de l'équipe active.
--
-- LA RÈGLE (la même que src/lib/auteur.ts, qui fait référence et est testée) :
--   1. prénom et nom : la première lettre de chacun ; en cas de collision, la
--      deuxième lettre du nom s'ajoute, puis la troisième, et ainsi de suite ;
--      puis la deuxième lettre du prénom ;
--   2. prénom seul ou nom seul : ses deux premières lettres, puis une troisième ;
--   3. ni l'un ni l'autre : les deux premières lettres de l'adresse e-mail ;
--   4. en dernier recours : ces deux lettres, suivies de A à Z.
-- Les accents tombent, tout ce qui n'est pas une lettre aussi.
--
-- LE NOM D'UNE PERSONNE vient d'abord de sa fiche RH, puis de son profil. Les
-- profils du personnel portent souvent un nom provisoire (« Employé Inconnu 1 »)
-- ou aucun nom, alors que la fiche RH liée porte le vrai : ce sont les initiales
-- de la vraie personne qu'on veut lire.
--
-- Les initiales sont uniques parmi le personnel ACTIF (index partiel). La reprise
-- les attribue dans l'ordre de création des comptes, en évitant celles de tout le
-- personnel, actif ou non : un compte réactivé ne tombe pas sur un doublon.
--
-- Un compte du personnel créé plus tard reçoit les siennes par le trigger, avec
-- la même fonction. Elles se corrigent ensuite à la main.

begin;

alter table public.profiles add column if not exists initiales text;

alter table public.profiles drop constraint if exists profiles_initiales_format;
alter table public.profiles add constraint profiles_initiales_format
  check (initiales is null or initiales ~ '^[A-Z]{2,3}$');

-- Les lettres A–Z d'un texte, accents retirés. La table d'accents est la même
-- que celle de src/lib/auteur.ts.
create or replace function public.lettres_majuscules(p_texte text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select regexp_replace(
    translate(upper(coalesce(p_texte, '')),
              'ÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝŸ',
              'AAAAAACEEEEIIIINOOOOOUUUUYY'),
    '[^A-Z]', '', 'g');
$function$;

-- Les initiales à essayer, dans l'ordre de la règle.
create or replace function public.candidats_initiales(p_prenom text, p_nom text, p_email text)
returns text[]
language plpgsql
immutable
set search_path to ''
as $function$
declare
  p text := public.lettres_majuscules(p_prenom);
  n text := public.lettres_majuscules(p_nom);
  e text := public.lettres_majuscules(split_part(coalesce(p_email, ''), '@', 1));
  c text[] := '{}';
  base text;
  k int;
begin
  if length(p) >= 1 and length(n) >= 1 then
    c := c || (substr(p, 1, 1) || substr(n, 1, 1));
    for k in 2 .. length(n) loop
      c := c || (substr(p, 1, 1) || substr(n, 1, 1) || substr(n, k, 1));
    end loop;
    if length(p) >= 2 then
      c := c || (substr(p, 1, 2) || substr(n, 1, 1));
    end if;
  elsif length(p) >= 2 then
    c := c || substr(p, 1, 2);
    for k in 3 .. length(p) loop c := c || (substr(p, 1, 2) || substr(p, k, 1)); end loop;
  elsif length(n) >= 2 then
    c := c || substr(n, 1, 2);
    for k in 3 .. length(n) loop c := c || (substr(n, 1, 2) || substr(n, k, 1)); end loop;
  elsif length(e) >= 2 then
    c := c || substr(e, 1, 2);
    for k in 3 .. length(e) loop c := c || (substr(e, 1, 2) || substr(e, k, 1)); end loop;
  end if;

  base := substr(coalesce(c[1], 'XX'), 1, 2);
  if cardinality(c) = 0 then c := c || base; end if;
  for k in 65 .. 90 loop c := c || (base || chr(k)); end loop;

  -- Sans doublon, dans l'ordre, et seulement ce qui a la forme voulue.
  return array(
    select x from (
      select x, min(ord) as ord
      from unnest(c) with ordinality as t(x, ord)
      where x ~ '^[A-Z]{2,3}$'
      group by x
    ) s order by ord
  );
end;
$function$;

-- Les premières initiales libres pour cette personne, hors celles du reste du
-- personnel (actif ou non).
create or replace function public.calculer_initiales(
  p_prenom text, p_nom text, p_email text, p_exclure uuid
)
returns text
language plpgsql
stable
set search_path to ''
as $function$
declare
  candidats text[] := public.candidats_initiales(p_prenom, p_nom, p_email);
  x text;
begin
  foreach x in array candidats loop
    if not exists (
      select 1 from public.profiles
      where initiales = x
        and role in ('admin', 'employe')
        and id is distinct from p_exclure
    ) then
      return x;
    end if;
  end loop;
  return candidats[cardinality(candidats)];
end;
$function$;

-- Un compte du personnel sans initiales en reçoit, à sa création comme au
-- passage d'un compte client au personnel.
create or replace function public.profiles_initiales_par_defaut()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  rh record;
begin
  select prenom, nom into rh
  from public.employes_rh
  where profile_id = new.id
  order by actif desc nulls last
  limit 1;

  new.initiales := public.calculer_initiales(
    coalesce(nullif(btrim(rh.prenom), ''), new.prenom),
    coalesce(nullif(btrim(rh.nom), ''), new.nom),
    new.email,
    new.id
  );
  return new;
end;
$function$;

drop trigger if exists trg_profiles_initiales on public.profiles;
create trigger trg_profiles_initiales
  before insert or update on public.profiles
  for each row
  when (new.initiales is null and new.role in ('admin', 'employe'))
  execute function public.profiles_initiales_par_defaut();

-- La reprise : dans l'ordre de création, une personne après l'autre, pour que
-- chacune voie celles déjà attribuées.
do $reprise$
declare
  r record;
begin
  for r in
    select p.id, p.prenom, p.nom, p.email,
           (select rh.prenom from public.employes_rh rh where rh.profile_id = p.id
            order by rh.actif desc nulls last limit 1) as rh_prenom,
           (select rh.nom from public.employes_rh rh where rh.profile_id = p.id
            order by rh.actif desc nulls last limit 1) as rh_nom
    from public.profiles p
    where p.role in ('admin', 'employe') and p.initiales is null
    order by p.created_at, p.id
  loop
    update public.profiles
    set initiales = public.calculer_initiales(
      coalesce(nullif(btrim(r.rh_prenom), ''), r.prenom),
      coalesce(nullif(btrim(r.rh_nom), ''), r.nom),
      r.email,
      r.id
    )
    where id = r.id;
  end loop;
end
$reprise$;

create unique index if not exists profiles_initiales_personnel_actif
  on public.profiles (initiales)
  where actif and role in ('admin', 'employe');

commit;