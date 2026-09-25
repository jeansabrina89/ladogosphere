/**
 * Le catalogue des permissions, rangé par domaine — et les trois postes qui
 * pré-remplissent les cases.
 *
 * C'est ICI que vit la liste de référence, et non dans la garde d'accès : un
 * composant client doit pouvoir la lire sans entraîner `next/headers` dans le
 * paquet du navigateur. `accesAdmin` la réexporte pour tout le reste.
 *
 * Pourquoi ce fichier existe : la liste des employés n'affichait que NEUF des
 * permissions. Cocher « Boutique » fonctionnait, mais ne se voyait nulle part,
 * et on croyait que la coche n'avait pas pris. Une liste partielle est pire
 * qu'une liste absente : elle ment sans le dire.
 *
 * `DOMAINES` est donc contrôlé par un test contre `PERMISSIONS_PERSONNEL` :
 * une permission ajoutée un jour et oubliée ici fait échouer la suite, au lieu
 * de disparaître silencieusement de l'écran.
 *
 * Fonction pure : ni base, ni requête.
 */

/**
 * Les colonnes `perm_*` de `profiles`, dans l'ordre alphabétique.
 *
 * Cette liste et `DOMAINES` disent la même chose de deux façons — l'une pour
 * les requêtes, l'autre pour l'écran. Un test les confronte : une permission
 * ajoutée à l'une et oubliée dans l'autre fait échouer la suite.
 */
export const PERMISSIONS_PERSONNEL = [
  "perm_atelier",
  "perm_avoirs",
  "perm_boutique_vente",
  "perm_boutique_gestion",
  "perm_box",
  "perm_checkin",
  "perm_chiens_creer",
  "perm_chiens_modifier",
  "perm_clients_creer",
  "perm_clients_modifier",
  "perm_depenses",
  "perm_encaissements",
  "perm_factures",
  "perm_journee_essai",
  "perm_planning",
  "perm_prestations",
  "perm_reservations_annuler",
  "perm_reservations_creer",
  "perm_reservations_modifier",
  "perm_tarifs_urgence",
  "perm_timbrage_equipe",
  "perm_vacances_equipe",
] as const;

export type PermissionPersonnel = (typeof PERMISSIONS_PERSONNEL)[number];

export type EntreePermission = {
  cle: PermissionPersonnel;
  /** Le nom court, celui qui tient dans une pastille — et le libellé de la case. */
  court: string;
  /**
   * Ce que la case ouvre, en une phrase, sous son libellé dans la fiche d'un
   * employé. Absente quand le libellé dit déjà tout.
   */
  aide?: string;
};

export type DomainePermissions = {
  nom: string;
  entrees: EntreePermission[];
};

export const DOMAINES: DomainePermissions[] = [
  {
    nom: "Pension",
    entrees: [
      { cle: "perm_checkin", court: "Check-in / départ" },
      { cle: "perm_planning", court: "Planning" },
      { cle: "perm_box", court: "Box", aide: "Attribuer et gérer les box." },
      {
        cle: "perm_journee_essai", court: "Journées d'essai",
        aide: "Valider ou invalider une journée d'essai.",
      },
      {
        cle: "perm_prestations", court: "Prestations locataires",
        aide: "Voir et cocher les tâches du jour des locataires de box (repas, passages, nettoyages). Pas la facturation.",
      },
      { cle: "perm_reservations_creer", court: "Créer résa" },
      { cle: "perm_reservations_modifier", court: "Modifier résa" },
      { cle: "perm_reservations_annuler", court: "Annuler résa" },
    ],
  },
  {
    nom: "Clients",
    entrees: [
      { cle: "perm_clients_creer", court: "Créer clients" },
      { cle: "perm_clients_modifier", court: "Modifier clients" },
      { cle: "perm_chiens_creer", court: "Créer chiens" },
      { cle: "perm_chiens_modifier", court: "Modifier chiens" },
    ],
  },
  {
    nom: "Comptoir",
    entrees: [
      {
        cle: "perm_avoirs", court: "Créditer un avoir",
        aide: "Donner de l argent a un client : crediter, corriger ou retirer un avoir a la main. Separee des encaissements par decision du 26 septembre 2026 — encaisser, c est recevoir ; crediter, c est donner.",
      },
      {
        cle: "perm_encaissements", court: "Encaissements",
        aide: "Le geste au comptoir : encaisser un paiement, payer AVEC un avoir, enregistrer une adhésion ou un abonnement. Depuis la fiche de réservation, l'écran de départ et la caisse.",
      },
      {
        cle: "perm_factures", court: "Factures",
        aide: "Le travail administratif : la liste des factures, les relances, l'émission d'une facture libre. Distincte de l'encaissement, et volontairement rare.",
      },
      { cle: "perm_tarifs_urgence", court: "Tarif d'urgence", aide: "Appliquer le tarif d'urgence." },
      {
        cle: "perm_depenses", court: "Dépenses",
        aide: "Saisir, valider et payer, carnet de fournisseurs.",
      },
    ],
  },
  {
    nom: "Boutique",
    entrees: [
      {
        cle: "perm_boutique_vente", court: "Boutique — vente",
        aide: "La caisse, les retours, le catalogue en lecture, les commandes sur mesure et en ligne.",
      },
      {
        cle: "perm_boutique_gestion", court: "Boutique — gestion",
        aide: "Créer et modifier des articles, les options et les modèles, l'inventaire, les entrées de stock et les prix d'achat. Elle ouvre aussi la vente.",
      },
    ],
  },
  {
    nom: "Atelier",
    entrees: [{
      cle: "perm_atelier", court: "Atelier",
      aide: "Les fournitures de fabrication (sangle, boucles, rivets, puces), leur inventaire et leurs entrées de stock. Indépendante des permissions boutique.",
    }],
  },
  {
    nom: "Équipe",
    entrees: [
      { cle: "perm_timbrage_equipe", court: "Timbrage équipe", aide: "Gérer le timbrage de l'équipe." },
      { cle: "perm_vacances_equipe", court: "Vacances équipe", aide: "Approuver les vacances de l'équipe." },
    ],
  },
];

