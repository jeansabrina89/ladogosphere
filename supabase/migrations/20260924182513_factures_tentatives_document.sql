-- Le renoncement de la réconciliation des documents.
--
-- La tâche du matin refabrique les documents manquants. Une facture dont la
-- génération échoue TOUJOURS — donnée manquante, modèle cassé — produisait une
-- alerte par jour, indéfiniment. Une alerte qui ne change pas d'état n'informe
-- plus : au bout d'une semaine, personne ne la lit.
--
-- Après six échecs (cinq tentatives, puis la sixième qui renonce), la facture
-- sort de la ronde quotidienne et attend une main. Le compteur repart à zéro
-- dès qu'une tentative aboutit : ce sont six échecs CONSÉCUTIFS.
--
-- L'état vit ici, mais l'HISTOIRE vit au journal des événements : une colonne
-- dit où l'on en est, le journal dit quand on a essayé et combien de fois. À
-- dix ans de distance, c'est le second qui répond aux questions.

alter table public.factures
  add column if not exists document_tentatives int not null default 0,
  add column if not exists document_renonce_le timestamptz;

comment on column public.factures.document_tentatives is
  'Échecs CONSÉCUTIFS de fabrication du document par la réconciliation quotidienne. Remis à zéro dès qu''une tentative aboutit.';

comment on column public.factures.document_renonce_le is
  'Quand la réconciliation a cessé d''essayer. Non nul = la facture attend une reprise à la main depuis l''écran d''export comptable. Elle ne compte plus dans l''alerte quotidienne, mais elle reste une pièce sans document conservé.';
