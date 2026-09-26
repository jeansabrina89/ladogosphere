import { NextRequest, NextResponse } from "next/server";
import { lireCorpsJson } from "@/src/lib/corpsRequete";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerAdminApi } from "@/src/lib/permissions";
import { getCoordonneesPaiement } from "@/src/lib/coordonneesPaiement";
import { lirePdfFacture } from "@/src/lib/factureDocument";
import { urlPhotoArticle } from "@/src/lib/boutiqueLogique";
import {
  PREFIXE_TEST,
  clesRetenues,
  debutFenetre,
  donneesExemple,
  refusGardeFou,
} from "@/src/lib/emailsDeTest";
import {
  envoyerEmailsDeTest,
  type ContexteEnvoiTest,
  type FonctionsEnvoi,
} from "@/src/lib/emailsDeTestEnvoi";
import * as email from "@/src/lib/email";

/**
 * Envoi d'e-mails de test vers une adresse choisie.
 *
 * La route ne fait que LIRE : elle rassemble de quoi rendre les messages
 * réalistes (le PDF déjà déposé d'une facture, le jeton de désinscription de la
 * fiche de test, un article encore en stock), puis appelle les mêmes fonctions
 * d'envoi que la production. La seule écriture est celle d'`emails_envoyes`,
 * faite par `envoyerEmail` comme pour n'importe quel message.
 *
 * Rien n'est généré, marqué ni daté au passage : pas de PDF fabriqué (cela
 * poserait `pdf_path` sur la facture), pas de `notifie_le` sur une alerte de
 * stock, pas de statut de commande, pas de ligne d'`emails_campagnes`.
 */

/** Fiche client de test de Sabrina : ses pièces sont réelles et réversibles. */
const FICHE_DE_TEST = "7a820aa4-ff87-4261-bf66-072ec2f404c8";

