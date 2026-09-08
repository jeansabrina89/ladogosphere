import { exigerAdminPage } from "@/src/lib/accesAdmin";
import EnTete from "@/app/components/ui/EnTete";
import { Raccourci } from "@/app/components/ui/TuileChiffre";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.58)";

/**
 * Accueil de l'espace Réglages : un sommaire, rien de plus.
 *
 * On y vient rarement, et pour une raison précise. Des tuiles chiffrées ici
 * n'appelleraient aucune décision — elles seraient décoratives.
 */
export default async function ReglagesPage() {
  await exigerAdminPage();

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto" style={{ minWidth: 0 }}>
        <EnTete
          titre="⚙️ Réglages"
          sousTitre="Ce qui se règle une fois, et ne se touche plus chaque semaine."
        />

        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", minWidth: 0 }}>
          <Raccourci
            href="/tarifs"
            titre="💰 Tarifs"
            note="Prix des séjours et des journées, cotisation de membre, délai de préparation et coordonnées de paiement."
          />
          <Raccourci
            href="/emails"
            titre="✉️ Modèles d'e-mails"
            note="Les textes envoyés aux clients, et les campagnes. Un message à une personne s'envoie depuis sa fiche."
          />
          <Raccourci
            href="/reglages/tva"
            titre="🧾 TVA"
            note="Régime d'assujettissement, méthode de décompte, taux de dette fiscale nette et taux facturés par catégorie d'articles."
          />
        </div>

        <section style={{ marginTop: 28, minWidth: 0 }}>
          <h2 style={{
            fontFamily: "Georgia, 'Times New Roman', serif", color: MARINE,
            fontSize: 18, fontWeight: 700, margin: "0 0 8px",
          }}>
            Où trouver le reste
          </h2>
          <ul style={{ margin: 0, paddingLeft: 20, color: SOUS, fontSize: 14.5, lineHeight: 1.7 }}>
            <li>
              Les <strong>paramètres généraux</strong> (cotisation, délai de préparation,
              coordonnées de paiement du bulletin QR) se saisissent dans l&apos;écran
              <strong> Tarifs</strong> : ils n&apos;ont pas d&apos;écran à eux.
            </li>
            <li>
              Les <strong>exports</strong> partent de l&apos;écran qu&apos;ils concernent —
              le grand-livre et les rapports depuis <strong>Comptabilité</strong>, les
              dépenses depuis <strong>Dépenses</strong>.
            </li>
            <li>
              Les <strong>permissions</strong> d&apos;une employée se règlent sur sa fiche,
              dans l&apos;espace <strong>Équipe</strong>.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
