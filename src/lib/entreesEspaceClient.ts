/**
 * Les entrées de l'espace client, en un seul endroit.
 *
 * La barre de navigation et le tableau de bord montraient chacun leur propre
 * liste. Elles ne disaient pas la même chose : le tableau de bord proposait
 * « Mes abonnements » à une fiche du personnel, que la barre cachait, et la
 * barre ignorait « Mes factures » que le tableau de bord affichait. Deux
 * listes, deux vérités, et rien pour s'en apercevoir.
 *
 * Elles lisent désormais la même, et `entreesVisibles` est le seul juge de ce
 * qui se voit. Une entrée ajoutée ici apparaît des deux côtés, ou d'aucun.
 *
 * Aucune règle nouvelle : celles ci-dessous sont celles que la barre appliquait
 * déjà.
 */

export type EntreeEspaceClient = {
  href: string;
  /** Le libellé seul, sans l'icône : les tuiles les séparent. */
  libelle: string;
  icone: string;
  /** Actif sur cette URL exacte seulement, et non sur ce qui la prolonge. */
  exact: boolean;
  /** Caché pour une fiche du personnel : gratuite, elle n'achète rien. */
  clientSeul?: boolean;
  /** Visible du seul locataire de box. */
  locataireSeul?: boolean;
  /**
   * La racine de l'espace. La barre y mène ; le tableau de bord n'en fait pas
   * une tuile, puisque c'est la page où l'on se trouve.
   */
  racine?: boolean;
};

export const ENTREES_ESPACE_CLIENT: readonly EntreeEspaceClient[] = [
  { href: "/mon-compte", libelle: "Mon compte", icone: "🏠", exact: true, racine: true },
  { href: "/mon-compte/chiens", libelle: "Mes chiens", icone: "🐶", exact: false },
  { href: "/mon-compte/reservations", libelle: "Mes réservations", icone: "📅", exact: false },
  // Les abonnements n'ont pas de sens pour une fiche du personnel (gratuite).
  { href: "/mon-compte/abonnements", libelle: "Mes abonnements", icone: "🎟️", exact: false, clientSeul: true },
  // Les factures restent visibles au personnel : les achats au comptoir se
  // facturent comme pour n'importe qui.
  { href: "/mon-compte/factures", libelle: "Mes factures", icone: "🧾", exact: false },
  { href: "/catalogue", libelle: "Boutique", icone: "🛍️", exact: false, clientSeul: true },
  { href: "/mon-compte/commandes", libelle: "Mes commandes", icone: "📦", exact: false, clientSeul: true },
  // Les prestations n'existent que pour un locataire de box. L'entrée cachée
  // n'est qu'une politesse : la page elle-même referme la porte côté serveur.
  { href: "/mon-compte/prestations", libelle: "Mes prestations", icone: "🧹", exact: false, locataireSeul: true },
  { href: "/mon-compte/profil", libelle: "Mon profil", icone: "👤", exact: false },
  // Les tarifs ne concernent pas une fiche du personnel (réservations gratuites).
  { href: "/mon-compte/tarifs", libelle: "Tarifs", icone: "💰", exact: false, clientSeul: true },
];

export type ProfilEspaceClient = {
  /** Fiche du personnel de la pension. */
  interne?: boolean;
  /** Locataire d'un box. */
  locataire?: boolean;
};

/** Ce que ce profil a le droit de voir, dans l'ordre de la liste. */
export function entreesVisibles({
  interne = false,
  locataire = false,
}: ProfilEspaceClient = {}): EntreeEspaceClient[] {
  return ENTREES_ESPACE_CLIENT.filter(
    (e) => !(interne && e.clientSeul) && (!e.locataireSeul || locataire)
  );
}

/**
 * Les mêmes, moins la racine : ce que le tableau de bord met en tuiles.
 *
 * Elle se dérive de `entreesVisibles` et jamais d'une seconde liste : les deux
 * surfaces ne peuvent donc pas diverger sur ce qui est visible.
 */
export function tuilesVisibles(profil: ProfilEspaceClient = {}): EntreeEspaceClient[] {
  return entreesVisibles(profil).filter((e) => !e.racine);
}

/** Le libellé complet, icône comprise, tel que la barre l'affiche. */
export function libelleComplet(entree: EntreeEspaceClient): string {
  return `${entree.icone} ${entree.libelle}`;
}
