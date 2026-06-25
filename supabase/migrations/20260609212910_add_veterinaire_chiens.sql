alter table public.chiens
  add column if not exists veterinaire_nom text,
  add column if not exists veterinaire_telephone text;
