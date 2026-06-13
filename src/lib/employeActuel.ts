export async function getEmployeRhActuel(supabase: any, userId: string, email?: string | null) {
  if (userId) {
    const { data } = await supabase
      .from("employes_rh")
      .select("*")
      .eq("profile_id", userId)
      .maybeSingle();
    if (data) return data;
  }

  if (email) {
    const { data } = await supabase
      .from("employes_rh")
      .select("*")
      .eq("email", email)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}
