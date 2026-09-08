import Link from "next/link";
import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { aujourdhuiISO } from "@/src/lib/dates";
import { lireJournee } from "@/src/lib/journeeDonnees";
import type { LigneJournee, Rappel } from "@/src/lib/journee";
import BoutonsCheckinDashboard from "@/app/components/BoutonsCheckinDashboard";

export const dynamic = "force-dynamic";

/**
 * « Aujourd'hui » — l'écran du matin.
 *
 * Pas un tableau de chiffres : une liste d'actions, dans l'ordre de la
 * journée. Qui arrive, qui part, et ce qu'il ne faut pas oublier cette
 * semaine.
 *
 * Il est fait pour 375 px : une colonne, des cibles de 44 px, les boutons
 * d'action sur la ligne. C'est l'écran qu'on consulte sur un téléphone en
 * tenant une laisse de l'autre main.
 *
 * Le calcul est entièrement dans `src/lib/journee.ts`, qui est pur et testé :
 * la page se contente de donner la date.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.58)";
const BORDURE = "1px solid rgba(27,43,94,0.12)";
const CIBLE = 44;

const chf = (n: number) => `${n.toFixed(2)} CHF`;

function Etiquette({
  fond, texte, bord, children,
}: {
  fond: string; texte: string; bord?: string; children: React.ReactNode;
}) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 999,
      backgroundColor: fond, color: texte,
      border: bord ? `1px solid ${bord}` : "1px solid transparent",
      fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

/**
 * Un signal cliquable mène là où on le traite. Un signal qui ne mène nulle part
 * oblige à chercher l'écran soi-même, la laisse à la main.
 */
function Signal({
  href, fond, texte, bord, children,
}: {
  href: string; fond: string; texte: string; bord: string; children: React.ReactNode;
}) {
  return (
    <Link href={href} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      minHeight: CIBLE, padding: "0 14px", borderRadius: 999,
      backgroundColor: fond, color: texte, border: `1px solid ${bord}`,
      fontSize: 13.5, fontWeight: 700, textDecoration: "none",
    }}>
      {children}
    </Link>
  );
}

function Ligne({
  l, sens, peutPointer,
}: {
  l: LigneJournee; sens: "arrivee" | "depart"; peutPointer: boolean;
}) {
  const signaux = l.signaux;
  const aDesSignaux =
    signaux.colis > 0 || signaux.resteAEncaisser !== null || signaux.resultatEssai;

  return (
    <li style={{
      backgroundColor: "#FFFFFF", border: BORDURE, borderRadius: 16,
      padding: 14, display: "grid", gap: 10, minWidth: 0,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
        <span style={{
          fontSize: 19, fontWeight: 700, color: MARINE,
          fontVariantNumeric: "tabular-nums", flex: "0 0 auto",
        }}>
          {l.heure}
        </span>
        <span style={{ fontSize: 17, fontWeight: 700, color: MARINE, minWidth: 0, overflowWrap: "anywhere" }}>
          {l.chien.id ? (
            <Link href={`/chiens/${l.chien.id}`} style={{ color: MARINE, textDecoration: "none" }}>
              {l.chien.nom}
            </Link>
          ) : l.chien.nom}
        </span>
        {l.premiereFois && (
          <Etiquette fond="#F4EAC9" texte="#6E5410" bord="#C9A84C">1re fois</Etiquette>
        )}
        {l.essai && (
          <Etiquette fond="#E4E7F1" texte="#2A3B6B" bord="#C6CEE4">🧪 Journée d&apos;essai</Etiquette>
        )}
      </div>

      <p style={{ margin: 0, fontSize: 14.5, color: SOUS, minWidth: 0, overflowWrap: "anywhere" }}>
        {l.client.id ? (
          <Link href={`/clients/${l.client.id}`} style={{ color: SOUS }}>{l.client.nom}</Link>
        ) : l.client.nom}
        {l.box ? ` · ${l.box}` : " · box non attribué"}
      </p>

      {aDesSignaux && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          {signaux.colis > 0 && (
            <Signal href="/boutique/commandes-en-ligne" fond="#F4EAC9" texte="#6E5410" bord="#C9A84C">
              📦 {signaux.colis > 1 ? `${signaux.colis} commandes à remettre` : "Commande à remettre"}
            </Signal>
          )}
          {signaux.resteAEncaisser !== null && l.reservationId && (
            <Signal href={`/reservations/${l.reservationId}`} fond="#FBE2DE" texte="#A8453A" bord="#E8B5AE">
              💰 {chf(signaux.resteAEncaisser)} à encaisser
            </Signal>
          )}
          {signaux.resultatEssai && (
            <Signal href={`/chiens/${l.chien.id ?? ""}`} fond="#E4E7F1" texte="#2A3B6B" bord="#C6CEE4">
              🧪 Résultat d&apos;essai à saisir
            </Signal>
          )}
        </div>
      )}

      {peutPointer && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <BoutonsCheckinDashboard
            checkin_id={l.checkinId}
            statut={l.statut}
            type={sens}
            est_essai={l.essai}
            nom_chien={l.chien.nom}
          />
        </div>
      )}
    </li>
  );
}

