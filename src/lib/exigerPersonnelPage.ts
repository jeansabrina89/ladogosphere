import { redirect } from "next/navigation";
import { createClient } from "../utils/supabase/server";

export async function exigerPersonnelPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!["admin", "employe"].includes(profile?.role ?? "")) redirect("/");
}
