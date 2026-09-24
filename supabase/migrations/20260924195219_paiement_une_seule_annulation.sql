-- Un paiement ne s'annule qu'UNE fois, et c'est la base qui le tient.
--
-- `annulerPaiement` insérait une contre-passation sans rien vérifier : deux
-- clics sur un réseau lent, ou deux annulations volontaires, créaient deux
-- lignes négatives. Le solde du client partait en négatif, et en mode
-- « avoir », deux avoirs étaient crédités pour un seul versement.
--
-- Une clé d'idempotence ne suffirait pas : elle arrête le double clic, pas une
-- seconde annulation demandée plus tard. Le verrou doit être en base.
--
-- POURQUOI UNE COLONNE NOUVELLE. Rien ne reliait une contre-passation à son
-- original : elle n'était qu'une ligne négative reconnaissable à son motif.
-- `rattache_de` existe mais dit autre chose — l'acompte rattaché à une facture.
-- Sans lien, aucun index ne peut exprimer « une seule annulation par
-- paiement » ; le rapprochement par montant et par pièce serait une devinette,
-- et deux versements identiques le même jour la prendraient en défaut.
--
-- Relevé avant d'agir : AUCUN paiement n'est aujourd'hui contre-passé plus
-- d'une fois. La contrainte ne casse donc rien d'existant.

alter table public.paiements_resa
  add column if not exists annule_de uuid references public.paiements_resa (id);

comment on column public.paiements_resa.annule_de is
  'Le paiement que cette ligne contre-passe. Renseigné sur la ligne NÉGATIVE d''annulation, jamais sur l''originale. Un paiement ne peut être contre-passé qu''une fois : index unique paiement_une_seule_annulation.';

-- L'index est PARTIEL : seules les lignes d'annulation portent la colonne, et
-- les millions de versements ordinaires ne pèsent pas dans l'index.
create unique index if not exists paiement_une_seule_annulation
  on public.paiements_resa (annule_de)
  where annule_de is not null;
