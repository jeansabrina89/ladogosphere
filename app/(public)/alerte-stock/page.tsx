import { lireAlerte } from "./actions";
import BoutonRetrait from "./BoutonRetrait";

/**
 * « Ne plus être prévenu pour cet article. »
 *
 * Accessible depuis l'e-mail, donc sans session. Comme la désinscription des
 * informations, le lien n'agit pas seul : il ouvre cette page, et un second
 * clic confirme.
 *
 * Ce jeton ne gouverne QUE cette alerte. Les préférences générales du client
 * (`emails_info_ok`) ne sont ni lues ni touchées ici — la page le dit.
 */

const MARINE = "#1B2B5E";
const SABLE = "#F5F0E8";

export const dynamic = "force-dynamic";

export default async function DesinscriptionAlertePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const etat = await lireAlerte(t);

  return (
    <main
      className="min-h-screen flex items-center justify-center p-8"
      style={{ backgroundColor: SABLE }}
    >
      <div className="max-w-md w-full bg-white rounded-2xl p-8 shadow-lg text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-compact.webp"
          alt="La Dogosphère"
          className="h-20 w-20 rounded-full object-cover mx-auto mb-5"
        />

        {etat.etat === "inconnu" && (
          <>
            <h1 className="text-2xl font-bold mb-3" style={{ color: MARINE }}>
              Ce lien n&apos;est plus valable
            </h1>
            <p className="text-sm" style={{ color: "rgba(27,43,94,0.65)", lineHeight: 1.7 }}>
              Cette alerte a peut-être déjà été retirée. Vous ne recevrez rien d&apos;autre
              à ce sujet.
            </p>
          </>
        )}

        {etat.etat === "trouvee" && (
          <>
            <h1 className="text-2xl font-bold mb-3" style={{ color: MARINE }}>
              Ne plus être prévenu ?
            </h1>
            <p className="text-sm mb-5" style={{ color: "rgba(27,43,94,0.65)", lineHeight: 1.7 }}>
              Vous avez demandé à être prévenu du retour de
              «&nbsp;<strong style={{ color: MARINE }}>{etat.article}</strong>&nbsp;».
              Se retirer n&apos;annule que cette attente-là : vos autres e-mails et vos
              préférences ne changent pas.
            </p>
            <BoutonRetrait token={t ?? ""} />
          </>
        )}

        {etat.etat === "retiree" && (
          <>
            <h1 className="text-2xl font-bold mb-3" style={{ color: MARINE }}>
              C&apos;est fait
            </h1>
            <p className="text-sm" style={{ color: "rgba(27,43,94,0.65)", lineHeight: 1.7 }}>
              Vous ne serez plus prévenu du retour de
              «&nbsp;<strong style={{ color: MARINE }}>{etat.article}</strong>&nbsp;».
              Vos autres e-mails et vos préférences n&apos;ont pas changé.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
