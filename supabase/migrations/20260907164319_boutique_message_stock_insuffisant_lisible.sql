-- Le message de refus se lit à voix haute dans le local : pas de « 12. » .
create or replace function public.appliquer_mouvement_stock()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_stock numeric;
  v_apres numeric;
begin
  if new.motif is not null and btrim(new.motif) = '' then
    new.motif := null;
  end if;
  if new.type in ('ajustement','perte','usage_interne') and new.motif is null then
    raise exception 'Indiquez le motif du mouvement.';
  end if;

  select stock_actuel into v_stock
    from public.articles where id = new.article_id for update;
  if not found then
    raise exception 'Article introuvable.';
  end if;

  v_apres := v_stock + new.quantite;

  -- Aucun stock négatif silencieux. Seul l'ajustement d'inventaire fait foi :
  -- ce qui est compté dans le local prime sur ce que dit la base.
  if v_apres < 0 and new.type <> 'ajustement' then
    raise exception 'Stock insuffisant : il reste % en stock, la sortie demandée est de %.',
      trim_zero(v_stock), trim_zero(abs(new.quantite));
  end if;

  new.quantite_apres := v_apres;

  perform set_config('app.stock_via_mouvement', 'on', true);
  update public.articles set stock_actuel = v_apres where id = new.article_id;
  perform set_config('app.stock_via_mouvement', 'off', true);

  return new;
end;
$$;

-- Un nombre écrit comme on le dit : 12, 12.5, jamais 12.000.
create or replace function public.trim_zero(n numeric)
returns text
language sql immutable
as $$
  select case
    when n = trunc(n) then trunc(n)::bigint::text
    else trim(trailing '0' from n::text)
  end;
$$;

-- La remise à zéro de la séquence : le contrôle des triggers a consommé ART-0001,
-- et aucun article n'existe encore.
select setval('public.articles_reference_seq', 1, false);