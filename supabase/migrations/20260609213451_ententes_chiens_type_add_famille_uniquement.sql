alter table public.ententes_chiens
  drop constraint if exists ententes_chiens_type_check;

alter table public.ententes_chiens
  add constraint ententes_chiens_type_check
  check (type = any (array['positif'::text, 'negatif'::text, 'box_compatible'::text, 'famille_uniquement'::text]));
