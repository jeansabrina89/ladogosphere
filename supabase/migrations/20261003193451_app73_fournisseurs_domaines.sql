-- APP 73 — les fournisseurs par domaine (décision de Sabrina, 03.10.2026).
--
-- Les fournisseurs de la boutique se trouvent dans Boutique, ceux de l'atelier
-- dans Atelier, les autres (propriétaire, énergie, assurances…) dans
-- Comptabilité. Un fournisseur peut avoir plusieurs domaines : un grossiste qui
-- livre la boutique ET l'atelier.
--
-- Aucune fonction, aucune vue, aucun droit ni aucune politique RLS ne change :
-- une colonne, sa contrainte, son remplissage initial.

alter table public.fournisseurs
  add column if not exists domaines text[] not null default '{general}';

alter table public.fournisseurs
  drop constraint if exists fournisseurs_domaines_valides;

alter table public.fournisseurs
  add constraint fournisseurs_domaines_valides check (
    cardinality(domaines) > 0
    and domaines <@ array['boutique', 'atelier', 'general']::text[]
  );

comment on column public.fournisseurs.domaines is
  'Où ce fournisseur se range : boutique, atelier, general (loyer, énergie, assurances…). Un ou plusieurs, jamais aucun.';

-- Remplissage initial, SANS RIEN INVENTER : ce que disent les articles.
-- Le code distingue une fourniture d'atelier d'un article de la boutique par
-- articles.composant (true = fourniture d'atelier, false = article boutique ;
-- src/lib/perimetreStock.ts). Un fournisseur lié à aucun article reste
-- « general », la valeur par défaut.
update public.fournisseurs f
set domaines = d.domaines
from (
  select f2.id,
         array_remove(array[
           case when exists (select 1 from public.articles a
                              where a.fournisseur_id = f2.id and a.composant = false)
                then 'boutique' end,
           case when exists (select 1 from public.articles a
                              where a.fournisseur_id = f2.id and a.composant = true)
                then 'atelier' end
         ], null) as domaines
  from public.fournisseurs f2
) d
where d.id = f.id
  and cardinality(d.domaines) > 0;
