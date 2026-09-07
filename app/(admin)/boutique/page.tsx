import Link from "next/link";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { lireChiffresBoutique } from "@/src/lib/boutique";
import { aujourdhuiISO, formatDateFR } from "@/src/lib/dates";
import { debutDuMois } from "@/src/lib/tableauBoutique";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.12)";

const chf = (n: number) => `${n.toFixed(2)} CHF`;

/**
 * Tuile du tableau de bord : un chiffre qui décide d'une action, et le chemin
 * vers l'écran où l'on agit. Une tuile qui ne mène nulle part n'en est pas une.
 */
function Tuile({
  href,
  titre,
  valeur,
  detail,
  couleur = MARINE,
  fond = "#FFFFFF",
  alerte = false,
}: {
  href: string;
  titre: string;
  valeur: string;
  detail?: string;
  couleur?: string;
  fond?: string;
  alerte?: boolean;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{
        backgroundColor: fond,
        border: alerte ? "2px solid #C9A84C" : BORDURE,
        borderRadius: 18, padding: 20, minHeight: 118,
        display: "flex", flexDirection: "column", justifyContent: "center",
      }}>
        <p style={{ color: SOUS, fontSize: 13, margin: 0 }}>{titre}</p>
        <p style={{ color: couleur, fontSize: 26, fontWeight: 700, margin: "6px 0 0", lineHeight: 1.1 }}>
          {valeur}
        </p>
        {detail && (
          <p style={{ color: SOUS, fontSize: 13, margin: "4px 0 0" }}>{detail}</p>
        )}
      </div>
    </Link>
  );
}

/** Emplacement d'une tuile à venir : elle dit ce qu'elle attend, et de qui. */
function TuileAVenir({ titre, note }: { titre: string; note: string }) {
  return (
    <div style={{
      backgroundColor: "#FBF9F5", border: "1px dashed rgba(27,43,94,0.22)",
      borderRadius: 18, padding: 20, minHeight: 118,
      display: "flex", flexDirection: "column", justifyContent: "center",
    }}>
      <p style={{ color: SOUS, fontSize: 13, margin: 0 }}>{titre}</p>
      <p style={{ color: "rgba(27,43,94,0.35)", fontSize: 26, fontWeight: 700, margin: "6px 0 0", lineHeight: 1.1 }}>
        —
      </p>
      <p style={{ color: SOUS, fontSize: 13, margin: "4px 0 0" }}>{note}</p>
    </div>
  );
}

export default async function BoutiquePage() {
  const acces = await exigerAccesAdmin("perm_boutique");

  const jour = aujourdhuiISO();
  const c = await lireChiffresBoutique(jour);

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">
        <EnTete
          titre="🛍️ Boutique"
          sousTitre={`Le magasin au ${formatDateFR(jour)}`}
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href="/boutique/caisse" variante="principal">💳 Ouvrir la caisse</Bouton>
              <Bouton href="/boutique/articles/nouveau" variante="secondaire">+ Article</Bouton>
            </div>
          }
        />

        <section aria-label="Les chiffres du jour" className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>

          <Tuile
            href="/boutique/ventes"
            titre="Ventes du jour"
            valeur={chf(c.ventesJourTotal)}
            detail={`${c.ventesJourNombre} vente${c.ventesJourNombre > 1 ? "s" : ""} encaissée${c.ventesJourNombre > 1 ? "s" : ""}`}
          />

          <Tuile
            href={`/boutique/ventes?du=${debutDuMois(jour)}&au=${jour}`}
            titre="Ventes du mois"
            valeur={chf(c.ventesMoisTotal)}
            detail={`Depuis le ${formatDateFR(debutDuMois(jour))}`}
          />

          <Tuile
            href="/boutique/ventes?mode=especes"
            titre="Espèces encaissées aujourd'hui"
            valeur={chf(c.especesJour)}
            detail="À retrouver dans la caisse ce soir"
          />

          <Tuile
            href="/boutique/articles?seuil=1"
            titre="Articles sous le seuil"
            valeur={String(c.sousLeSeuil)}
            detail={c.sousLeSeuil > 0 ? "À recommander" : "Rien à recommander"}
            couleur={c.sousLeSeuil > 0 ? "#A8453A" : "#1F6E5B"}
            alerte={c.sousLeSeuil > 0}
          />

          <Tuile
            href="/boutique/commandes"
            titre="Commandes sur mesure à faire"
            valeur={String(c.commandesAFaire)}
            detail={
              c.commandesEnRetard > 0
                ? `${c.commandesEnRetard} en retard`
                : "Aucune en retard"
            }
            couleur={c.commandesEnRetard > 0 ? "#A8453A" : MARINE}
            alerte={c.commandesEnRetard > 0}
          />

          <Tuile
            href="/boutique/inventaire/recapitulatif"
            titre="Valeur du stock au prix d'achat"
            valeur={chf(c.valeurStock)}
            detail={`${c.articlesActifs} article${c.articlesActifs > 1 ? "s" : ""} en rayon`}
          />

          {/* Deux places tenues au chaud pour la vente en ligne (APP 13). */}
          <TuileAVenir titre="Commandes en ligne à traiter" note="Avec la vente en ligne (APP 13)" />
          <TuileAVenir titre="Ventes en ligne du mois" note="Avec la vente en ligne (APP 13)" />
        </section>

        <section style={{ marginTop: 28 }}>
          <h2 style={{
            fontFamily: "Georgia, 'Times New Roman', serif", color: MARINE,
            fontSize: 18, fontWeight: 700, margin: "0 0 12px",
          }}>
            Le reste du magasin
          </h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <Raccourci href="/boutique/articles" titre="🛒 Articles" note="Catalogue, prix et stock" />
            <Raccourci href="/boutique/inventaire" titre="📦 Inventaire" note="Comptage et écarts" />
            <Raccourci href="/comptabilite/fournisseurs" titre="🏢 Fournisseurs"
              note={acces.permissions.perm_depenses
                ? "Carnet partagé avec les dépenses"
                : "Demande la permission « Dépenses »"} />
          </div>
        </section>
      </div>
    </main>
  );
}

function Raccourci({ href, titre, note }: { href: string; titre: string; note: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{
        backgroundColor: "#FFFFFF", border: BORDURE, borderRadius: 16,
        padding: 16, minHeight: 76,
      }}>
        <p style={{ color: MARINE, fontSize: 16, fontWeight: 700, margin: 0 }}>{titre}</p>
        <p style={{ color: SOUS, fontSize: 13, margin: "4px 0 0" }}>{note}</p>
      </div>
    </Link>
  );
}
