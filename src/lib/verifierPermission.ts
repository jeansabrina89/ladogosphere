import { createClient } from "../utils/supabase/server";

export async function verifierPermission(
  perm: string
): Promise<{ error?: string; userId?: string; isAdmin?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };
  const { data: profile } = await supabase
    .from("profiles")
    .select(`role, ${perm}`)
    .eq("id", user.id)
    .single();
  if (profile?.role === "admin") return { userId: user.id, isAdmin: true };
  if (profile?.role === "employe" && (profile as any)?.[perm] === true)
    return { userId: user.id, isAdmin: false };
  return { error: "Accès réservé à l'admin" };
}
