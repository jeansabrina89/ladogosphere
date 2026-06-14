import { NextResponse } from "next/server";

// Exige un membre du personnel (admin ou employé) connecté.
// Retourne une NextResponse d'erreur si refus, sinon null.
export async function exigerPersonnel(supabase: any): Promise<NextResponse | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!["admin", "employe"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Accès réservé au personnel" }, { status: 403 });
  }
  return null;
}

// Exige une permission précise : admin toujours autorisé, employé seulement si profile[perm] === true.
// Remplace exigerPersonnel dans les routes qui ont un perm_* associé.
export async function exigerPermissionApi(supabase: any, perm: string): Promise<NextResponse | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const { data: profile } = await supabase
    .from("profiles")
    .select(`role, ${perm}`)
    .eq("id", user.id)
    .single();
  if (profile?.role === "admin") return null;
  if (profile?.role === "employe" && (profile as any)?.[perm] === true) return null;
  return NextResponse.json({ error: "Accès réservé à l'admin" }, { status: 403 });
}
