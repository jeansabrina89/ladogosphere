import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import NavBarAdmin from "./NavBarAdmin";
import NavBarEmploye from "./NavBarEmploye";
import NavBarClient from "./NavBarClient";

export default async function NavBarServeur() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  let role = "client";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    role = profile?.role ?? "client";
  }

  if (role === "admin") return <NavBarAdmin />;
  if (role === "employe") return <NavBarEmploye />;
  return <NavBarClient />;
}
