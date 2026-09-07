import Link from "next/link";

/**
 * Le signal qui empêche de rendre le chien en oubliant le colis.
 *
 * Volontairement voyant, et volontairement cliquable : on doit le voir sans
 * le chercher, et pouvoir aller à la commande sans quitter l'écran des yeux
 * plus de deux secondes. Il ne s'affiche que s'il y a vraiment quelque chose
 * à remettre — un badge qui crie tout le temps ne veut plus rien dire.
 */
export default function BadgeCommandeARemettre({
  nombre,
  taille = "normale",
}: {
  nombre: number;
  taille?: "normale" | "petite";
}) {
  if (nombre <= 0) return null;

  const petite = taille === "petite";

  return (
    <Link
      href="/boutique/commandes-en-ligne"
      title={`${nombre} commande${nombre > 1 ? "s" : ""} de boutique à remettre à ce client`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: petite ? 28 : 32,
        padding: petite ? "2px 10px" : "4px 12px",
        borderRadius: 999,
        backgroundColor: "#F4EAC9",
        border: "1px solid #C9A84C",
        color: "#6E5410",
        fontSize: petite ? 12 : 14,
        fontWeight: 700,
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
    >
      📦 {nombre > 1 ? `${nombre} commandes à remettre` : "Commande à remettre"}
    </Link>
  );
}
