import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { exigerPersonnel } from "@/src/lib/apiAuth";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { occupationEnConflit, boxCompatibleAvecIsolement, memeFamille, capaciteMaxFamille } from "@/src/lib/disponibilite-box";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPersonnel(supabase);
  if (garde) return garde;
  const { chien_ids, date_debut, date_fin, reservation_id, heure_arrivee, heure_depart, type_reservation } = await req.json();

  if (!chien_ids || chien_ids.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  const { data: chiensAplacer } = await supabase
    .from("chiens")
    .select("*, clients (id)")
    .in("id", chien_ids);

  if (!chiensAplacer) return NextResponse.json({ suggestions: [] });

  // Les box INTERNES ne sont proposés que pour les chiens d'une fiche interne :
  // un client ne doit jamais s'en voir attribuer un.
  const clientIdsChiens = [...new Set((chiensAplacer ?? []).map((c: any) => c.client_id).filter(Boolean))];
  const { data: fichesInternes } = clientIdsChiens.length
    ? await supabaseAdmin.from("clients").select("id").eq("interne", true).in("id", clientIdsChiens)
    : { data: [] };
  const placementInterne = (fichesInternes ?? []).length > 0;

  let requeteBoxes = supabase.from("boxes").select("*").eq("actif", true);
  if (!placementInterne) requeteBoxes = requeteBoxes.eq("interne", false);
  const { data: boxesActifs } = await requeteBoxes.order("numero");

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
        id, nom, categorie_poids, sexe, sterilise, client_id, doit_etre_isole,
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

  // Exclusivité "doit être isolé" : un box occupé par un chien isolé est
  // indisponible pour tout le monde, et un chien isolé exige un box vide.
  const placementIsole = chiensAplacer.some((c: any) => c.doit_etre_isole);
  const boxesDisponibles = (boxes ?? []).filter(box => {
    const chiensPresents = chiensByBox[box.id] ?? [];
    const occupantIsole = chiensPresents.some((c: any) => c.doit_etre_isole);
    return boxCompatibleAvecIsolement(occupantIsole, chiensPresents.length, placementIsole);
  });

  const suggestions = boxesDisponibles.map(box => {
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
  });

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

  // Une réservation correspond à un seul client : tous les chiens à placer
  // appartiennent à la même famille. On distingue, parmi les chiens déjà
  // présents dans le box, ceux de cette même famille (regroupement souhaité,
  // compatibilité taille/sexe ignorée) de ceux d'une autre famille (règles de
  // compatibilité normales).
  const clientIdFamille = chiensAplacer[0]?.clients?.id ?? null;
  const chiensPresentsMemeFamille = chiensPresents.filter((p: any) =>
    memeFamille(clientIdFamille, p.client_id)
  );
  const chiensPresentsAutreFamille = chiensPresents.filter((p: any) =>
    !memeFamille(clientIdFamille, p.client_id)
  );

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

  if (chiensPresentsAutreFamille.length === 0) {
    // Box vide ou occupé uniquement par la même famille : on regroupe la
    // famille, capacité élargie (jusqu'à 3, ou 4 si tous petits gabarits).
    const maxCapaciteFamille = capaciteMaxFamille([
      ...chiensAplacer.map(c => c.categorie_poids),
      ...chiensPresentsMemeFamille.map((c: any) => c.categorie_poids),
    ]);
    if (nbTotal > maxCapaciteFamille) {
      const surplus = nbTotal - maxCapaciteFamille;
      total -= 5 * surplus;
      problemes.push(
        `👨‍👩‍👧 Famille trop nombreuse pour ce box (max ${maxCapaciteFamille}) — ${surplus} chien(s) à regrouper dans un autre box`
      );
    }
  } else if (aMoyens || aGrands) {
    const maxCapacite = 2;
    if (nbTotal > maxCapacite) {
      total -= 100;
      problemes.push(`Box plein (max ${maxCapacite} pour cette catégorie)`);
    }
  } else if (aPetits && nbTotal > 4) {
    total -= 100;
    problemes.push("Box plein (max 4 petits)");
  }

  // Même famille déjà présente dans ce box — bonus (on les regroupe)
  if (chiensPresentsMemeFamille.length > 0) {
    total += 50;
    raisons.push("✅ Même famille déjà présente dans ce box");
  }

  if (chiensPresents.length === 0) {
    raisons.push("🟢 Box libre");
  }

  // Compatibilités générales taille/sexe — uniquement avec les chiens d'une
  // AUTRE famille : entre chiens d'une même famille (même client_id), ces
  // contrôles sont ignorés (ils vivent déjà ensemble).
  for (const chienAplacer of chiensAplacer) {
    for (const present of chiensPresentsAutreFamille) {
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

  if (problemes.length === 0 && chiensPresentsAutreFamille.length > 0) {
    raisons.push("✅ Compatible");
  }

  return { total, raisons, problemes };
}