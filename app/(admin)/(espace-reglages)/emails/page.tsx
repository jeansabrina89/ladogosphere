import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { MODELES_META, DEFAUTS_MODELES, LIBELLES_BLOCS } from "@/src/lib/email";
import { CLE_AVIS_GOOGLE } from "@/src/lib/avisGoogle";
import { CLES_SIGNATURE, signatureDepuisReglages } from "@/src/lib/signatureEmail";
import { entiteA } from "@/src/lib/entiteJuridique";
import { raisonSocialeAffichee } from "@/src/lib/entiteJuridiqueLogique";
import GestionEmails from "./GestionEmails";
import { ongletEmails } from "@/src/lib/ongletsEmails";

export const dynamic = "force-dynamic";

export default async function EmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string | string[] }>;
}) {
  const acces = await exigerAdminPage();
  const { onglet } = await searchParams;

  const { data: modeles } = await supabaseAdmin
    .from("modeles_email")
    .select("type, sujet, titre, intro, message_final, blocs");

  const persoParType: Record<string, any> = {};
  for (const m of modeles ?? []) persoParType[m.type] = m;

  const emails = MODELES_META.map((meta) => ({
    type: meta.type,
    label: meta.label,
    variables: meta.variables,
    defaut: DEFAUTS_MODELES[meta.type],
    perso: persoParType[meta.type] ?? null,
    // APP 60 — les autres textes : leurs valeurs d'origine, leurs libellés, et
    // ce qui a été réellement changé en base.
    blocsDefaut: DEFAUTS_MODELES[meta.type]?.blocs ?? {},
    libellesBlocs: LIBELLES_BLOCS[meta.type] ?? {},
    blocsPerso: (persoParType[meta.type]?.blocs as Record<string, string | string[]> | undefined) ?? null,
  }));

  const { data: campagnes } = await supabaseAdmin
    .from("emails_campagnes")
    .select("id, sujet, cible, nb_destinataires, nb_echecs, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: avis } = await supabaseAdmin
    .from("parametres").select("valeur").eq("cle", CLE_AVIS_GOOGLE).maybeSingle();

  // APP 58 — la signature, lue en UNE fois, avec le même repli que les e-mails.
  const { data: reglagesSignature } = await supabaseAdmin
    .from("parametres").select("cle, valeur").in("cle", Object.values(CLES_SIGNATURE));
  const signature = signatureDepuisReglages(
    new Map((reglagesSignature ?? []).map((l) => [l.cle as string, (l.valeur as string | null) ?? ""])),
  );
  const raisonSociale = raisonSocialeAffichee(await entiteA());

  return (
    <GestionEmails
      emails={emails}
      campagnes={campagnes ?? []}
      emailAdmin={acces.email ?? ""}
      avisGoogleUrl={(avis?.valeur as string | null) ?? ""}
      signature={signature}
      raisonSociale={raisonSociale}
      ongletInitial={ongletEmails(onglet)}
    />
  );
}
