import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../src/utils/supabase/server";
import { supabaseAdmin } from "../../../../src/lib/supabase-admin";
import { occupationEnConflit } from "../../../../src/lib/disponibilite-box";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { chien_ids, date_debut, date_fin, reservation_id, heure_arrivee, heure_depart, type_reservation } = await req.json();

  if (!chien_ids || chien_ids.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  const { data: chiensAplacer } = await supabase
    .from("chiens")
    .select("*, clients (id)")
    .in("id", chien_ids);

  if (!chiensAplacer) return NextResponse.json({ suggestions: [] });

  const { data: boxesActifs } = await supabase
    .from("boxes")
    .select("*")
    .eq("actif", true)
    .order("numero");

  // Exclure les box indisponibles sur la période demandée (lecture admin : RLS admin-only)
  let boxesIndisponibles = new Set<string>();
  if (date_debut && date_fin) {
    const { data: indisponibilites } = await supabaseAdmin
      .from("box_indisponibilites")
      .select("box_id")
      .lte("date_debut", date_fin)
      .gte("date_fin", date_debut);
    boxesIndisponibles = new Set((indisponibilites ?? []).map(i => i.box_id));
  }

  const boxes = (boxesActifs ?? []).filter(box => !boxesIndisponibles.has(box.id));

  const { data: occupationsRaw } = await supabase
    .from("occupation_boxes")
    .select(`
      box_id,
      chien_id,
      date_debut,
      date_fin,
      reservations (heure_arrivee, heure_depart, type_reservation),
      chiens (
        id, nom, categorie_poids, sexe, sterilise, client_id,
        compatible_moins_15kg, compatible_15_30kg, compatible_30_40kg,
        compatible_males_castres, compatible_males_entiers,
        compatible_femelles_sterilisees, compatible_femelles_entieres
      )
    `)
    .lte("date_debut", date_fin)
    .gte("date_fin", date_debut)
    .neq("reservation_id", reservation_id || "00000000-0000-0000-0000-000000000000");

  // Exclut les occupations dont le seul jour de chevauchement est une transition
  // autorisée (départ/arrivée le même jour, créneaux compatibles, arrivée pas
  // de type 'journee') — ne s'applique que si les horaires/type de la nouvelle
  // réservation sont fournis (côté client).
  const occupations = (occupationsRaw ?? []).filter((occ: any) =>
    occupationEnConflit(
      {
        date_debut: occ.date_debut,
        date_fin: occ.date_fin,
        heure_arrivee: occ.reservations?.heure_arrivee,
        heure_depart: occ.reservations?.heure_depart,
        type_reservation: occ.reservations?.type_reservation,
      },
      { date_debut, date_fin, heure_arrivee, heure_depart, type_reservation }
    )
  );

  // Récupérer les ententes individuelles des chiens à placer
  const { data: ententes } = await supabase
    .from("ententes_chiens")
    .select("chien_id, chien_cible_id, type")
    .in("chien_id", chien_ids);

  // Récupérer si un des chiens est famille uniquement
  const { data: familleUniquement } = await supabase
    .from("ententes_chiens")
    .select("chien_id")
    .in("chien_id", chien_ids)
    .eq("type", "famille_uniquement");

  const chiensFamilleUniquement = new Set(familleUniquement?.map(f => f.chien_id) ?? []);

  const chiensByBox: Record<string, any[]> = {};
  occupations?.forEach(occ => {
    if (!chiensByBox[occ.box_id]) chiensByBox[occ.box_id] = [];
    if (occ.chiens) chiensByBox[occ.box_id].push(occ.chiens);
  });

  const suggestions = boxes?.map(box => {
    const chiensPresents = chiensByBox[box.id] ?? [];
    const score = calculerScore(
      chiensAplacer,
      chiensPresents,
      box,
      ententes ?? [],
      chiensFamilleUniquement
    );
    return {
      box_id: box.id,
      numero: box.numero,
      nom: box.nom,
      score: score.total,
      raisons: score.raisons,
      problemes: score.problemes,
      nb_chiens_presents: chiensPresents.length,
      chiens_presents: chiensPresents.map((c: any) => c.nom),
    };
  }) ?? [];

  suggestions.sort((a, b) => b.score - a.score);

  return NextResponse.json({ suggestions });
}

