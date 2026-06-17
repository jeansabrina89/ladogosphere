"use client";

import { createSupabaseBrowserClient } from "@/src/lib/supabase-browser";
import { useRouter } from "next/navigation";

export default function BoutonDeconnexion() {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <button onClick={handleLogout}
      className="px-4 py-2 rounded-xl text-sm font-semibold"
      style={{ backgroundColor: "#1B2B5E", color: "#F5F0E8" }}>
      Déconnexion
    </button>
  );
}