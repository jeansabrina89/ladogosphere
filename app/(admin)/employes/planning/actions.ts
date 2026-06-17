"use server";

import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { createClient } from "@/src/utils/supabase/server";
import { verifierPermission } from "@/src/lib/verifierPermission";
import { revalidatePath } from "next/cache";

export type LignePlanningExport = {
  employe_id: string;
  nom_complet: string;
  date: string;
  statut: string;
};

type JourPlanning = {
  employe_id: string;
  date: string;
  statut: string;
  note?: string;
};

// 11 valeurs actives — 'ferie' (chômé) supprimé : anciennes lignes converties en 'repos' en base
const DB_STATUTS_VALIDES = new Set([
  "travail", "repos", "repos_vacances", "vacances", "maladie", "accident", "militaire",
  "ferie_travaille", "absent", "heures_sup", "autre",
]);

function toDbStatut(s: string): string {
  if (s === "ferie") return "repos"; // garde-fou : ne jamais réécrire 'ferie' en base
  return DB_STATUTS_VALIDES.has(s) ? s : "autre";
}

export async function sauvegarderPlanning(lignes: JourPlanning[]): Promise<{ error?: string }> {
  const verif = await verifierPermission("perm_planning");
  if (verif.error) return verif;

  const lignesSanitizees = lignes
    .filter(l => l.employe_id && l.date && l.statut)
    .map(l => ({
      employe_id: l.employe_id,
      date: l.date,
      statut: toDbStatut(l.statut),
      note: l.note ?? null,
    }));

  if (!lignesSanitizees.length) return {};

  const { error } = await supabaseAdmin
    .from("planning_employes")
    .upsert(lignesSanitizees, { onConflict: "employe_id,date" });

  if (error) return { error: error.message };

  // ── Réconciliation des timbrages vacances ──────────────────────────────────
  // Périmètre : tous les employés du batch × [date min .. date max]
  // Cible     : paires (employe_id, date) dont le statut sauvegardé est 'vacances'
  // Action    : créer le timbrage manquant / supprimer les timbrages 'vacances' obsolètes
  // 'repos_vacances' ne génère AUCUN timbrage.

  const employeIds = [...new Set(lignesSanitizees.map(l => l.employe_id))];

  if (employeIds.length > 0) {
    const datesSorted = lignesSanitizees.map(l => l.date).sort();
    const dateMin = datesSorted[0];
    const dateMax = datesSorted[datesSorted.length - 1];

    // Ensemble cible : clés "employe_id|date" dont statut = 'vacances'
    const ciblesVacances = new Set<string>(
      lignesSanitizees
        .filter(l => l.statut === "vacances")
        .map(l => `${l.employe_id}|${l.date}`)
    );

    // Un seul fetch pour tous les timbrages existants sur la plage
    const { data: timbragesExistants, error: errTimbrage } = await supabaseAdmin
      .from("timbrage")
      .select("id, employe_id, date, type_absence")
      .in("employe_id", employeIds)
      .gte("date", dateMin)
      .lte("date", dateMax);
    if (errTimbrage) return { error: errTimbrage.message };

    // Index : clé → existence d'un timbrage (quel qu'il soit)
    const pairesAvecTimbrage = new Set<string>();
    const timbragesVacancesObsoletes: string[] = [];

    timbragesExistants?.forEach((t: any) => {
      const key = `${t.employe_id}|${t.date}`;
      pairesAvecTimbrage.add(key);

      // Timbrage 'vacances' hors cible → à supprimer
      if ((t.type_absence ?? null) === "vacances" && !ciblesVacances.has(key)) {
        timbragesVacancesObsoletes.push(t.id);
      }
    });

    // Créer les timbrages manquants pour les jours 'vacances' sans aucun timbrage
    const aCreer: {
      employe_id: string;
      date: string;
      type_absence: string;
      valide_admin: boolean;
      note: string;
    }[] = [];

    for (const key of ciblesVacances) {
      if (!pairesAvecTimbrage.has(key)) {
        const [employe_id, date] = key.split("|");
        aCreer.push({ employe_id, date, type_absence: "vacances", valide_admin: true, note: "Vacances (auto)" });
      }
    }

    if (aCreer.length > 0) {
      const { error: errCreate } = await supabaseAdmin.from("timbrage").insert(aCreer);
      if (errCreate) return { error: errCreate.message };
    }

    // Supprimer les timbrages 'vacances' devenus obsolètes (filtrés sur type_absence='vacances')
    if (timbragesVacancesObsoletes.length > 0) {
      const { error: errDel } = await supabaseAdmin
        .from("timbrage")
        .delete()
        .in("id", timbragesVacancesObsoletes);
      if (errDel) return { error: errDel.message };
    }
  }
  // ── Fin réconciliation ─────────────────────────────────────────────────────

  // ── Resync nb_jours des demandes_vacances ──────────────────────────────────
  // Pour chaque demande 'acceptee' chevauchant la plage sauvegardée :
  //   - si la plage de la demande est entièrement couverte par le planning → nb_jours exact
  //   - sinon → on ne touche pas (on garde l'estimation théorique posée à l'acceptation)

  if (employeIds.length > 0) {
    const datesSortedR = lignesSanitizees.map(l => l.date).sort();
    const dateMinR = datesSortedR[0];
    const dateMaxR = datesSortedR[datesSortedR.length - 1];

    const { data: demandes, error: errDemandes } = await supabaseAdmin
      .from("demandes_vacances")
      .select("id, employe_id, date_debut, date_fin, nb_jours, note_admin")
      .in("employe_id", employeIds)
      .eq("statut", "acceptee")
      .lte("date_debut", dateMaxR)
      .gte("date_fin", dateMinR);
    if (errDemandes) return { error: errDemandes.message };

    for (const demande of demandes ?? []) {
      const { id, employe_id, date_debut, date_fin, nb_jours, note_admin } = demande;

      // Nombre de jours calendaires de la plage complète de la demande
      const MS_JOUR = 24 * 60 * 60 * 1000;
      const joursCalendaires =
        Math.round(
          (new Date(date_fin + "T12:00:00").getTime() -
            new Date(date_debut + "T12:00:00").getTime()) /
            MS_JOUR
        ) + 1;

      // Lire le planning de l'employé sur la plage COMPLÈTE de la demande
      const { data: planningDemande, error: errPlan } = await supabaseAdmin
        .from("planning_employes")
        .select("statut")
        .eq("employe_id", employe_id)
        .gte("date", date_debut)
        .lte("date", date_fin);
      if (errPlan) return { error: errPlan.message };

      // Plage entièrement couverte ?
      if ((planningDemande?.length ?? 0) < joursCalendaires) continue;

      const nbVacancesReel = planningDemande!.filter(r => r.statut === "vacances").length;

      // Nettoyer le marqueur '[auto]' de la note si présent (décompte désormais exact)
      const MARQUEUR_AUTO = "[auto] décompte théorique, affiné à la génération.";
      let nouvelleNote: string | null = note_admin ?? null;
      if (typeof nouvelleNote === "string" && nouvelleNote.startsWith(MARQUEUR_AUTO)) {
        const reste = nouvelleNote.slice(MARQUEUR_AUTO.length).trimStart();
        nouvelleNote = reste || null;
      }

      // Ne mettre à jour que si quelque chose a changé
      if (nbVacancesReel === nb_jours && nouvelleNote === (note_admin ?? null)) continue;

      const { error: errUpdate } = await supabaseAdmin
        .from("demandes_vacances")
        .update({ nb_jours: nbVacancesReel, note_admin: nouvelleNote })
        .eq("id", id);
      if (errUpdate) return { error: errUpdate.message };
    }
  }
  // ── Fin resync nb_jours ────────────────────────────────────────────────────

  revalidatePath("/employes/planning");
  return {};
}

