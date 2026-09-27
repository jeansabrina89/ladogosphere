import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/src/lib/supabase-admin";

/**
 * Les limites de tentatives de notre côté (C-13, APP 29).
 *
 * ── CE QUI EST COUVERT, ET CE QUI NE L'EST PAS ────────────────────────────
 *
 * Supabase Auth limite déjà la connexion, l'inscription et la réinitialisation du
 * mot de passe. Ces limites se règlent dans le tableau de bord (Authentication →
 * Rate Limits) et ne sont pas de notre ressort : ce module ne les double pas.
 *
 * Il couvre ce qui passe par NOTRE code et déclenche un envoi d'e-mail — c'est-à-
 * dire ce que personne d'autre ne plafonne.
 *
 * ── UN SEUL GESTE Y FIGURE, ET C'EST LE RÉSULTAT DE L'INVENTAIRE ──────────
 *
 * Le brief en visait trois. En les regardant un par un, deux étaient déjà
 * couverts — voir le commentaire de `LIMITES` ci-dessous, qui dit lesquels et
 * par quoi. Il ne restait que l'e-mail « Vous avez déjà un compte », qui est
 * aussi le seul joignable sans être connecté.
 *
 * Le seuil a été décidé par Sabrina le 27.09.2026.
 */

/** Les gestes plafonnés, avec leur seuil et leur fenêtre. */
export const LIMITES = {
  /**
   * L'e-mail « Vous avez déjà un compte » (lot 28).
   *
   * UNE par heure et par adresse. C'est le seul envoi joignable sans être
   * connecté, vers une adresse arbitraire : sans plafond, on se sert de notre
   * domaine pour harceler une boîte, et notre réputation d'expéditeur en paie le
   * prix — donc, à terme, tous nos e-mails.
   *
   * Une seule suffit : le message est toujours le même. En envoyer deux dans
   * l'heure n'apprend rien de plus à la personne qui relève la boîte.
   */
  email_compte_existe: { plafond: 1, fenetreMinutes: 60, plafondIp: 5 },

  /*
   * ── CE QUI N'EST PAS ICI, ET POURQUOI ─────────────────────────────────
   *
   * `email_test` n'y figure PAS : les envois d'essai des réglages étaient déjà
   * plafonnés avant ce lot, et mieux que ce module ne l'aurait fait.
   * `refusGardeFou` (src/lib/emailsDeTest.ts) compte les lignes `test:%`
   * d'`emails_envoyes` sur une fenêtre glissante de dix minutes, et refuse
   * au-delà de trente — un plafond GLOBAL, donc plus protecteur pour le quota
   * Resend qu'un plafond par adresse, puisqu'il ne se contourne pas en changeant
   * de destinataire.
   *
   * Le doubler l'aurait resserré sans le vouloir : trente par heure au lieu de
   * trente par dix minutes. Une limite ajoutée sans regarder celle qui existe
   * gêne le travail au lieu de le protéger.
   *
   * Les relances de paiement n'y figurent pas non plus : elles sont derrière
   * `perm_factures` et déclenchées à la main, un envoi par facture. Ce n'est pas
   * un geste qu'on répète en rafale.
   */
} as const;

export type GesteLimite = keyof typeof LIMITES;

/**
 * La tentative est-elle autorisée ?
 *
 * ── DEUX CLÉS, ET IL FAUT LES DEUX ────────────────────────────────────────
 *
 * Par ADRESSE : empêche de harceler UNE boîte. Par IP : empêche d'en harceler
 * mille, une fois chacune — ce que le plafond par adresse laisserait passer sans
 * broncher.
 *
 * ── CE QU'ELLE REND, ET CE QU'ELLE NE DIT PAS ─────────────────────────────
 *
 * Un booléen, et rien de plus. Pas le nombre de tentatives restantes : le dire
 * serait dire ce qui s'est passé sur une adresse qui n'est pas celle de
 * l'appelant, et rouvrir C-05 par la porte de derrière.
 *
 * ── EN CAS DE PANNE, ELLE LAISSE PASSER ───────────────────────────────────
 *
 * Si la base ne répond pas, la tentative est autorisée. C'est un choix, et il se
 * discute : refuser serait « fermer par défaut », ce qui est la règle habituelle.
 * Mais ici, refuser rendrait l'inscription muette ET inopérante à la première
 * hoquet de la base — alors que ce qu'on protège est un envoi d'e-mail, pas un
 * accès à des données. Le déni de service coûterait plus que l'abus qu'on évite.
 * L'échec est journalisé.
 */
export async function tentativeAutorisee(
  geste: GesteLimite,
  cles: { email?: string | null; ip?: string | null },
): Promise<boolean> {
  const limite = LIMITES[geste];

  try {
    // L'adresse d'abord : c'est la clé qui protège une personne nommée.
    if (cles.email) {
      const { data } = await supabaseAdmin.rpc("tentative_autorisee", {
        p_geste: geste,
        p_cle: cles.email,
        p_genre: "email",
        p_plafond: limite.plafond,
        p_fenetre_minutes: limite.fenetreMinutes,
      });
      if (data === false) return false;
    }

    /*
     * Puis l'IP. Comptée MÊME si l'adresse a été refusée ? Non : on rend `false`
     * avant. Une tentative refusée sur l'adresse n'a pas besoin d'être imputée
     * deux fois, et la compter gonflerait le compteur d'IP d'un visiteur qui
     * s'obstine sur une seule boîte.
     */
    if (cles.ip) {
      const { data } = await supabaseAdmin.rpc("tentative_autorisee", {
        p_geste: geste,
        p_cle: cles.ip,
        p_genre: "ip",
        p_plafond: limite.plafondIp,
        p_fenetre_minutes: limite.fenetreMinutes,
      });
      if (data === false) return false;
    }

    return true;
  } catch (err) {
    Sentry.captureException(err);
    console.error("tentativeAutorisee:", geste, err);
    return true;
  }
}

/**
 * L'adresse IP de l'appelant, telle que Vercel la transmet.
 *
 * `x-forwarded-for` peut porter une liste (client, puis relais) : c'est la
 * PREMIÈRE qui est celle du client. Elle est falsifiable par un client qui
 * parlerait directement à notre serveur — derrière Vercel, l'en-tête est réécrit,
 * donc elle fait foi ici. Le plafond par adresse, lui, ne dépend pas de l'IP :
 * c'est pour cela qu'il y en a deux.
 */
export function ipDeLaRequete(entetes: Headers): string | null {
  const brut = entetes.get("x-forwarded-for") ?? entetes.get("x-real-ip") ?? "";
  const premiere = brut.split(",")[0]?.trim() ?? "";
  return premiere.length > 0 ? premiere : null;
}
