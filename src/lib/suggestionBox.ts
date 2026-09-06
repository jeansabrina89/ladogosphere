import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { formatBoxLabel } from "@/src/lib/boxes";
import {
  occupationEnConflit,
  boxCompatibleAvecIsolement,
  memeFamille,
  capaciteMaxFamille,
} from "@/src/lib/disponibilite-box";

export type EntreeSuggestion = {
  chien_ids: string[];
  date_debut: string;
  date_fin: string;
  heure_arrivee?: string | null;
  heure_depart?: string | null;
  type_reservation?: string | null;
  /**
   * Inclure les box INTERNES dans les candidats. Faux par défaut : un client ne
   * doit jamais se voir attribuer un box du personnel ou de la pension.
   */
  inclureInternes?: boolean;
};

type LigneOccupation = {
  box_id: string;
  chien_id: string;
  date_debut: string;
  date_fin: string;
  reservations: { heure_arrivee: string | null; heure_depart: string | null; type_reservation: string | null } | null;
  chiens: { doit_etre_isole: boolean | null; client_id: string | null; categorie_poids: string | null } | null;
};

type ChienAPlacer = {
  id: string;
  doit_etre_isole: boolean | null;
  client_id: string | null;
  categorie_poids: string | null;
};

type BoxCandidat = {
  id: string;
  numero: number;
  nom: string | null;
  capacite_standard: number | null;
};

export type ResultatSuggestion = {
  box_id: string | null;
  raison: "box_compatible" | "vide" | "ami_ok" | null;
  message?: string;
};

/**
 * Suggestion d'un box libre pour une réservation — logique extraite de
 * /api/boxes/suggestion afin d'être appelable sans passer par HTTP
 * (réservations du personnel créées côté serveur).
 *
 * Les box `interne` sont exclus par défaut : ils ne comptent ni dans les
 * suggestions ni dans la capacité offerte aux clients.
 */
