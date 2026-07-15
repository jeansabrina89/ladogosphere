// Couleurs fixes par personne au planning (evite de confondre les employes).
// Attribution par prenom (insensible aux accents/casse) ; repli neutre pour le reste.
export type CouleurEmploye = { bg: string; fg: string };

const PAR_PRENOM: Record<string, CouleurEmploye> = {
  sabrina: { bg: "#FADEDA", fg: "#B84A3E" }, // rose
  adeline: { bg: "#DDEFD6", fg: "#3F8F3A" }, // vert
  francine: { bg: "#EAE1F5", fg: "#6B45A6" }, // violet
  eloise: { bg: "#CFF0EA", fg: "#12897C" }, // turquoise
  kevin: { bg: "#D9E5F8", fg: "#2554A0" }, // bleu
};

// Repli pour toute personne non listee (couleurs neutres, distinctes des 5 ci-dessus).
const REPLI: CouleurEmploye[] = [
  { bg: "#F4EAC9", fg: "#6E5410" }, // ocre
  { bg: "#E5DAD0", fg: "#5B4B3A" }, // taupe
  { bg: "#DDE3EC", fg: "#3B4A63" }, // ardoise
  { bg: "#FDE8D0", fg: "#9A5B12" }, // orange doux
  { bg: "#F0DCEC", fg: "#8A3D77" }, // magenta doux
];

const normaliser = (s: string) =>
  (s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036F]/g, "");

export function couleurEmploye(prenom: string, index = 0): CouleurEmploye {
  return PAR_PRENOM[normaliser(prenom)] ?? REPLI[index % REPLI.length];
}
