/**
 * Les huit espaces de l'application, et ce que chacun montre à qui.
 *
 * Fonction pure, sans base ni requête : c'est elle qui porte la composition des
 * menus, et c'est elle que les tests couvrent. Les écrans ne changent PAS
 * d'adresse — un espace est un regroupement de menus, pas un déménagement.
 *
 * Règle unique et absolue : la navigation se CONFORME aux gardes d'accès posées
 * sur chaque page (`exigerAccesAdmin` / `exigerAdminPage`), elle ne les
 * redéfinit jamais. L'exigence écrite ici pour un écran est exactement celle de
 * sa page. Si les deux divergeaient, on afficherait une porte qui se referme.
 */

/** Les seules permissions qui font varier la navigation. */
export type DroitsNav = {
  isAdmin: boolean;
  perm_encaissements: boolean;
  perm_factures: boolean;
  perm_depenses: boolean;
  perm_boutique_vente: boolean;
  perm_boutique_gestion: boolean;
  perm_atelier: boolean;
};

export type PermissionNav = Exclude<keyof DroitsNav, "isAdmin">;

/**
 * Ce qu'il faut pour ouvrir un écran :
 *  - « personnel »  : tout admin ou employé (exigerAccesAdmin() sans argument) ;
 *  - « admin »      : l'administratrice seule (exigerAdminPage()) ;
 *  - une permission : exigerAccesAdmin("perm_…"), que l'admin a d'office.
 */
export type Exigence =
  | { type: "personnel" }
  | { type: "admin" }
  | { type: "permission"; permission: PermissionNav };

export const PERSONNEL: Exigence = { type: "personnel" };
export const ADMIN: Exigence = { type: "admin" };
export const perm = (permission: PermissionNav): Exigence => ({ type: "permission", permission });

/**
 * Les droits de navigation, à partir de ce que rendent les gardes existantes :
 * `exigerAccesAdmin` (AccesAdmin.permissions, déjà normalisé) ou
 * `getProfilePerms` (ProfilePerms, déjà à plat). Une seule lecture, deux
 * sources — on ne réinterroge pas la base pour dessiner un menu.
 */
export function droitsNav(
  brut: Record<string, unknown> | null | undefined,
  isAdmin = false
): DroitsNav {
  const vrai = (cle: PermissionNav) => isAdmin || brut?.[cle] === true;
  return {
    isAdmin,
    perm_encaissements: vrai("perm_encaissements"),
    perm_factures: vrai("perm_factures"),
    perm_depenses: vrai("perm_depenses"),
    perm_boutique_vente: vrai("perm_boutique_vente"),
    perm_boutique_gestion: vrai("perm_boutique_gestion"),
    perm_atelier: vrai("perm_atelier"),
  };
}

export function ouvert(exigence: Exigence, droits: DroitsNav): boolean {
  if (exigence.type === "personnel") return true;
  if (exigence.type === "admin") return droits.isAdmin;
  return droits.isAdmin || droits[exigence.permission] === true;
}

export type Ecran = {
  href: string;
  label: string;
  exigence: Exigence;
  /** Un href qui est le préfixe d'un autre ne s'active que sur lui-même. */
  exact?: boolean;
};

export type CleEspace =
  | "aujourdhui" | "pension" | "clients" | "boutique"
  | "atelier" | "comptabilite" | "equipe" | "reglages";

export type Espace = {
  cle: CleEspace;
  /** Le nom court de la barre latérale, icône comprise. */
  label: string;
  /**
   * La porte de l'espace lui-même, INDÉPENDANTE de celles de ses écrans.
   *
   * Sans elle, un espace s'ouvrait dès qu'un seul de ses écrans l'était : une
   * employée qui encaissait voyait « Comptabilité » apparaître dans sa barre
   * pour la seule liste des factures. C'est le contraire de ce qu'on veut —
   * un espace se décide comme un tout, puis son contenu se filtre.
   */
  exigence: Exigence;
  /** La page d'accueil de l'espace : elle aussi est un écran, avec sa garde. */
  accueil: Ecran;
  ecrans: Ecran[];
};

/**
 * Composition de référence.
 *
 * Trois accueils n'ont PAS d'adresse nouvelle : /boutique et /comptabilite
 * existaient déjà comme accueils, et « Aujourd'hui » reprend « / », qui était
 * le tableau de bord. Les cinq autres accueils sont des pages ajoutées.
 */
