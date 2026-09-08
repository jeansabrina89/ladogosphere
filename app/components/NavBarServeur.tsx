import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import NavBarPersonnel from "./NavBarPersonnel";
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

  // Admin et employée partagent la même barre : ce qui les distingue, ce sont
  // leurs permissions, pas un menu écrit deux fois.
  if (role === "admin" || role === "employe") return <NavBarPersonnel />;
  return <NavBarClient />;
}