export async function suggererBox(entree: EntreeSuggestion): Promise<ResultatSuggestion> {
  const {
    chien_ids, date_debut, date_fin,
    heure_arrivee, heure_depart, type_reservation,
    inclureInternes = false,
  } = entree;

  if (!chien_ids?.length || !date_debut || !date_fin) {
    return { box_id: null, raison: null };
  }

  // 1. Occupations qui chevauchent la période demandée.
  const { data: occupationsRaw } = await supabaseAdmin
    .from("occupation_boxes")
    .select("box_id, chien_id, date_debut, date_fin, reservations (heure_arrivee, heure_depart, type_reservation), chiens (doit_etre_isole, client_id, categorie_poids)")
    .lte("date_debut", date_fin)
    .gte("date_fin", date_debut);

  const { data: chiensAPlacerInfo } = await supabaseAdmin
    .from("chiens")
    .select("id, doit_etre_isole, client_id, categorie_poids")
    .in("id", chien_ids);
  const chiensAPlacer = (chiensAPlacerInfo ?? []) as ChienAPlacer[];
  const placementIsole = chiensAPlacer.some((c) => c.doit_etre_isole);

  const clientIdFamille =
    chiensAPlacer.length > 0 &&
    chiensAPlacer.every((c) => c.client_id === chiensAPlacer[0].client_id)
      ? chiensAPlacer[0].client_id
      : null;

  const capaciteBox = (box: BoxCandidat, occupantsBox: LigneOccupation[]): number => {
    const occupantsAutreFamille = occupantsBox.filter(
      (o) => !memeFamille(clientIdFamille, o.chiens?.client_id)
    );
    if (clientIdFamille && occupantsAutreFamille.length === 0) {
      return capaciteMaxFamille([
        ...chiensAPlacer.map((c) => c.categorie_poids),
        ...occupantsBox.map((o) => o.chiens?.categorie_poids),
      ]);
    }
    return box.capacite_standard || 2;
  };

  const boxesOccupes = ((occupationsRaw ?? []) as unknown as LigneOccupation[]).filter((occ) =>
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

  // 2. Ententes « box_compatible », dans les deux sens.
  const { data: ententes } = await supabaseAdmin
    .from("ententes_chiens")
    .select("chien_id, chien_cible_id, type")
    .in("chien_id", chien_ids)
    .eq("type", "box_compatible");

  const { data: ententesinverses } = await supabaseAdmin
    .from("ententes_chiens")
    .select("chien_id, chien_cible_id, type")
    .in("chien_cible_id", chien_ids)
    .eq("type", "box_compatible");

  const tousAmis = [
    ...(ententes || []).map((e) => e.chien_cible_id),
    ...(ententesinverses || []).map((e) => e.chien_id),
  ];

  // 3. Box actifs — les box internes sont écartés sauf demande explicite.
  let requeteBoxes = supabaseAdmin
    .from("boxes")
    .select("id, numero, nom, capacite_standard, interne, proprietaire_client_id")
    .eq("actif", true);
  if (!inclureInternes) requeteBoxes = requeteBoxes.eq("interne", false);
  const { data: boxesActifs } = await requeteBoxes.order("numero");

  const { data: indisponibilites } = await supabaseAdmin
    .from("box_indisponibilites")
    .select("box_id")
    .lte("date_debut", date_fin)
    .gte("date_fin", date_debut);
  const boxesIndisponibles = new Set((indisponibilites ?? []).map((i) => i.box_id));

  const tousBoxes = (boxesActifs ?? []).filter((box) => !boxesIndisponibles.has(box.id));
  if (!tousBoxes.length) return { box_id: null, raison: null };

  const boxesUtilisables = tousBoxes.filter((box) => {
    const occupantsBox = boxesOccupes.filter((o) => o.box_id === box.id);
    const occupantIsole = occupantsBox.some((o) => o.chiens?.doit_etre_isole);
    return boxCompatibleAvecIsolement(occupantIsole, occupantsBox.length, placementIsole);
  });

  // 4. Un ami « box_compatible » déjà présent.
  for (const box of boxesUtilisables) {
    const occupantsBox = boxesOccupes.filter((o) => o.box_id === box.id);
    const chiensDansBox = occupantsBox.map((o) => o.chien_id);
    const capacite = capaciteBox(box, occupantsBox);
    const amiDansBox = chiensDansBox.some((id) => tousAmis.includes(id));
    const placeDispo = chiensDansBox.length + chien_ids.length <= capacite;

    if (amiDansBox && placeDispo) {
      return {
        box_id: box.id,
        raison: "box_compatible",
        message: `🏠 Un ami compatible est dans le ${formatBoxLabel(box)}`,
      };
    }
  }

  // 5. Un box vide.
  for (const box of boxesUtilisables) {
    const occupantsBox = boxesOccupes.filter((o) => o.box_id === box.id);
    if (occupantsBox.length === 0) {
      return { box_id: box.id, raison: "vide", message: `✅ ${formatBoxLabel(box)} disponible` };
    }
  }

  // 6. Un ami « ok ».
  const { data: entendesOk } = await supabaseAdmin
    .from("ententes_chiens")
    .select("chien_id, chien_cible_id")
    .in("chien_id", chien_ids)
    .eq("type", "ok");

  const amisOk = (entendesOk || []).map((e) => e.chien_cible_id);

  for (const box of boxesUtilisables) {
    const occupantsBox = boxesOccupes.filter((o) => o.box_id === box.id);
    const chiensDansBox = occupantsBox.map((o) => o.chien_id);
    const capacite = capaciteBox(box, occupantsBox);
    const amiOkDansBox = chiensDansBox.some((id) => amisOk.includes(id));
    const placeDispo = chiensDansBox.length + chien_ids.length <= capacite;

    if (amiOkDansBox && placeDispo) {
      return { box_id: box.id, raison: "ami_ok", message: `✅ Un ami est dans le ${formatBoxLabel(box)}` };
    }
  }

  return { box_id: null, raison: null, message: "Aucun box suggéré automatiquement" };
}

/**
 * Box INTERNES actifs et réellement libres sur la période, triés par numéro.
 * Sert à placer les chiens d'une fiche interne (cf. boxPourPersonnel).
 */
export async function boxesInternesLibres(entree: {
  date_debut: string;
  date_fin: string;
  heure_arrivee?: string | null;
  heure_depart?: string | null;
  type_reservation?: string | null;
}): Promise<{ id: string; proprietaire_client_id: string | null }[]> {
  const { date_debut, date_fin, heure_arrivee, heure_depart, type_reservation } = entree;

  const { data: boxes } = await supabaseAdmin
    .from("boxes")
    .select("id, numero, proprietaire_client_id")
    .eq("actif", true)
    .eq("interne", true)
    .order("numero");
  if (!boxes?.length) return [];

  const { data: occupations } = await supabaseAdmin
    .from("occupation_boxes")
    .select("box_id, date_debut, date_fin, reservations (heure_arrivee, heure_depart, type_reservation)")
    .lte("date_debut", date_fin)
    .gte("date_fin", date_debut);

  const { data: indisponibilites } = await supabaseAdmin
    .from("box_indisponibilites")
    .select("box_id")
    .lte("date_debut", date_fin)
    .gte("date_fin", date_debut);
  const indispo = new Set((indisponibilites ?? []).map((i) => i.box_id));

  const occupes = new Set(
    ((occupations ?? []) as unknown as LigneOccupation[])
      .filter((occ) =>
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
      )
      .map((occ) => occ.box_id)
  );

  return boxes
    .filter((b) => !indispo.has(b.id) && !occupes.has(b.id))
    .map((b) => ({ id: b.id, proprietaire_client_id: b.proprietaire_client_id }));
}

/**
 * Fiches internes dont le titulaire TRAVAILLE à la date D.
 * Le lien passe par employes_rh.profile_id = clients.auth_user_id.
 */
export async function fichesInternesQuiTravaillent(dateISO: string): Promise<Set<string>> {
  const presents = new Set<string>();

  const { data: lignes } = await supabaseAdmin
    .from("planning_employes")
    .select("employe_id")
    .eq("date", dateISO)
    .eq("statut", "travail");
  const employeIds = [...new Set((lignes ?? []).map((l) => l.employe_id).filter(Boolean))] as string[];
  if (employeIds.length === 0) return presents;

  const { data: employes } = await supabaseAdmin
    .from("employes_rh")
    .select("id, profile_id")
    .in("id", employeIds);
  const profileIds = (employes ?? []).map((e) => e.profile_id).filter(Boolean) as string[];
  if (profileIds.length === 0) return presents;

  const { data: fiches } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("interne", true)
    .in("auth_user_id", profileIds);

  for (const f of fiches ?? []) presents.add(f.id as string);
  return presents;
}