/** Toutes les permissions du catalogue, dans l'ordre des domaines. */
export const TOUTES_PERMISSIONS: PermissionPersonnel[] =
  DOMAINES.flatMap((d) => d.entrees.map((e) => e.cle));

/**
 * Les permissions telles que le formulaire d'un employé les envoie.
 *
 * Une case décochée n'envoie rien : elle vaut `false`. Toutes les clés du
 * catalogue sont écrites, à chaque enregistrement — une clé oubliée ici serait
 * une case qu'on coche sans effet, ou pire, une permission remise à zéro par un
 * formulaire qui ne l'affiche pas.
 */
export function permissionsDepuisFormulaire(
  formData: { get(nom: string): unknown }
): Record<PermissionPersonnel, boolean> {
  return Object.fromEntries(
    PERMISSIONS_PERSONNEL.map((p) => [p, formData.get(p) === "on"])
  ) as Record<PermissionPersonnel, boolean>;
}

/** Le nombre affiché dans « 13 sur 20 » — jamais écrit en dur. */
export const NOMBRE_PERMISSIONS = PERMISSIONS_PERSONNEL.length;

/**
 * Combien de permissions ce profil porte, sur combien.
 *
 * L'administratrice les a toutes d'office : ses colonnes ne veulent rien dire,
 * et afficher « 3 sur 20 » sur sa fiche serait faux.
 */
export function compterPermissions(
  profil: Record<string, unknown> | null | undefined,
  estAdmin = false
): { accordees: number; total: number } {
  const total = NOMBRE_PERMISSIONS;
  if (estAdmin) return { accordees: total, total };
  const accordees = PERMISSIONS_PERSONNEL.filter((p) => profil?.[p] === true).length;
  return { accordees, total };
}

// ── Les trois postes ────────────────────────────────────────────────────────

/**
 * Des raccourcis, pas des rôles : ils cochent des cases et rien de plus. Rien
 * ne les enregistre, rien ne les relit, et l'application ne demandera jamais
 * « est-elle vendeuse ? ».
 *
 * Chaque poste contient le précédent, comme le métier se construit. Aucun ne
 * coche « Factures » ni « Atelier » : le carnet de comptes et la réserve de
 * fabrication se donnent une décision à la fois.
 */
export const SOIGNEUSE: PermissionPersonnel[] = [
  "perm_checkin",
  "perm_planning",
  "perm_box",
  "perm_journee_essai",
  // Les passages chez les locataires de box sont un geste de terrain.
  "perm_prestations",
  "perm_reservations_creer",
  "perm_reservations_modifier",
  "perm_chiens_creer",
  "perm_chiens_modifier",
  "perm_clients_creer",
  "perm_clients_modifier",
];

export const VENDEUSE: PermissionPersonnel[] = [
  ...SOIGNEUSE,
  "perm_encaissements",
  "perm_boutique_vente",
];

export const RESPONSABLE: PermissionPersonnel[] = [
  ...VENDEUSE,
  "perm_boutique_gestion",
  "perm_depenses",
  "perm_tarifs_urgence",
  "perm_timbrage_equipe",
  "perm_vacances_equipe",
];

export type Poste = {
  cle: "soigneuse" | "vendeuse" | "responsable";
  bouton: string;
  cases: PermissionPersonnel[];
  aide: string;
};

export const POSTES: Poste[] = [
  {
    cle: "soigneuse",
    bouton: "🐾 Soigneuse",
    cases: SOIGNEUSE,
    aide: "Check-in, planning, box, journées d'essai, tâches des locataires, créer et modifier réservations, chiens et clients.",
  },
  {
    cle: "vendeuse",
    bouton: "👜 Vendeuse",
    cases: VENDEUSE,
    aide: "Tout ce que fait une soigneuse, plus les encaissements et « Boutique — vente ».",
  },
  {
    cle: "responsable",
    bouton: "🔑 Responsable",
    cases: RESPONSABLE,
    aide: "Tout ce que fait une vendeuse, plus la gestion boutique, les dépenses, le tarif d'urgence, le timbrage et les vacances de l'équipe.",
  },
];

/** Les permissions qu'aucun raccourci ne coche jamais. */
export const JAMAIS_PAR_RACCOURCI: PermissionPersonnel[] = ["perm_factures", "perm_atelier"];
