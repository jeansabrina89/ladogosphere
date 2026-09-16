import { supabaseAdmin } from "@/src/lib/supabase-admin";
import {
  MESSAGE_INITIALES_PRISES,
  normaliserInitiales,
  refusInitiales,
  type ProfilAuteur,
} from "@/src/lib/auteur";

/**
 * Les auteurs des gestes, lus une fois pour tous les écrans.
 *
 * Le nom d'une personne du personnel vient d'abord de sa fiche RH, puis de son
 * profil : les profils portent souvent un nom provisoire (« Employé Inconnu 1 »)
 * ou aucun nom, quand la fiche RH porte le vrai. Les initiales, elles, sont sur
 * le profil — la même règle les a calculées.
 *
 * Réservé aux écrans du personnel. Aucune page de l'espace client ne l'importe :
 * un test y veille.
 */
export async function lireAuteurs(ids: Iterable<string | null | undefined>): Promise<Map<string, ProfilAuteur>> {
  const uniques = [...new Set([...ids].filter((x): x is string => !!x))];
  const auteurs = new Map<string, ProfilAuteur>();
  if (uniques.length === 0) return auteurs;

  const [{ data: profils }, { data: fiches }] = await Promise.all([
    supabaseAdmin.from("profiles").select("id, initiales, prenom, nom, email, role").in("id", uniques),
    supabaseAdmin.from("employes_rh").select("profile_id, prenom, nom, actif").in("profile_id", uniques),
  ]);

  const rh = new Map<string, { prenom: string | null; nom: string | null }>();
  for (const f of (fiches ?? []) as { profile_id: string; prenom: string | null; nom: string | null; actif: boolean | null }[]) {
    // Une fiche active l'emporte sur une ancienne.
    if (!rh.has(f.profile_id) || f.actif) rh.set(f.profile_id, { prenom: f.prenom, nom: f.nom });
  }

  const nonVide = (x: string | null | undefined) => (x && x.trim() !== "" ? x : null);
  for (const p of (profils ?? []) as (ProfilAuteur & { id: string })[]) {
    const r = rh.get(p.id);
    auteurs.set(p.id, {
      initiales: p.initiales ?? null,
      prenom: nonVide(r?.prenom) ?? p.prenom ?? null,
      nom: nonVide(r?.nom) ?? p.nom ?? null,
      email: p.email ?? null,
      role: p.role ?? null,
    });
  }
  return auteurs;
}

/**
 * Enregistre les initiales choisies pour un compte du personnel, ou RENVOIE
 * le refus : format (2–3 lettres) ou initiales déjà portées par une autre
 * personne active de l'équipe. L'index unique de la base refuse aussi, au cas
 * où deux saisies se croiseraient.
 */
export async function enregistrerInitiales(
  profilId: string,
  saisie: string,
): Promise<{ error?: string; initiales?: string }> {
  const { data: autres, error: errLecture } = await supabaseAdmin
    .from("profiles")
    .select("initiales")
    .neq("id", profilId)
    .eq("actif", true)
    .in("role", ["admin", "employe"])
    .not("initiales", "is", null);
  if (errLecture) return { error: errLecture.message };

  const prises = ((autres ?? []) as { initiales: string }[]).map((a) => a.initiales);
  const refus = refusInitiales(saisie, prises);
  if (refus) return { error: refus };

  const initiales = normaliserInitiales(saisie);
  const { error } = await supabaseAdmin.from("profiles").update({ initiales }).eq("id", profilId);
  if (error) return { error: error.code === "23505" ? MESSAGE_INITIALES_PRISES : error.message };
  return { initiales };
}
