import { lireEtat, seDesinscrire, seReabonner } from "./actions";

// Désinscription des e-mails d'information, sans connexion.
//
// Le lien de l'e-mail n'agit pas de lui-même : il ouvre cette page, et un
// second clic confirme. C'est ce qui évite qu'un antivirus ou un aperçu de lien
// désinscrive quelqu'un à son insu.

const MARINE = "#1B2B5E";
const SABLE = "#F5F0E8";

export const dynamic = "force-dynamic";

export default async function DesinscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const etat = await lireEtat(t);

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

        {etat === "inconnu" && (
          <>
            <h1 className="text-2xl font-bold mb-3" style={{ color: MARINE }}>
              Ce lien n&apos;est plus valable
            </h1>
            <p className="text-sm" style={{ color: "rgba(27,43,94,0.65)", lineHeight: 1.7 }}>
              Vous pouvez gérer vos préférences depuis votre espace client, rubrique
              «&nbsp;Mon profil&nbsp;».
            </p>
          </>
        )}

        {etat === "abonne" && (
          <>
            <h1 className="text-2xl font-bold mb-3" style={{ color: MARINE }}>
              Se désinscrire des informations
            </h1>
            <p className="text-sm mb-6" style={{ color: "rgba(27,43,94,0.65)", lineHeight: 1.7 }}>
              Vous ne recevrez plus nos informations aux membres. Les e-mails liés à vos
              réservations, à vos factures et à votre adhésion continueront de vous être envoyés.
            </p>
            <form action={seDesinscrire}>
              <input type="hidden" name="t" value={t ?? ""} />
              <button
                type="submit"
                className="w-full py-3 rounded-xl font-semibold text-white"
                style={{ backgroundColor: MARINE }}
              >
                Confirmer la désinscription
              </button>
            </form>
          </>
        )}

        {etat === "desabonne" && (
          <>
            <h1 className="text-2xl font-bold mb-3" style={{ color: MARINE }}>
              C&apos;est fait.
            </h1>
            <p className="text-sm mb-6" style={{ color: "rgba(27,43,94,0.65)", lineHeight: 1.7 }}>
              Vous ne recevrez plus nos informations aux membres. Vous continuerez à recevoir
              les e-mails liés à vos réservations et à vos factures.
            </p>
            <form action={seReabonner}>
              <input type="hidden" name="t" value={t ?? ""} />
              <button
                type="submit"
                className="w-full py-3 rounded-xl font-semibold"
                style={{ backgroundColor: "#EDE8DF", color: MARINE }}
              >
                Me réabonner
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
