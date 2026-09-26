-- ── APP 24-FILTRES · B : la vitrine porte les étiquettes ──────────────────
--
-- CETTE VUE EST PUBLIQUE. Le site vitrine la lit avec la clé anon, depuis un
-- autre projet. Tout ce qui est ici peut être relu par n'importe qui, en une
-- requête. C'est le constat S-04 de l'audit, et la raison de la liste qui
-- suit.
--
-- Elle reste SECURITY DEFINER, volontairement : `public.articles` est en RLS
-- et sa seule politique de lecture vise le personnel. En SECURITY INVOKER, un
-- visiteur ne verrait plus rien et la vitrine du site serait vide. C'est donc
-- la LISTE DES COLONNES qui tient lieu de garde — et elle se relit ici.
--
-- ── Les colonnes publiques, et pourquoi chacune l'est ──────────────────────
--
--   id                       cible du lien « Commander » vers la fiche de
--                            l'application ; un uuid ne dit ni la marge ni le
--                            fournisseur
--   reference                l'adresse de la fiche sur le site vitrine
--   nom, description         écrits pour être lus
--   categorie                le rayon ; déjà visible dans la liste
--   ordre_categorie          l'ordre du magasin, pour que le site range comme
--                            l'application sans recopier la liste
--   marque                   imprimée sur l'emballage
--   prix_vente               le prix TTC affiché — c'est une vitrine
--   unite                    « la pièce », « le sac » : sans quoi le prix ne
--                            veut rien dire
--   photo_path               chemin dans un bucket PUBLIC (APP 10)
--   type_article             « sur mesure » change ce que le client attend
--   delai_fabrication_jours  le délai annoncé d'un sur-mesure
--   expediable               « retrait sur place uniquement » se dit avant la
--                            commande, pas après
--   poids_grammes            le poids du colis, qui chiffre le port ; ce n'est
--                            pas un secret commercial
--   en_stock                 la disponibilité en un booléen. JAMAIS le compte
--   date_limite              « À écouler avant le 12 octobre »
--   remise_membre_exclue     pour ne pas annoncer une remise qui ne
--                            s'appliquera pas
--   ages, besoins, tailles_chien, proteines, sans_cereales, monoproteine,
--   taille_article, couleurs, matieres, usages_jouet
--                            les étiquettes : ce sont les filtres eux-mêmes,
--                            et elles décrivent le produit tel qu'il est
--                            écrit sur son emballage
--
-- ── Ce qui N'Y EST PAS, et n'y entrera pas ────────────────────────────────
--
--   prix_achat, cout_moyen, fournisseur_id   la marge et le carnet d'adresses
--   stock_actuel, stock_reserve, stock_alerte   le stock chiffré
--   code_barres, taux_tva, motif_tva, secteur_tdfn, actif, composant,
--   statut_vitrine, date_publication, publier_a_l_entree_stock   la mécanique
--                            interne : elle FILTRE la vue, elle ne s'y montre
--                            pas
--
-- `stock_disponible` SORT de la vue à ce lot. Elle y figurait depuis la
-- première version et donnait le stock exact à qui lisait la vue directement
-- — c'est la moitié du constat S-04. Aucun code ne la lit : `vitrine.ts`
-- nomme ses colonnes une à une et la range même parmi les colonnes interdites
-- au public ; le stock chiffré du client connecté est calculé depuis la TABLE,
-- avec la clé de service (`venteEnLigne.ts`).

drop view if exists public.articles_vitrine;

create view public.articles_vitrine as
  select
    a.id,
    a.reference,
    a.nom,
    a.description,
    a.categorie,
    array_position(
      array['alimentation_seche','alimentation_humide','friandises','mastication',
            'litiere','colliers','laisses','harnais','muselieres','longes','jouets',
            'peluches','couchages','soins','medaillons_accessoires','divers'],
      a.categorie
    ) as ordre_categorie,
    a.marque,
    a.prix_vente,
    a.unite,
    a.photo_path,
    a.type_article,
    a.delai_fabrication_jours,
    a.expediable,
    a.poids_grammes,
    (a.type_article = 'personnalisable' or (a.stock_actuel - a.stock_reserve) > 0) as en_stock,
    a.date_limite,
    a.remise_membre_exclue,
    -- Les étiquettes (APP 24-FILTRES · A).
    a.ages,
    a.besoins,
    a.tailles_chien,
    a.proteines,
    a.sans_cereales,
    a.monoproteine,
    a.taille_article,
    a.couleurs,
    a.matieres,
    a.usages_jouet
  from public.articles a
  where a.actif = true
    and a.vendable_en_ligne = true
    and a.composant = false
    and a.statut_vitrine = 'publie'
    and (a.date_publication is null or a.date_publication <= now());

comment on view public.articles_vitrine is
  'Le catalogue tel qu''un visiteur sans compte peut le voir. TOUTE colonne d''ici est publique : ni prix d''achat, ni coût moyen, ni fournisseur, ni stock chiffré. La disponibilité ne se dit qu''en booléen (en_stock). La liste des colonnes et leur justification sont en tête de la migration app24_vitrine_etiquettes.';

-- La vue se lit, et rien d'autre. Les droits par défaut du schéma public
-- donnaient aussi INSERT, UPDATE, DELETE et TRUNCATE à anon et authenticated :
-- une vue à colonnes calculées n'est pas modifiable, donc ces droits
-- n'ouvraient rien — mais un droit qui ne sert à rien ne se garde pas.
revoke all on public.articles_vitrine from anon, authenticated;
grant select on public.articles_vitrine to anon, authenticated;
