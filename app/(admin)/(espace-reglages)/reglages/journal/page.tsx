import Link from "next/link";
import { exigerAdminPage } from "@/src/lib/accesAdmin";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import { lireJournal, auteursDuJournal } from "@/src/lib/journalGestes";
import {
  PAR_PAGE,
  filtresDepuisParams,
  nombreDePages,
  versParamsJournal,
} from "@/src/lib/journalGestesLogique";
import FiltresJournalGestes from "./FiltresJournalGestes";
import LigneJournalGeste from "./LigneJournalGeste";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.58)";

/**
 * Le journal des gestes — qui a fait quoi, et quand.
 *
 * ── LECTURE SEULE, ET RIEN D'AUTRE ────────────────────────────────────────
 *
 * Cet écran n'a aucune action serveur, aucun formulaire de modification, aucun
 * bouton qui écrive. Ce n'est pas seulement une retenue d'écran : la base
 * refuse UPDATE, DELETE et TRUNCATE sur cette table par deux triggers, la clé
 * de service comprise. Une trace ne se corrige pas — une erreur se corrige par
 * un NOUVEAU geste, lui-même tracé.
 *
 * ── RÉSERVÉ À LA PATRONNE ─────────────────────────────────────────────────
 *
 * `exigerAdminPage()` — la même garde que les quatre autres écrans de cet
 * espace (Boutique, TVA, Entreprise, Remise membre). Un employé n'y entre pas,
 * et l'espace client ne l'importe jamais : ce journal dit qui a fait quoi, et
 * cela ne regarde que celle qui répond du tout.
 */
export default async function JournalGestesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigerAdminPage();

  const filtres = filtresDepuisParams(await searchParams);
  const [{ lignes, total }, personnes] = await Promise.all([
    lireJournal(filtres),
    auteursDuJournal(),
  ]);

  const pages = nombreDePages(total);
  const premier = total === 0 ? 0 : (filtres.page - 1) * PAR_PAGE + 1;
  const dernier = Math.min(filtres.page * PAR_PAGE, total);

  const adresse = (page: number) => {
    const qs = versParamsJournal({ ...filtres, page }).toString();
    return qs ? `/reglages/journal?${qs}` : "/reglages/journal";
  };

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto" style={{ minWidth: 0 }}>
        <EnTete
          titre="📓 Journal des gestes"
          sousTitre="Qui a fait quoi, et quand. Lecture seule : une trace ne se corrige jamais."
          action={<Bouton href="/reglages" variante="secondaire">← Réglages</Bouton>}
        />

        <FiltresJournalGestes personnes={personnes} />

        {total === 0 ? (
          <EtatVide
            icone="📓"
            titre="Aucun geste ne correspond"
            message="Élargissez la période, ou retirez un filtre."
          />
        ) : (
          <>
            <p style={{ color: SOUS, fontSize: 14, margin: "0 0 8px" }}>
              {premier} à {dernier} sur {total} geste{total > 1 ? "s" : ""}
            </p>

            <ul style={{ listStyle: "none", margin: 0, padding: 0, minWidth: 0 }}>
              {lignes.map((l) => <LigneJournalGeste key={l.id} ligne={l} />)}
            </ul>

            {/*
              * La pagination, sobre : deux liens et un compteur.
              *
              * Elle est côté SERVEUR — `range()` en base — parce que cette table
              * ne se vide jamais. Tout charger marcherait ce mois-ci et ferait
              * tomber l'écran dans deux ans, au moment où l'on en aurait besoin.
              */}
            {pages > 1 && (
              <nav
                aria-label="Pages du journal"
                style={{
                  display: "flex", gap: 12, alignItems: "center",
                  justifyContent: "center", marginTop: 20, flexWrap: "wrap",
                }}
              >
                {filtres.page > 1 ? (
                  <Link href={adresse(filtres.page - 1)} style={{ color: "#1F6E5B", fontWeight: 600 }}>
                    ← Plus récents
                  </Link>
                ) : (
                  <span style={{ color: SOUS }}>← Plus récents</span>
                )}
                <span style={{ color: MARINE, fontSize: 14, fontWeight: 600 }}>
                  Page {filtres.page} sur {pages}
                </span>
                {filtres.page < pages ? (
                  <Link href={adresse(filtres.page + 1)} style={{ color: "#1F6E5B", fontWeight: 600 }}>
                    Plus anciens →
                  </Link>
                ) : (
                  <span style={{ color: SOUS }}>Plus anciens →</span>
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </main>
  );
}