export async function recupererPlanningMois(
  mois: number,
  annee: number,
): Promise<{ error?: string; lignes?: LignePlanningExport[] }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "employe"].includes(profile?.role ?? ""))
    return { error: "Accès réservé au personnel" };

  const debut = `${annee}-${String(mois).padStart(2, "0")}-01`;
  const fin = new Date(annee, mois, 0).toISOString().split("T")[0];

  const [{ data: rows, error: errRows }, { data: employes, error: errEmps }] = await Promise.all([
    supabaseAdmin
      .from("planning_employes")
      .select("employe_id, date, statut")
      .gte("date", debut)
      .lte("date", fin),
    supabaseAdmin
      .from("employes_rh")
      .select("id, nom, prenom")
      .eq("actif", true),
  ]);

  if (errRows) return { error: errRows.message };
  if (errEmps) return { error: errEmps.message };

  const nomParId: Record<string, string> = {};
  employes?.forEach((e: { id: string; nom: string; prenom: string }) => {
    nomParId[e.id] = `${e.prenom} ${e.nom}`;
  });

  const lignes: LignePlanningExport[] = (rows ?? []).map((r: { employe_id: string; date: string; statut: string }) => ({
    employe_id: r.employe_id,
    nom_complet: nomParId[r.employe_id] ?? "—",
    date: r.date,
    statut: r.statut,
  }));

  return { lignes };
}
