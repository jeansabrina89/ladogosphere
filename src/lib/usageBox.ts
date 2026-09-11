/**
 * À quoi sert un box.
 *
 * Les quatorze box de la maison ne servent pas tous la même chose. Deux
 * d'entre eux ne sont pas de la pension :
 *
 *   · celui des chiens de Sabrina — privé, hors société, aucun loyer ;
 *   · celui de Belle — loyer payé à la propriétaire, puis refacturé au
 *     propriétaire du chien.
 *
 * Les compter avec les autres donne « 14 », un nombre qui ne veut rien dire au
 * moment de décider si l'on accepte une réservation. « 12 box de pension ·
 * 2 box particuliers » se lit et se décide.
 *
 * Un box particulier n'en occupe pas moins de la surface : il n'est retiré
 * d'AUCUN calcul de disponibilité. L'usage dit à quoi il sert, pas s'il existe.
 *
 * Fonction pure : ni base, ni requête.
 */

export type UsageBox = "pension" | "prive_hors_sarl" | "refacture";

export const USAGE_BOX_PAR_DEFAUT: UsageBox = "pension";

export const USAGES_BOX: {
  valeur: UsageBox;
  libelle: string;
  aide: string;
  /** Compte-t-il dans les places offertes à la clientèle ? */
  pourLaPension: boolean;
  pastille: string;
  couleur: string;
  fond: string;
}[] = [
  {
    valeur: "pension",
    libelle: "Pension",
    aide: "Accueille les chiens des clients. C'est le cas de la plupart des box.",
    pourLaPension: true,
    pastille: "Pension",
    couleur: "#1F6E5B",
    fond: "#DFF0E8",
  },
  {
    valeur: "prive_hors_sarl",
    libelle: "Privé hors société",
    aide:
      "Les chiens de la propriétaire. Hors société : elle ne paie aucun loyer " +
      "pour ce box et n'en tire aucun produit.",
    pourLaPension: false,
    pastille: "🏡 Privé hors société",
    couleur: "#6E5410",
    fond: "#F4EAC9",
  },
  {
    valeur: "refacture",
    libelle: "Refacturé",
    aide:
      "Loyer payé à la propriétaire, puis refacturé au propriétaire du chien. " +
      "Le box ne fait ni perte ni bénéfice pour la société.",
    pourLaPension: false,
    pastille: "↔️ Refacturé",
    couleur: "#1B2B5E",
    fond: "#E4E7F0",
  },
];

export function usageBox(valeur: string | null | undefined): UsageBox {
  return USAGES_BOX.some((u) => u.valeur === valeur)
    ? (valeur as UsageBox)
    : USAGE_BOX_PAR_DEFAUT;
}

export function infoUsageBox(valeur: string | null | undefined) {
  return USAGES_BOX.find((u) => u.valeur === usageBox(valeur))!;
}

export function libelleUsageBox(valeur: string | null | undefined): string {
  return infoUsageBox(valeur).libelle;
}

/** Ce box est-il offert à la clientèle ? */
export function estBoxDePension(valeur: string | null | undefined): boolean {
  return infoUsageBox(valeur).pourLaPension;
}

export type ParcBox = {
  /** Box actifs offerts à la clientèle. */
  pension: number;
  /** Box actifs qui ne le sont pas — privés ou refacturés. */
  particuliers: number;
  /** Tous les box actifs. */
  actifs: number;
  /** Les box désactivés, qui n'accueillent rien. */
  inactifs: number;
};

export function parcBox(
  boxes: readonly { actif?: boolean | null; usage_box?: string | null }[]
): ParcBox {
  const parc: ParcBox = { pension: 0, particuliers: 0, actifs: 0, inactifs: 0 };
  for (const b of boxes) {
    if (b.actif === false) {
      parc.inactifs += 1;
      continue;
    }
    parc.actifs += 1;
    if (estBoxDePension(b.usage_box)) parc.pension += 1;
    else parc.particuliers += 1;
  }
  return parc;
}

/**
 * « 12 box de pension · 2 box particuliers ». C'est ce nombre-là qu'on regarde
 * pour dire oui ou non à une réservation.
 */
export function resumeParcBox(parc: ParcBox): string {
  const bouts = [
    `${parc.pension} box de pension`,
    parc.particuliers > 0
      ? `${parc.particuliers} box particulier${parc.particuliers > 1 ? "s" : ""}`
      : null,
    parc.inactifs > 0
      ? `${parc.inactifs} désactivé${parc.inactifs > 1 ? "s" : ""}`
      : null,
  ].filter(Boolean);
  return bouts.join(" · ");
}