export const ESPACES: Espace[] = [
  {
    cle: "aujourdhui",
    label: "📋 Aujourd'hui",
    exigence: PERSONNEL,
    accueil: { href: "/", label: "📋 Aujourd'hui", exigence: PERSONNEL, exact: true },
    ecrans: [],
  },
  {
    // Les réservations sont un écran d'EXPLOITATION : on les ouvre pour savoir
    // qui arrive, pas pour tenir un fichier de clientèle. Elles vivent donc là
    // où l'on travaille la journée.
    cle: "pension",
    label: "🐾 Pension",
    exigence: PERSONNEL,
    accueil: { href: "/pension", label: "🏠 Pension", exigence: PERSONNEL, exact: true },
    ecrans: [
      { href: "/chiens-du-jour", label: "🐾 Chiens du jour", exigence: PERSONNEL },
      { href: "/checkin", label: "✅ Check-in", exigence: PERSONNEL },
      { href: "/reservations", label: "📅 Réservations", exigence: PERSONNEL },
      { href: "/planning", label: "🗂️ Planning", exigence: PERSONNEL },
      { href: "/boxes", label: "🏠 Box", exigence: PERSONNEL },
      { href: "/calendrier-essais", label: "🚫 Essais fermés", exigence: PERSONNEL },
    ],
  },
  {
    cle: "clients",
    label: "👤 Clients",
    exigence: PERSONNEL,
    accueil: { href: "/clientele", label: "🏠 Clients", exigence: PERSONNEL, exact: true },
    ecrans: [
      { href: "/clients", label: "👤 Clients", exigence: PERSONNEL },
      // « /chiens » est le préfixe de « /chiens-du-jour », qui vit dans la
      // Pension : l'activation se fait au segment, jamais à la lettre.
      { href: "/chiens", label: "🐶 Chiens", exigence: PERSONNEL },
      // Adhésions et abonnements sont des gestes de comptoir : ils suivent
      // l'encaissement, pas le travail administratif de facturation.
      { href: "/adhesions", label: "🎫 Adhésions", exigence: perm("perm_encaissements") },
      { href: "/abonnements", label: "🎟️ Abonnements", exigence: perm("perm_encaissements") },
    ],
  },
  {
    cle: "boutique",
    label: "🛍️ Boutique",
    exigence: perm("perm_boutique_vente"),
    accueil: { href: "/boutique", label: "🏠 Boutique", exigence: perm("perm_boutique_vente"), exact: true },
    ecrans: [
      { href: "/boutique/caisse", label: "💳 Caisse", exigence: perm("perm_boutique_vente") },
      { href: "/boutique/ventes", label: "🧾 Ventes", exigence: perm("perm_boutique_vente") },
      { href: "/boutique/commandes-en-ligne", label: "🌐 En ligne", exigence: perm("perm_boutique_vente") },
      { href: "/boutique/articles", label: "🛒 Articles", exigence: perm("perm_boutique_vente") },
      { href: "/boutique/inventaire", label: "📦 Inventaire", exigence: perm("perm_boutique_gestion") },
      // Un seul écran, deux chemins d'accès : la fiche fournisseur sert aussi
      // bien aux dépenses qu'à la boutique. Sa garde est « Dépenses » — la
      // barre se conforme à la garde de l'écran, pas à celle de l'espace.
      { href: "/comptabilite/fournisseurs", label: "🏢 Fournisseurs", exigence: perm("perm_depenses") },
    ],
  },
  {
    /**
     * Modèles d'options et commandes sur mesure sont des outils de FABRICATION.
     * Ils gardent leur adresse sous /boutique — les liens et les favoris ne
     * changent pas — mais ils se rangent ici.
     *
     * Le déplacement est celui du MENU, pas celui de la capacité de vendre : la
     * caisse garde son configurateur, et une vendeuse sans atelier vend un
     * collier sur mesure sans jamais voir cet espace.
     */
    cle: "atelier",
    label: "🧰 Atelier",
    exigence: perm("perm_atelier"),
    accueil: { href: "/atelier", label: "🏠 Atelier", exigence: perm("perm_atelier"), exact: true },
    ecrans: [
      { href: "/atelier/fournitures", label: "🧵 Fournitures", exigence: perm("perm_atelier") },
      { href: "/atelier/inventaire", label: "📦 Inventaire", exigence: perm("perm_atelier") },
      { href: "/atelier/entrees", label: "📥 Entrées de stock", exigence: perm("perm_atelier") },
      { href: "/boutique/modeles", label: "🧩 Modèles", exigence: perm("perm_boutique_gestion") },
      { href: "/boutique/commandes", label: "🎁 Commandes sur mesure", exigence: perm("perm_boutique_vente") },
    ],
  },
  {
    /**
     * Entièrement réservé à l'administratrice, par la porte de l'ESPACE.
     *
     * Ses écrans gardent chacun l'exigence de leur page — c'est la règle de la
     * maison — mais aucune employée n'entre ici, quelles que soient ses
     * permissions. C'est le carnet de comptes de la pension.
     */
    cle: "comptabilite",
    label: "📈 Comptabilité",
    exigence: ADMIN,
    accueil: { href: "/comptabilite", label: "🏠 Comptabilité", exigence: ADMIN, exact: true },
    ecrans: [
      { href: "/factures", label: "🧾 Factures", exigence: perm("perm_factures") },
      { href: "/comptabilite/a-regulariser", label: "💰 À encaisser", exigence: ADMIN },
      { href: "/comptabilite/relances", label: "🔔 Relances", exigence: perm("perm_factures") },
      { href: "/comptabilite/depenses", label: "💸 Dépenses", exigence: perm("perm_depenses") },
      { href: "/comptabilite/fournisseurs", label: "🏢 Fournisseurs", exigence: perm("perm_depenses") },
      { href: "/comptabilite/journal", label: "📒 Journal", exigence: ADMIN },
      { href: "/comptabilite/rapports", label: "📊 Rapports", exigence: ADMIN },
    ],
  },
  {
    cle: "equipe",
    label: "👥 Équipe",
    exigence: ADMIN,
    accueil: { href: "/equipe", label: "🏠 Équipe", exigence: ADMIN, exact: true },
    ecrans: [
      { href: "/employes", label: "👥 Équipe", exigence: ADMIN, exact: true },
      { href: "/employes/planning", label: "🗓️ Planning équipe", exigence: ADMIN },
      { href: "/employes/timbrage", label: "⏱️ Timbrage", exigence: ADMIN },
      { href: "/employes/vacances", label: "🌴 Vacances", exigence: ADMIN },
    ],
  },
  {
    cle: "reglages",
    label: "⚙️ Réglages",
    exigence: ADMIN,
    accueil: { href: "/reglages", label: "🏠 Réglages", exigence: ADMIN, exact: true },
    ecrans: [
      { href: "/tarifs", label: "💰 Tarifs", exigence: ADMIN },
      { href: "/emails", label: "✉️ Modèles d'e-mails", exigence: ADMIN },
    ],
  },
];