async function rassemblerContexte(destinataire: string): Promise<ContexteEnvoiTest> {
  const maintenant = new Date();
  const donnees = donneesExemple(maintenant);

  const [{ data: fiche }, coordonnees, { data: factures }, { data: commande }, { data: article }] =
    await Promise.all([
      supabaseAdmin
        .from("clients")
        .select("desinscription_token")
        .eq("id", FICHE_DE_TEST)
        .maybeSingle(),
      getCoordonneesPaiement(supabaseAdmin),
      supabaseAdmin
        .from("factures")
        .select("id, numero, date_facture, date_echeance, montant_total")
        .eq("client_id", FICHE_DE_TEST)
        .not("numero", "is", null)
        .order("date_facture", { ascending: false, nullsFirst: false })
        .limit(1),
      supabaseAdmin
        .from("commandes")
        .select("id")
        .eq("client_id", FICHE_DE_TEST)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Un article publié qu'il reste en stock : celui avec une photo d'abord,
      // pour que le test montre aussi l'illustration.
      supabaseAdmin
        .from("articles")
        .select("id, nom, prix_vente, photo_path")
        .eq("statut_vitrine", "publie")
        .gt("stock_actuel", 0)
        .order("photo_path", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const derniere = (factures ?? [])[0] as
    | { id: string; numero: string; date_facture: string | null; date_echeance: string | null; montant_total: number | string }
    | undefined;

  // `telechargerPdf` LIT le bucket. On n'appelle jamais `genererPdfFacture` :
  // il déposerait un fichier et écrirait `pdf_path` sur la facture.
  // Un apercu se contente des octets ou de rien : qu il n y ait jamais eu de
  // document ou qu il soit perdu ne change pas ce qu on affiche. L indifference
  // est voulue — la perte, elle, est tracee par lirePdfFacture.
  const lecture = derniere ? await lirePdfFacture(derniere.id) : { etat: "aucun_chemin" as const };
  const pdf = lecture.etat === "present" ? lecture.octets : null;

  return {
    destinataire,
    donnees,
    iban: coordonnees.iban,
    titulaire: coordonnees.titulaire,
    tokenDesinscription: (fiche?.desinscription_token as string | null) ?? null,
    facture: derniere
      ? {
          numero: derniere.numero,
          date: derniere.date_facture ?? donnees.dateFacture,
          echeance: derniere.date_echeance ?? donnees.echeance,
          montant: Number(derniere.montant_total) || 0,
          pdf,
        }
      : null,
    commandeId: (commande?.id as string | null) ?? null,
    article: article
      ? {
          id: article.id as string,
          nom: article.nom as string,
          prix: Number(article.prix_vente) || 0,
          photoUrl: urlPhotoArticle(article.photo_path as string | null),
        }
      : null,
  };
}

/** Les fonctions d'envoi réelles, telles quelles. */
const ENVOIS: FonctionsEnvoi = {
  envoyerMessageLibre: email.envoyerMessageLibre,
  envoyerEmailConfirmationDemande: email.envoyerEmailConfirmationDemande,
  envoyerEmailReservationValidee: email.envoyerEmailReservationValidee,
  envoyerEmailReservationAnnulee: email.envoyerEmailReservationAnnulee,
  envoyerEmailReservationRefusee: email.envoyerEmailReservationRefusee,
  envoyerEmailPaiement: email.envoyerEmailPaiement,
  envoyerEmailRelancePaiement: email.envoyerEmailRelancePaiement,
  envoyerEmailSatisfactionEssai: email.envoyerEmailSatisfactionEssai,
  envoyerEmailResultatEssai: email.envoyerEmailResultatEssai,
  envoyerEmailRappelVeille: email.envoyerEmailRappelVeille,
  envoyerEmailRappelCotisation: email.envoyerEmailRappelCotisation,
  envoyerEmailFactureEmise: email.envoyerEmailFactureEmise,
  envoyerEmailTicketBoutique: email.envoyerEmailTicketBoutique,
  envoyerEmailCommandePrete: email.envoyerEmailCommandePrete,
  envoyerEmailCommandeConfirmee: email.envoyerEmailCommandeConfirmee,
  envoyerEmailCommandeExpediee: email.envoyerEmailCommandeExpediee,
  envoyerEmailCompteExisteDeja: email.envoyerEmailCompteExisteDeja,
  envoyerEmailRetourEnStock: email.envoyerEmailRetourEnStock,
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const refusAcces = await exigerAdminApi(supabase);
  if (refusAcces) return refusAcces;

  const lecture = await lireCorpsJson(req);
  if (!lecture.ok) return lecture.reponse;

  const destinataire = String(lecture.corps?.destinataire ?? "").trim();
  const cles = clesRetenues(lecture.corps?.types);

  const maintenant = new Date();
  const { count } = await supabaseAdmin
    .from("emails_envoyes")
    .select("id", { count: "exact", head: true })
    .like("type", `${PREFIXE_TEST}%`)
    .gte("created_at", debutFenetre(maintenant));

  const refus = refusGardeFou({ destinataire, cles, envoisRecents: count ?? 0 });
  if (refus) return NextResponse.json({ error: refus }, { status: 400 });

  const contexte = await rassemblerContexte(destinataire);

  /** L'identifiant Resend n'existe que dans le journal : on l'y relit. */
  const lireResendId = async (typeJournal: string): Promise<string | null> => {
    const { data } = await supabaseAdmin
      .from("emails_envoyes")
      .select("resend_id")
      .eq("destinataire", destinataire)
      .eq("type", PREFIXE_TEST + typeJournal)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data?.resend_id as string | null) ?? null;
  };

  // Tout ce qui part d'ici est journalisé `test:`, et rien d'autre ne l'est.
  const resultats = await email.dansEnvoiDeTest(() =>
    envoyerEmailsDeTest({ cles, contexte, envois: ENVOIS, lireResendId })
  );

  return NextResponse.json({ ok: true, resultats });
}
