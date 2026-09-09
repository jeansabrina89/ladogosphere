-- Coordonnées de l'en-tête des factures (PDF). Vides tant qu'elles ne sont pas
-- renseignées : la ligne correspondante disparaît alors du document.
insert into public.parametres (cle, valeur, description) values
  ('email_entreprise',     '', 'E-mail affiché sur les factures'),
  ('telephone_entreprise', '', 'Téléphone affiché sur les factures'),
  ('ide',                  '', 'Numéro IDE (CHE-...) affiché sur les factures')
on conflict (cle) do nothing;