function Bloc({
  titre, nombre, vide, children,
}: {
  titre: string; nombre: number; vide: string; children?: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 28, minWidth: 0 }}>
      <h2 style={{
        fontFamily: "Georgia, 'Times New Roman', serif", color: MARINE,
        fontSize: 19, fontWeight: 700, margin: "0 0 12px",
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      }}>
        {titre}
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          minWidth: 26, height: 24, padding: "0 8px", borderRadius: 999,
          backgroundColor: "#E4E7F1", color: "#2A3B6B", fontSize: 13, fontWeight: 700,
        }}>
          {nombre}
        </span>
      </h2>
      {nombre === 0 ? (
        <p style={{
          margin: 0, padding: "16px 14px", borderRadius: 16,
          backgroundColor: "#FFFFFF", border: BORDURE, color: SOUS, fontSize: 14.5,
        }}>
          {vide}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10, minWidth: 0 }}>
          {children}
        </ul>
      )}
    </section>
  );
}

function LigneRappel({ r }: { r: Rappel }) {
  return (
    <li style={{ minWidth: 0 }}>
      <Link href={r.href} style={{
        display: "flex", alignItems: "center", gap: 12, minHeight: 56,
        padding: "10px 14px", borderRadius: 16, textDecoration: "none",
        backgroundColor: "#FFFFFF", minWidth: 0,
        border: r.urgent ? "1px solid #C9A84C" : BORDURE,
      }}>
        <span style={{ minWidth: 0, flex: "1 1 auto" }}>
          <span style={{ display: "block", color: MARINE, fontWeight: 700, fontSize: 15, overflowWrap: "anywhere" }}>
            {r.libelle}
          </span>
          <span style={{ display: "block", color: r.urgent ? "#A8453A" : SOUS, fontSize: 13.5 }}>
            {r.detail}
          </span>
        </span>
        <span aria-hidden="true" style={{ color: SOUS, flex: "0 0 auto" }}>›</span>
      </Link>
    </li>
  );
}

export default async function AujourdhuiPage() {
  const acces = await exigerAccesAdmin();
  const jour = aujourdhuiISO();

  const journee = await lireJournee(jour, {
    isAdmin: acces.isAdmin,
    perm_encaissements: acces.permissions.perm_encaissements === true,
    perm_boutique_vente: acces.permissions.perm_boutique_vente === true,
  });

  const peutPointer = acces.permissions.perm_checkin === true;

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-8" style={{ backgroundColor: "#F5F0E8" }}>
      {/* Une colonne, même sur grand écran : c'est une liste qu'on descend. */}
      <div style={{ maxWidth: 720, margin: "0 auto", minWidth: 0 }}>
        <header style={{ marginBottom: 24, minWidth: 0 }}>
          <h1 style={{
            fontFamily: "Georgia, 'Times New Roman', serif", color: MARINE,
            fontSize: 28, fontWeight: 700, margin: 0, overflowWrap: "anywhere",
          }}>
            📋 Aujourd&apos;hui
          </h1>
          <p style={{ color: SOUS, fontSize: 15, margin: "6px 0 0" }}>{journee.dateEnClair}</p>
        </header>

        <Bloc titre="🐾 Arrivées" nombre={journee.arrivees.length} vide="Aucune arrivée aujourd'hui.">
          {journee.arrivees.map((l) => (
            <Ligne key={l.checkinId} l={l} sens="arrivee" peutPointer={peutPointer} />
          ))}
        </Bloc>

        <Bloc titre="🚪 Départs" nombre={journee.departs.length} vide="Aucun départ aujourd'hui.">
          {journee.departs.map((l) => (
            <Ligne key={l.checkinId} l={l} sens="depart" peutPointer={peutPointer} />
          ))}
        </Bloc>

        <Bloc titre="📌 À ne pas oublier" nombre={journee.rappels.length} vide="Rien à signaler cette semaine.">
          {journee.rappels.map((r) => <LigneRappel key={r.cle} r={r} />)}
        </Bloc>
      </div>
    </main>
  );
}
