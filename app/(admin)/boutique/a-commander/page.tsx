import Link from "next/link";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { lignesACommander } from "@/src/lib/aCommander";
import { formatDateFR } from "@/src/lib/dates";
import EnTete from "@/app/components/ui/EnTete";
import EtatVide from "@/app/components/ui/EtatVide";
import GroupeACommander, { type GroupeAffiche } from "./GroupeACommander";

export const dynamic = "force-dynamic";

const SOUS = "rgba(27,43,94,0.55)";

/**
 * Ce qu'il faut commander chez les fournisseurs.
 *
 * Des clientes ont payé des articles que la pension n'avait pas. Cet écran est
 * le seul endroit d'où part la commande, et le seul qui date le geste — dans
 * trois semaines, quand l'une d'elles demandera où en est sa commande, la
 * réponse ne doit pas dépendre du souvenir de quelqu'un.
 *
 * Groupé par fournisseur, parce que c'est ainsi qu'on commande : un appel, une
 * liste, un fournisseur. Et dans chaque groupe, du plus ancien au plus récent :
 * la première qui a commandé est la première servie, comme à la réception.
 */
export default async function ACommanderPage() {
  await exigerAccesAdmin("perm_boutique_gestion");

  const groupes = await lignesACommander();
  const total = groupes.reduce((s, g) => s + g.lignes.length, 0);

  // Les dates sont formatées ICI : une fonction ne traverse pas la frontière
  // serveur/client, et le fuseau du navigateur ne doit pas décaler une date.
  const affiches: GroupeAffiche[] = groupes.map((g) => ({
    ...g,
    lignes: g.lignes.map((l) => ({
      ...l,
      confirmeeLeTexte: l.confirmeeLe ? formatDateFR(l.confirmeeLe) : "—",
    })),
  }));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <EnTete
        titre="À commander chez les fournisseurs"
        sousTitre={
          total === 0
            ? "Rien n'attend."
            : `${total} ligne${total > 1 ? "s" : ""} attend${total > 1 ? "ent" : ""} une commande.`
        }
      />

      {total > 0 && (
        <p style={{ margin: 0, fontSize: 14, color: SOUS, maxWidth: 680 }}>
          La quantité affichée est celle de la <strong>ligne entière</strong>, et non
          ce qui manque en rayon. Commander toute la ligne est ce qui garantit que
          la cliente sera servie, même si l&apos;article encore présent part au
          comptoir entre-temps.
        </p>
      )}

      {total === 0 ? (
        <EtatVide
          icone="📥"
          titre="Aucune commande en attente"
          message="Les articles « disponibles sur commande » apparaîtront ici dès qu'une cliente en achètera un qui n'est pas en rayon."
        />
      ) : (
        affiches.map((g) => (
          <GroupeACommander key={g.fournisseurId ?? "sans"} groupe={g} />
        ))
      )}

      <p style={{ margin: 0, fontSize: 13.5, color: SOUS }}>
        À la livraison, passez par l&apos;entrée de stock habituelle : la marchandise
        reçue est réservée pour ces commandes dans le même geste.{" "}
        <Link href="/boutique/articles" style={{ color: "#1F6E5B", fontWeight: 600 }}>
          Voir les articles
        </Link>
      </p>
    </div>
  );
}
