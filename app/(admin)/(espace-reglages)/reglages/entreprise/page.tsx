import { exigerAdminPage } from "@/src/lib/accesAdmin";
import EnTete from "@/app/components/ui/EnTete";
import { aujourdhuiISO } from "@/src/lib/dates";
import { entiteCourante, historiqueEntites } from "@/src/lib/entiteJuridique";
import { manquantsEntite } from "@/src/lib/entiteJuridiqueLogique";
import FormEntreprise from "./FormEntreprise";

export const dynamic = "force-dynamic";

const SOUS = "rgba(27,43,94,0.6)";

/**
 * Réglages → Entreprise : l'identité juridique et son historique.
 *
 * CE QUE CET ÉCRAN FAIT : il prépare le jour où les DOCUMENTS changeront
 * d'identité. Une facture émise après la date d'effet portera la nouvelle
 * raison sociale, son IDE et son IBAN ; une facture émise avant gardera
 * l'ancienne, pour toujours.
 *
 * CE QU'IL NE FAIT PAS, ET QU'IL NE FAUT PAS CROIRE RÉGLÉ : le passage
 * comptable lui-même. Clôture de l'ancienne entité, bilan d'ouverture de la
 * nouvelle, transfert des débiteurs, des stocks, des adhésions et des
 * abonnements encaissés d'avance — rien de tout cela n'est ici. C'est le sujet
 * d'APP 19 (clôture). Préparer le changement ici ne dispense d'aucune de ces
 * opérations, et ne les déclenche pas.
 */
export default async function EntreprisePage() {
  await exigerAdminPage();

  const [courante, historique] = await Promise.all([
    entiteCourante(),
    historiqueEntites(),
  ]);

  const jour = aujourdhuiISO();
  const futures = historique.filter((h) => h.dateDebut > jour);
  const prochainPremierJanvier = `${Number(jour.slice(0, 4)) + 1}-01-01`;

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", minWidth: 0 }}>
        <EnTete
          titre="🏛️ Entreprise"
          sousTitre="Raison sociale, forme, IDE, TVA et IBAN — datés, et repris tels quels sur chaque pièce."
        />

        <p style={{
          background: "#E4E7F0", color: "#1B2B5E", borderRadius: 14,
          padding: "10px 12px", fontSize: 13, margin: "0 0 16px",
        }}>
          Cet écran prépare le changement d&apos;<strong>identité des documents</strong> à la
          bonne date. Le <strong>passage comptable</strong> — clôture, bilan d&apos;ouverture,
          transfert des débiteurs, des stocks et des encaissements d&apos;avance — ne s&apos;y
          fait pas et reste entièrement à faire.
        </p>

        <FormEntreprise
          courante={courante}
          historique={historique}
          futures={futures}
          prochainPremierJanvier={prochainPremierJanvier}
          manquants={courante ? manquantsEntite(courante) : []}
        />

        <p style={{ color: SOUS, fontSize: 12, marginTop: 20 }}>
          Une pièce émise garde l&apos;identité de sa date d&apos;émission, pour toujours. Un avoir
          émis en février sur une facture de novembre porte donc l&apos;entité de février, et
          mentionne la facture d&apos;origine avec son numéro — c&apos;est le cas normal après un
          changement d&apos;entité.
        </p>
      </div>
    </main>
  );
}
