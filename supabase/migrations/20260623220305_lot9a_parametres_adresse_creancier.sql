insert into public.parametres (cle, valeur, description) values
  ('adresse_rue',   '',   'Adresse Sarl - rue (pour QR-facture)'),
  ('adresse_numero','',   'Adresse Sarl - numero (pour QR-facture)'),
  ('adresse_npa',   '',   'Adresse Sarl - NPA / code postal (pour QR-facture)'),
  ('adresse_ville', '',   'Adresse Sarl - ville (pour QR-facture)'),
  ('adresse_pays',  'CH', 'Adresse Sarl - pays, 2 lettres (pour QR-facture)')
on conflict (cle) do nothing;