function calculerScore(
  chiensAplacer: any[],
  chiensPresents: any[],
  box: any,
  ententes: any[],
  chiensFamilleUniquement: Set<string>
) {
  let total = 100;
  const raisons: string[] = [];
  const problemes: string[] = [];

  // Vérifier famille uniquement
  for (const chien of chiensAplacer) {
    if (chiensFamilleUniquement.has(chien.id) && chiensPresents.length > 0) {
      const tousMemeFamille = chiensPresents.every((p: any) =>
        p.client_id === chien.clients?.id
      );
      if (!tousMemeFamille) {
        total -= 200;
        problemes.push(`🏠 ${chien.nom} — famille uniquement`);
      }
    }
  }

  // Vérifier ententes individuelles
  for (const chienAplacer of chiensAplacer) {
    for (const present of chiensPresents) {
      const entente = ententes.find(e =>
        (e.chien_id === chienAplacer.id && e.chien_cible_id === present.id) ||
        (e.chien_id === present.id && e.chien_cible_id === chienAplacer.id)
      );

      if (entente) {
        if (entente.type === "ok") {
          total += 80;
          raisons.push(`✅ ${chienAplacer.nom} s'entend bien avec ${present.nom}`);
        } else if (entente.type === "interdit") {
          total -= 200;
          problemes.push(`❌ ${chienAplacer.nom} incompatible avec ${present.nom}`);
        }
      }
    }
  }

  // Limite capacité
  const nbTotal = chiensPresents.length + chiensAplacer.length;
  const toutesCategories = [
    ...chiensAplacer.map(c => c.categorie_poids),
    ...chiensPresents.map((c: any) => c.categorie_poids)
  ];

  const aMoyens = toutesCategories.includes("15_30kg");
  const aGrands = toutesCategories.includes("30_40kg");
  const aPetits = toutesCategories.includes("moins_15kg");

  if (aMoyens || aGrands) {
    const memeProprietaire = chiensAplacer.every(c =>
      chiensPresents.every((p: any) => p.client_id === c.clients?.id)
    );
    const maxCapacite = memeProprietaire ? 3 : 2;
    if (nbTotal > maxCapacite) {
      total -= 100;
      problemes.push(`Box plein (max ${maxCapacite} pour cette catégorie)`);
    }
  } else if (aPetits && nbTotal > 4) {
    total -= 100;
    problemes.push("Box plein (max 4 petits)");
  }

  // Même propriétaire — bonus
  if (chiensPresents.length > 0) {
    const clientIds = chiensAplacer.map(c => c.clients?.id);
    const memeProprietaire = chiensPresents.some((p: any) =>
      clientIds.includes(p.client_id)
    );
    if (memeProprietaire) {
      total += 50;
      raisons.push("✅ Même propriétaire");
    }
  }

  if (chiensPresents.length === 0) {
    raisons.push("🟢 Box libre");
  }

  // Compatibilités générales
  for (const chienAplacer of chiensAplacer) {
    for (const present of chiensPresents) {
      const categoriePresent = present.categorie_poids;
      if (categoriePresent === "moins_15kg" && !chienAplacer.compatible_moins_15kg) {
        total -= 30;
        problemes.push(`⚠️ ${chienAplacer.nom} pas compatible avec les petits`);
      }
      if (categoriePresent === "15_30kg" && !chienAplacer.compatible_15_30kg) {
        total -= 30;
        problemes.push(`⚠️ ${chienAplacer.nom} pas compatible avec les moyens`);
      }
      if (categoriePresent === "30_40kg" && !chienAplacer.compatible_30_40kg) {
        total -= 30;
        problemes.push(`⚠️ ${chienAplacer.nom} pas compatible avec les grands`);
      }

      const sexePresent = present.sexe;
      const sterilisePresent = present.sterilise;
      if (sexePresent === "M" && sterilisePresent && !chienAplacer.compatible_males_castres) {
        total -= 20;
        problemes.push(`⚠️ ${chienAplacer.nom} pas compatible avec mâles castrés`);
      }
      if (sexePresent === "M" && !sterilisePresent && !chienAplacer.compatible_males_entiers) {
        total -= 20;
        problemes.push(`⚠️ ${chienAplacer.nom} pas compatible avec mâles entiers`);
      }
      if (sexePresent === "F" && sterilisePresent && !chienAplacer.compatible_femelles_sterilisees) {
        total -= 20;
        problemes.push(`⚠️ ${chienAplacer.nom} pas compatible avec femelles stérilisées`);
      }
      if (sexePresent === "F" && !sterilisePresent && !chienAplacer.compatible_femelles_entieres) {
        total -= 20;
        problemes.push(`⚠️ ${chienAplacer.nom} pas compatible avec femelles entières`);
      }
    }
  }

  if (problemes.length === 0 && chiensPresents.length > 0) {
    raisons.push("✅ Compatible");
  }

  return { total, raisons, problemes };
}