INSERT INTO parametres (cle, valeur, description)
VALUES ('iban', 'CH00 0000 0000 0000 0000 0', 'IBAN La Dogosphère Sàrl')
ON CONFLICT (cle) DO NOTHING;
