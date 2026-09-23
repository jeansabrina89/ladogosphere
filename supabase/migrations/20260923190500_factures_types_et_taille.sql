-- Le bucket des PDF de factures a été créé sans filtre ni limite, quand les
-- trois autres en ont reçu. Ce n'était pas un choix : le resserrage du 7
-- septembre ne visait que les buckets PUBLICS, où un SVG déposé devient du
-- script exécuté chez le visiteur. Celui-ci est privé, il est passé à travers.
--
-- Il ne reçoit qu'une chose : le PDF que nous fabriquons nous-mêmes, déposé
-- par la porte commune (src/lib/depotImage.ts, deposerDocument), qui impose
-- déjà application/pdf. Les 109 objets présents pèsent 1134 ko chacun ; 10 Mo
-- laissent neuf fois la marge, de quoi absorber une facture très longue sans
-- jamais gêner une facture ordinaire.
--
-- Les limites d'un bucket s'appliquent au DÉPÔT : les objets déjà là ne sont
-- ni revalidés ni rendus illisibles.

update storage.buckets
   set allowed_mime_types = array['application/pdf'],
       file_size_limit = 10485760
 where id = 'factures';
