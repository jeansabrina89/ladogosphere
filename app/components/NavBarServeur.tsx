import { createSupabaseServerClient } from "../../src/lib/supabase-server";
import { supabase } from "../../src/lib/supabase";
import NavBar from "./NavBar";

export default async function NavBarServeur() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();

  let role = "client";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    role = profile?.role ?? "client";
  }

  return <NavBar role={role} />;
}