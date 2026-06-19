import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { exigerPersonnel, exigerPermissionApi } from "@/src/lib/apiAuth";
import { joursVacancesTheoriques } from "@/src/lib/planningUtils";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;
  const body = await req.json();
  const { employe_id, date_debut, date_fin, nb_jours, note_employe } = body;

  // Vérifier si les dates se chevauchent avec d'autres demandes de cet employé
  const { data: existantes } = await supabaseAdmin
    .from("demandes_vacances")
    .select("*")
    .eq("employe_id", employe_id)
    .neq("statut", "refusee")
    .or(`and(date_debut.lte.${date_fin},date_fin.gte.${date_debut})`);

  if (existantes && existantes.length > 0) {
    return NextResponse.json({
      error: "Ces dates chevauchent une demande de vacances déjà existante."
    }, { status: 400 });
  }

  const { data: creee, error } = await supabaseAdmin
    .from("demandes_vacances")
    .insert({ employe_id, date_debut, date_fin, nb_jours, note_employe })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: creee.id });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_vacances_equipe");
  if (garde) return garde;
  const { id, statut, note_admin } = await req.json();

  // 1. Mettre à jour le statut et la note admin
  const { error } = await supabaseAdmin
    .from("demandes_vacances")
    .update({ statut, note_admin })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 2. Récupérer la demande pour la propagation
  const { data: demande, error: errDemande } = await supabaseAdmin
    .from("demandes_vacances")
    .select("employe_id, date_debut, date_fin")
    .eq("id", id)
    .single();
  if (errDemande || !demande) {
    return NextResponse.json({ error: "Demande introuvable après mise à jour." }, { status: 500 });
  }
  const { employe_id, date_debut, date_fin } = demande;

  // 3. Taux de l'employé (pour le décompte théorique si planning absent)
  const { data: empRh } = await supabaseAdmin
    .from("employes_rh")
    .select("taux_travail")
    .eq("id", employe_id)
    .single();
  const taux: number = empRh?.taux_travail ?? 100;

  // 4. Nombre de jours calendaires dans la plage
  const MS_JOUR = 24 * 60 * 60 * 1000;
  const totalJours =
    Math.round(
      (new Date(date_fin + "T12:00:00").getTime() -
        new Date(date_debut + "T12:00:00").getTime()) /
        MS_JOUR
    ) + 1;

  // 5. Lignes de planning sur la plage
  const { data: planningRows, error: errPlanning } = await supabaseAdmin
    .from("planning_employes")
    .select("id, date, statut")
    .eq("employe_id", employe_id)
    .gte("date", date_debut)
    .lte("date", date_fin);
  if (errPlanning) return NextResponse.json({ error: errPlanning.message }, { status: 500 });

  // Le planning est "complet" si chaque jour calendaire de la plage a une ligne
  const planningComplet = (planningRows?.length ?? 0) >= totalJours;

  if (statut === "acceptee") {
    // ── APPLIQUER ────────────────────────────────────────────────────────────

    // Jours à basculer : seulement ceux avec statut 'travail'
    const aBasculer = planningRows?.filter(r => r.statut === "travail") ?? [];

    if (aBasculer.length > 0) {
      const { error: errUpdate } = await supabaseAdmin
        .from("planning_employes")
        .update({ statut: "vacances", note: "Vacances (demande acceptée)" })
        .eq("employe_id", employe_id)
        .gte("date", date_debut)
        .lte("date", date_fin)
        .eq("statut", "travail");
      if (errUpdate) return NextResponse.json({ error: errUpdate.message }, { status: 500 });
    }

    // Jours de repos dans la plage → 'repos_vacances' (visible, sans décompte)
    const { error: errRepos } = await supabaseAdmin
      .from("planning_employes")
      .update({ statut: "repos_vacances", note: "Vacances (repos dans la plage)" })
      .eq("employe_id", employe_id)
      .gte("date", date_debut)
      .lte("date", date_fin)
      .eq("statut", "repos");
    if (errRepos) return NextResponse.json({ error: errRepos.message }, { status: 500 });

    // Timbrages existants sur la plage (batch, une seule requête)
    const { data: timbragesRange } = await supabaseAdmin
      .from("timbrage")
      .select("date, type_absence")
      .eq("employe_id", employe_id)
      .gte("date", date_debut)
      .lte("date", date_fin);

    const timbragesParDate: Record<string, (string | null)[]> = {};
    timbragesRange?.forEach((t: any) => {
      if (!timbragesParDate[t.date]) timbragesParDate[t.date] = [];
      timbragesParDate[t.date].push(t.type_absence ?? null);
    });

    // Pour chaque jour basculé en 'vacances' : créer un timbrage si absent
    // ('repos_vacances' ne génère AUCUN timbrage)
    for (const row of aBasculer) {
      const types = timbragesParDate[row.date] ?? [];
      const dejaVacances  = types.includes("vacances");
      const aVraiesHeures = types.includes(null);
      if (!dejaVacances && !aVraiesHeures) {
        const { error: errT } = await supabaseAdmin
          .from("timbrage")
          .insert({
            employe_id,
            date: row.date,
            type_absence: "vacances",
            valide_admin: true,
            note: "Vacances (auto)",
          });
        if (errT) return NextResponse.json({ error: errT.message }, { status: 500 });
      }
    }

    // Calculer nb_jours et éventuellement préfixer note_admin
    let nouveauNbJours: number;
    let nouvelleNoteAdmin: string | null = note_admin ?? null;

    if (planningComplet) {
      // Planning connu pour toute la plage → décompte exact (jours travail seulement)
      nouveauNbJours = aBasculer.length;
    } else {
      // Planning partiel ou absent → décompte théorique
      nouveauNbJours = joursVacancesTheoriques(taux, date_debut, date_fin);
      const prefixe = "[auto] décompte théorique, affiné à la génération.";
      nouvelleNoteAdmin = nouvelleNoteAdmin
        ? `${prefixe} ${nouvelleNoteAdmin}`
        : prefixe;
    }

    const { error: errNbJ } = await supabaseAdmin
      .from("demandes_vacances")
      .update({ nb_jours: nouveauNbJours, note_admin: nouvelleNoteAdmin })
      .eq("id", id);
    if (errNbJ) return NextResponse.json({ error: errNbJ.message }, { status: 500 });

  } else {
    // ── DÉFAIRE (refusee / en_attente) ───────────────────────────────────────

    // Repasser 'vacances' → 'travail' dans planning_employes
    const { error: errRevert } = await supabaseAdmin
      .from("planning_employes")
      .update({ statut: "travail", note: null })
      .eq("employe_id", employe_id)
      .gte("date", date_debut)
      .lte("date", date_fin)
      .eq("statut", "vacances");
    if (errRevert) return NextResponse.json({ error: errRevert.message }, { status: 500 });

    // Repasser 'repos_vacances' → 'repos'
    const { error: errRV } = await supabaseAdmin
      .from("planning_employes")
      .update({ statut: "repos", note: null })
      .eq("employe_id", employe_id)
      .gte("date", date_debut)
      .lte("date", date_fin)
      .eq("statut", "repos_vacances");
    if (errRV) return NextResponse.json({ error: errRV.message }, { status: 500 });

    // Supprimer les timbrages type_absence='vacances' auto-créés (laisse intact les vraies heures)
    const { error: errDel } = await supabaseAdmin
      .from("timbrage")
      .delete()
      .eq("employe_id", employe_id)
      .gte("date", date_debut)
      .lte("date", date_fin)
      .eq("type_absence", "vacances");
    if (errDel) return NextResponse.json({ error: errDel.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_vacances_equipe");
  if (garde) return garde;

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
  }

  // Récupérer la demande pour défaire sa propagation
  const { data: demande, error: errDemande } = await supabaseAdmin
    .from("demandes_vacances")
    .select("employe_id, date_debut, date_fin")
    .eq("id", id)
    .single();
  if (errDemande || !demande) {
    return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
  }
  const { employe_id, date_debut, date_fin } = demande;

  // 1. planning : 'vacances' → 'travail'
  const { error: errRevert } = await supabaseAdmin
    .from("planning_employes")
    .update({ statut: "travail", note: null })
    .eq("employe_id", employe_id)
    .gte("date", date_debut)
    .lte("date", date_fin)
    .eq("statut", "vacances");
  if (errRevert) return NextResponse.json({ error: errRevert.message }, { status: 500 });

  // 2. planning : 'repos_vacances' → 'repos'
  const { error: errRV } = await supabaseAdmin
    .from("planning_employes")
    .update({ statut: "repos", note: null })
    .eq("employe_id", employe_id)
    .gte("date", date_debut)
    .lte("date", date_fin)
    .eq("statut", "repos_vacances");
  if (errRV) return NextResponse.json({ error: errRV.message }, { status: 500 });

  // 3. timbrages 'vacances' auto-créés (laisse les vraies heures)
  const { error: errDelT } = await supabaseAdmin
    .from("timbrage")
    .delete()
    .eq("employe_id", employe_id)
    .gte("date", date_debut)
    .lte("date", date_fin)
    .eq("type_absence", "vacances");
  if (errDelT) return NextResponse.json({ error: errDelT.message }, { status: 500 });

  // 4. supprimer la demande
  const { error: errDel } = await supabaseAdmin
    .from("demandes_vacances")
    .delete()
    .eq("id", id);
  if (errDel) return NextResponse.json({ error: errDel.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
