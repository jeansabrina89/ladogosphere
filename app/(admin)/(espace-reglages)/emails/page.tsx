import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { MODELES_META, DEFAUTS_MODELES } from "@/src/lib/email";
import { CLE_AVIS_GOOGLE } from "@/src/lib/avisGoogle";
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
    .select("type, sujet, titre, intro, message_final");

  const persoParType: Record<string, any> = {};
  for (const m of modeles ?? []) persoParType[m.type] = m;

  const emails = MODELES_META.map((meta) => ({
    type: meta.type,
    label: meta.label,
    variables: meta.variables,
    defaut: DEFAUTS_MODELES[meta.type],
    perso: persoParType[meta.type] ?? null,
  }));

  const { data: campagnes } = await supabaseAdmin
    .from("emails_campagnes")
    .select("id, sujet, cible, nb_destinataires, nb_echecs, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: avis } = await supabaseAdmin
    .from("parametres").select("valeur").eq("cle", CLE_AVIS_GOOGLE).maybeSingle();

  return (
    <GestionEmails
      emails={emails}
      campagnes={campagnes ?? []}
      emailAdmin={acces.email ?? ""}
      avisGoogleUrl={(avis?.valeur as string | null) ?? ""}
      ongletInitial={ongletEmails(onglet)}
    />
  );
}
