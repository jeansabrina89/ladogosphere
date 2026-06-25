alter table public.avoirs_mouvements drop constraint avoirs_mouvements_type_check;
alter table public.avoirs_mouvements add constraint avoirs_mouvements_type_check
  check (type = any (array['ajout_manuel','retrait_manuel','annulation_paiement','utilisation','trop_percu','reprise','mise_en_avoir']));