export type EspaceVisible = {
  cle: CleEspace;
  label: string;
  /**
   * Où mène l'entrée de la barre latérale : l'accueil quand on y a droit,
   * sinon le PREMIER écran autorisé. Une entrée de menu ne doit jamais
   * conduire à une redirection.
   */
  href: string;
  /** L'accueil et les écrans autorisés, dans l'ordre — le contenu de la barre secondaire. */
  entrees: Ecran[];
};

/**
 * Les espaces d'une personne, dans l'ordre. Un espace dont aucun écran ne lui
 * est ouvert n'apparaît PAS — ni grisé, ni vide : absent.
 */
export function espacesVisibles(droits: DroitsNav, espaces: Espace[] = ESPACES): EspaceVisible[] {
  const visibles: EspaceVisible[] = [];
  for (const espace of espaces) {
    // La porte de l'espace d'abord. Un seul écran ouvert ne suffit plus à
    // faire apparaître tout un espace : c'est ainsi que « Comptabilité »
    // s'ouvrait à qui n'avait que l'encaissement.
    if (!ouvert(espace.exigence, droits)) continue;

    const entrees: Ecran[] = [];
    if (ouvert(espace.accueil.exigence, droits)) entrees.push(espace.accueil);
    for (const e of espace.ecrans) if (ouvert(e.exigence, droits)) entrees.push(e);
    if (entrees.length === 0) continue;
    visibles.push({ cle: espace.cle, label: espace.label, href: entrees[0].href, entrees });
  }
  return visibles;
}

/** Les entrées de la barre secondaire d'un espace donné. */
export function entreesEspace(cle: CleEspace, droits: DroitsNav): Ecran[] {
  return espacesVisibles(droits).find((e) => e.cle === cle)?.entrees ?? [];
}

/** Le nom d'un espace sans son icône — pour une étiquette d'accessibilité. */
export function nomEspace(cle: CleEspace, espaces: Espace[] = ESPACES): string {
  const label = espaces.find((e) => e.cle === cle)?.label ?? "";
  const coupe = label.indexOf(" ");
  return coupe > 0 ? label.slice(coupe + 1) : label;
}

export function espaceParCle(cle: CleEspace, espaces: Espace[] = ESPACES): Espace {
  const trouve = espaces.find((e) => e.cle === cle);
  if (!trouve) throw new Error(`Espace inconnu : ${cle}`);
  return trouve;
}

/**
 * Un lien est actif sur lui-même et sur ses sous-pages, jamais sur un voisin
 * qui commence pareil : « /chiens » ne doit pas s'allumer sur
 * « /chiens-du-jour ». La frontière est le séparateur de segment.
 */
export function estActif(chemin: string, href: string, exact = false): boolean {
  const c = (chemin.split("?")[0].replace(/\/+$/, "") || "/");
  const h = (href.split("?")[0].replace(/\/+$/, "") || "/");
  if (c === h) return true;
  if (exact || h === "/") return false;
  return c.startsWith(h + "/");
}

/**
 * L'espace auquel appartient une adresse : celui dont un écran correspond le
 * plus précisément. Sert à allumer la bonne entrée de la barre latérale.
 */
export function espaceDuChemin(chemin: string, espaces: Espace[] = ESPACES): CleEspace | null {
  let meilleur: { cle: CleEspace; longueur: number } | null = null;
  for (const espace of espaces) {
    for (const ecran of [espace.accueil, ...espace.ecrans]) {
      if (!estActif(chemin, ecran.href, ecran.exact)) continue;
      const longueur = ecran.href.length;
      if (!meilleur || longueur > meilleur.longueur) meilleur = { cle: espace.cle, longueur };
    }
  }
  return meilleur?.cle ?? null;
}
