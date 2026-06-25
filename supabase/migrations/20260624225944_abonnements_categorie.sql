alter table public.abonnements add column if not exists categorie text;
comment on column public.abonnements.categorie is 'Formule de garde journee couverte par la carte (ex: journee_partage_1, journee_partage_2, journee_privatif). Une carte ne paie que des reservations de cette formule.';
