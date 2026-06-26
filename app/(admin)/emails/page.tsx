import { redirect } from "next/navigation";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { MODELES_META, DEFAUTS_MODELES } from "@/src/lib/email";
import GestionEmails from "./GestionEmails";

export const dynamic = "force-dynamic";

export default async function EmailsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

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

  return <GestionEmails emails={emails} campagnes={campagnes ?? []} />;
}
