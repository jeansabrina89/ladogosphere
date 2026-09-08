import Link from "next/link";
import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { createClient } from "@/src/utils/supabase/server";
import { formatDateFR } from "@/src/lib/dates";
import ExportCompta from "./ExportCompta";
import Statistiques from "./Statistiques";
import FiltresMois from "./FiltresMois";
import { montantDuReservation, resteAPayer as soldeReservation } from "@/src/lib/montants";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { compterDepensesSansJustificatif } from "@/src/lib/depenses";
import { equilibreGrandLivre } from "@/src/lib/equilibre";
import { Tuile, GrilleTuiles } from "@/app/components/ui/TuileChiffre";
import { clientsMembresAJour } from "@/src/lib/membre";
import { formatPeriodeCotisation } from "@/src/lib/cotisationPeriode";
import BadgeMembre from "@/app/components/BadgeMembre";
import NomClientLien from "@/app/components/NomClientLien";
import { anneesExercices } from "@/src/lib/exercices";
import { caDouzeMoisGlissants, lireParametresTva } from "@/src/lib/tva";
import { seuilSecondTaux } from "@/src/lib/decompteTvaLogique";
import { soldeTvaDue } from "@/src/lib/decompteTva";

export default async function ComptabilitePage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string; mois?: string }>;
}) {
  const supabase = await createClient();
  await exigerAdminPage();

  const params = await searchParams;
  // Les années proposées viennent de la table exercices, jamais d'une liste en dur.
  const anneesDisponibles = await anneesExercices();
  const annee = parseInt(params.annee || new Date().getFullYear().toString());
  const moisFiltre = params.mois ? parseInt(params.mois) : null;
  const anneePrec = annee - 1;

  // Toutes les réservations
  const { data: reservations } = await supabase
    .from("reservations")
    .select(`*, clients (prenom, nom, membre), boxes (numero), reservation_chiens (chiens (nom))`)
    .neq("statut", "annulee")
    .order("date_debut", { ascending: false });

  const idsAJourCompta = await clientsMembresAJour(supabase, (reservations ?? []).map((r: any) => r.client_id));

  // Cotisations encaissées pendant l'EXERCICE (année de date_paiement) — la
  // validité d'une cotisation étant désormais à cheval sur deux années civiles,
  // c'est la date d'encaissement qui rattache le produit à un exercice.
  const { data: cotisations } = await supabase
    .from("cotisations_membres")
    .select("*, clients(prenom, nom)")
    .eq("statut", "payee")
    .gte("date_paiement", `${annee}-01-01`)
    .lte("date_paiement", `${annee}-12-31`)
    .order("date_paiement", { ascending: false });

  // Boxes actives (pour le taux de remplissage réel)
  const { data: boxesActives } = await supabase
    .from("boxes")
    .select("id, capacite_standard")
    .eq("actif", true);

  const nbBoxes = boxesActives?.length ?? 0;
  const capaciteTotaleBoxes = boxesActives?.reduce((s, b) => s + Number(b.capacite_standard ?? 0), 0) ?? 0;

  // Occupations de l'année (box_id + chien_id pour les stats chiens et taux)
  const { data: occupations } = await supabase
    .from("occupation_boxes")
    .select("box_id, chien_id, date_debut, date_fin")
    .gte("date_fin", `${annee}-01-01`)
    .lte("date_debut", `${annee}-12-31`);

  // Chiens actifs (clientèle)
  const { count: nbChiensActifsCount } = await supabase
    .from("chiens")
    .select("id", { count: "exact", head: true })
    .eq("actif", true)
    .or("chien_decede.is.null,chien_decede.eq.false");
  const nbChiensActifs = nbChiensActifsCount ?? 0;

  // Dates du mois courant réel (pour la courbe journalière)
  const moisActuel = new Date().getMonth();
  const anneeActuelle = new Date().getFullYear();
  const nbJoursMoisActuel = new Date(anneeActuelle, moisActuel + 1, 0).getDate();
  const premierMoisCourant = `${anneeActuelle}-${String(moisActuel + 1).padStart(2, "0")}-01`;
  const dernierMoisCourant = `${anneeActuelle}-${String(moisActuel + 1).padStart(2, "0")}-${String(nbJoursMoisActuel).padStart(2, "0")}`;

  // Occupations du mois courant (pour la courbe journalière — toujours le mois réel)
  const { data: occupationsMoisCourant } = await supabase
    .from("occupation_boxes")
    .select("chien_id, date_debut, date_fin")
    .gte("date_fin", premierMoisCourant)
    .lte("date_debut", dernierMoisCourant);

  const moisLabels = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  const NB_BOXES = 12;

  const statsMois = moisLabels.map((label, idx) => {
    const moisNum = idx + 1;

    const moisStr = String(moisNum).padStart(2, "0");

    const resAnnee = reservations?.filter(r => {
      const parts = (r.date_debut ?? "").split("-");
      return parts[0] === String(annee) && parts[1] === moisStr;
    }) ?? [];

    const resAnneePrec = reservations?.filter(r => {
      const parts = (r.date_debut ?? "").split("-");
      return parts[0] === String(anneePrec) && parts[1] === moisStr;
    }) ?? [];

    // CA facturé : par date_debut, montant net définitif via helper
    const caFacture = resAnnee.reduce((s, r) => s + montantDuReservation(r), 0);
    const caPrec = resAnneePrec.reduce((s, r) => s + montantDuReservation(r), 0);

    // CA encaissé : par date_paiement
    const resEncaisseMois = reservations?.filter(r => {
      if (!r.date_paiement) return false;
      const parts = (r.date_paiement as string).split("-");
      return parts[0] === String(annee) && parts[1] === moisStr;
    }) ?? [];
    const caEncaisse = resEncaisseMois.reduce((s, r) => s + Number(r.montant_paye ?? 0), 0);

    // Cotisations du mois (par date_paiement)
    const cotisMois = cotisations?.filter(c => {
      if (!c.date_paiement) return false;
      const parts = (c.date_paiement as string).split("-");
      return parts[0] === String(annee) && parts[1] === moisStr;
    }) ?? [];
    const caCotis = cotisMois.reduce((s, c) => s + Number(c.montant), 0);

    const nbJoursMois = new Date(annee, moisNum, 0).getDate();
    const premier = `${annee}-${String(moisNum).padStart(2, "0")}-01`;
    const dernier = `${annee}-${String(moisNum).padStart(2, "0")}-${String(nbJoursMois).padStart(2, "0")}`;

    // Chiens distincts présents dans le mois (via occupation_boxes)
    const chiensDistincts = new Set<string>();
    for (const occ of occupations ?? []) {
      if (occ.date_debut <= dernier && occ.date_fin >= premier) {
        chiensDistincts.add(occ.chien_id);
      }
    }
    const nbChiens = chiensDistincts.size;

    // Taux de remplissage réel via occupation_boxes
    const boxJoursSet = new Set<string>();
    let chienJours = 0;
    for (const occ of occupations ?? []) {
      const debut = occ.date_debut > premier ? occ.date_debut : premier;
      const fin   = occ.date_fin   < dernier ? occ.date_fin   : dernier;
      if (debut > fin) continue;
      const d = new Date(debut + "T00:00:00Z");
      const fDate = new Date(fin + "T00:00:00Z");
      while (d <= fDate) {
        const jourISO = d.toISOString().split("T")[0];
        boxJoursSet.add(`${occ.box_id}|${jourISO}`);
        chienJours++;
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }
    const boxJoursOccupes = boxJoursSet.size;
    const tauxBox    = nbBoxes > 0             ? Math.round((boxJoursOccupes / (nbBoxes * nbJoursMois))             * 1000) / 10 : 0;
    const tauxPlaces = capaciteTotaleBoxes > 0 ? Math.round((chienJours      / (capaciteTotaleBoxes * nbJoursMois)) * 1000) / 10 : 0;

    return {
      mois: label,
      ca_facture: Math.round(caFacture * 100) / 100,
      ca_encaisse: Math.round(caEncaisse * 100) / 100,
      ca_annee_prec: Math.round(caPrec * 100) / 100,
      ca_cotisations: Math.round(caCotis * 100) / 100,
      ca_total: Math.round((caFacture + caCotis) * 100) / 100,
      nb_reservations: resAnnee.length,
      nb_chiens_total: nbChiens,
      taux_box: tauxBox,
      taux_places: tauxPlaces,
    };
  });

  const totalAnneeFacture = statsMois.reduce((s, m) => s + m.ca_facture, 0);
  const totalAnneeEncaisse = statsMois.reduce((s, m) => s + m.ca_encaisse, 0);
  const totalAnneePrec = statsMois.reduce((s, m) => s + m.ca_annee_prec, 0);
  const totalCotisations = statsMois.reduce((s, m) => s + m.ca_cotisations, 0);
  const totalEncaisse = totalAnneeEncaisse + totalCotisations;

  // Stats journalières (via occupation_boxes du mois courant)
  const statsJours = Array.from({ length: nbJoursMoisActuel }, (_, i) => {
    const jour = i + 1;
    const dateStr = `${anneeActuelle}-${String(moisActuel + 1).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
    const chiensJour = new Set<string>();
    for (const occ of occupationsMoisCourant ?? []) {
      if (occ.date_debut <= dateStr && occ.date_fin >= dateStr) {
        chiensJour.add(occ.chien_id);
      }
    }
    const nbChiensJour = chiensJour.size;
    return {
      jour: String(jour),
      nb_chiens: nbChiensJour,
      taux_remplissage: Math.min(100, Math.round(nbChiensJour / NB_BOXES * 100)),
    };
  });

  // Filtrer les réservations par mois si filtre actif
  const reservationsFiltrees = moisFiltre
    ? reservations?.filter(r => {
        const d = new Date(r.date_debut);
        return d.getFullYear() === annee && d.getMonth() + 1 === moisFiltre;
      })
    : reservations;

  const cotisationsFiltrees = moisFiltre
    ? cotisations?.filter(c => {
        if (!c.date_paiement) return false;
        const d = new Date(c.date_paiement);
        return d.getFullYear() === annee && d.getMonth() + 1 === moisFiltre;
      })
    : cotisations;

  // Totaux pour les cards (période = année + mois si filtre actif, toujours filtrées par année)
  const periodLabel = moisFiltre ? `${moisLabels[moisFiltre - 1]} ${annee}` : String(annee);

  const resPeriodeFacture = reservations?.filter(r => {
    const d = new Date(r.date_debut);
    return d.getFullYear() === annee && (!moisFiltre || d.getMonth() + 1 === moisFiltre);
  }) ?? [];

  const resPeriodeEncaisse = reservations?.filter(r => {
    if (!r.date_paiement) return false;
    const d = new Date(r.date_paiement);
    return d.getFullYear() === annee && (!moisFiltre || d.getMonth() + 1 === moisFiltre);
  }) ?? [];

  // montantDuReservation applique déjà l'ajustement manuel — et le montant final,
  // quand il existe, l'inclut déjà : l'ajouter à nouveau comptait le geste deux fois.
  const caFacturePeriode = resPeriodeFacture.reduce((s, r) => s + montantDuReservation(r), 0);
  const caEncaissePeriode = resPeriodeEncaisse.reduce((s, r) => s + Number(r.montant_paye ?? 0), 0);
  const totalCotisFiltrees = cotisationsFiltrees?.reduce((s, c) => s + Number(c.montant), 0) ?? 0;
  const totalEncaissePeriode = caEncaissePeriode + totalCotisFiltrees;
  const resteAPayer = caFacturePeriode - caEncaissePeriode;

  const nbPaye = reservationsFiltrees?.filter(r => r.statut_paiement === "paye").length ?? 0;
  const nbPartiel = reservationsFiltrees?.filter(r => r.statut_paiement === "partiel").length ?? 0;
  const nbImpaye = reservationsFiltrees?.filter(r => !r.statut_paiement || r.statut_paiement === "impaye").length ?? 0;

  // ── Les chiffres qui déclenchent une action ────────────────────────────────
  //
  // Ils sont en tête parce qu'ils appellent une décision aujourd'hui ; les
  // statistiques qui suivent racontent l'année, ce qui n'est pas la même chose.
  // Aucun calcul nouveau : « à encaisser » reprend exactement la règle de
  // l'écran À encaisser, et le contrôle des justificatifs celle des Rapports.
  const aujourdhui = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Zurich" });
  const moisCourant = aujourdhui.slice(0, 7);

  const aEncaisser = ((reservations ?? []) as any[])
    .filter((r) => {
      if (!r.date_fin || r.date_fin >= aujourdhui) return false;
      if (r.offerte) return false;
      if (["annulee", "refusee", "en_attente"].includes(r.statut)) return false;
      return soldeReservation(r) > 0.005;
    })
    .reduce((s, r) => s + soldeReservation(r), 0);

  const encaisseCeMois = ((reservations ?? []) as any[])
    .filter((r) => (r.date_paiement ?? "").startsWith(moisCourant))
    .reduce((s, r) => s + Number(r.montant_paye ?? 0), 0);

  const [{ data: facturesRetard }, sansJustificatif, ecartGrandLivre] = await Promise.all([
    supabaseAdmin
      .from("factures")
      .select("id, montant_restant, type, statut")
      .lt("date_echeance", aujourdhui)
      .gt("montant_restant", 0),
    compterDepensesSansJustificatif(annee),
    equilibreGrandLivre(),
  ]);

  // Le seuil des 10 % : une activité secondaire trop grosse appelle un second
  // taux de dette fiscale nette. On avertit — on ne bloque rien, et surtout on
  // n'invente aucun taux : c'est l'AFC qui l'attribue, sur demande.
  const [regimeTva, caGlissant, tvaDue] = await Promise.all([
    lireParametresTva(),
    caDouzeMoisGlissants(),
    soldeTvaDue(),
  ]);
  const seuilTva = regimeTva.assujettie
    ? seuilSecondTaux({
        caParSecteur: caGlissant,
        secondTauxDejaSaisi: (regimeTva.tauxTdfn2 ?? 0) > 0,
      })
    : null;

  const enRetard = ((facturesRetard ?? []) as any[])
    .filter((f) => f.type !== "avoir" && f.statut !== "annulee" && f.statut !== "annulee_par_avoir");
  const totalEnRetard = enRetard.reduce((s, f) => s + Number(f.montant_restant ?? 0), 0);

  const chfTuile = (n: number) => `${n.toFixed(2)} CHF`;

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-7xl mx-auto">

        <div className="flex justify-between items-start mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-4xl font-bold" style={{ color: "#1B2B5E" }}>📈 Comptabilité</h1>
            <p className="text-[rgba(27,43,94,0.55)] mt-1">Suivi des paiements et statistiques</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-white rounded-[18px] p-3 border border-[rgba(27,43,94,0.12)]">
              <label className="text-sm font-semibold" style={{ color: "#1B2B5E" }}>Année :</label>
              <div className="flex gap-1">
                {anneesDisponibles.map(a => (
                  <a key={a} href={`/comptabilite?annee=${a}`}
                    className="px-3 py-1 rounded-lg text-sm font-semibold transition"
                    style={{
                      backgroundColor: a === annee ? "#1B2B5E" : "#F5F0E8",
                      color: a === annee ? "white" : "#1B2B5E",
                    }}>
                    {a}
                  </a>
                ))}
              </div>
            </div>
            <ExportCompta annees={anneesDisponibles} />
            <Link href="/comptabilite/depenses" className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: "#8A6BA8" }}>💸 Dépenses</Link>
            <Link href="/comptabilite/fournisseurs" className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: "#6E7FA8" }}>🏢 Fournisseurs</Link>
            <a href="/comptabilite/journal" className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: "#1B2B5E" }}>📒 Journal comptable</a>
            <a href="/comptabilite/rapports" className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: "#2E8B7E" }}>📊 Rapports</a>
            <a href="/comptabilite/reconciliation" className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: "#C9A84C" }}>🔄 Réconciliation</a>
            <a href="/comptabilite/non-clotures" className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: "#E8847A" }}>⚠️ Non clôturés</a>
          </div>
        </div>

        <div className="mb-8">
          <GrilleTuiles etiquette="Les chiffres qui appellent une décision">
            <Tuile
              href="/comptabilite/a-regulariser"
              titre="À encaisser"
              valeur={chfTuile(aEncaisser)}
              detail={aEncaisser > 0 ? "Séjours terminés, pas encore réglés" : "Rien ne traîne"}
              couleur={aEncaisser > 0 ? "#A8453A" : "#1F6E5B"}
              alerte={aEncaisser > 0}
            />
            <Tuile
              href="/factures"
              titre="Factures en retard"
              valeur={chfTuile(totalEnRetard)}
              detail={`${enRetard.length} facture${enRetard.length > 1 ? "s" : ""} échue${enRetard.length > 1 ? "s" : ""}`}
              couleur={enRetard.length > 0 ? "#A8453A" : "#1F6E5B"}
              alerte={enRetard.length > 0}
            />
            <Tuile
              href="/comptabilite/relances"
              titre="Encaissé ce mois"
              valeur={chfTuile(encaisseCeMois)}
              detail="Séjours réglés depuis le 1er du mois"
            />
            <Tuile
              href="/comptabilite/depenses"
              titre="Dépenses sans justificatif"
              valeur={String(sansJustificatif)}
              detail={sansJustificatif > 0 ? "Une charge que rien ne prouve" : "Toutes justifiées"}
              couleur={sansJustificatif > 0 ? "#A8453A" : "#1F6E5B"}
              alerte={sansJustificatif > 0}
            />
            {/* En partie double, ce chiffre DOIT être zéro. */}
            <Tuile
              href="/comptabilite/journal"
              titre="Équilibre du grand-livre"
              valeur={chfTuile(ecartGrandLivre)}
              detail={ecartGrandLivre === 0 ? "Débits et crédits se répondent" : "Écart à comprendre avant tout le reste"}
              couleur={ecartGrandLivre === 0 ? "#1F6E5B" : "#A8453A"}
              alerte={ecartGrandLivre !== 0}
            />
            {regimeTva.assujettie && (
              <Tuile
                href="/comptabilite/tva"
                titre="TVA due à l&apos;AFC"
                valeur={chfTuile(tvaDue)}
                detail={tvaDue > 0 ? "Décomptes déclarés non encore payés" : "Rien à verser"}
                couleur={tvaDue > 0 ? "#C9A84C" : "#1F6E5B"}
              />
            )}
          </GrilleTuiles>
        </div>

        {/* L&apos;alerte du second taux : un avertissement, jamais un blocage. */}
        {seuilTva?.message && (
          <div className="mb-8 rounded-[18px] p-4"
            style={{ backgroundColor: "#F4EAC9", border: "1px solid #C9A84C" }}>
            <p role="status" className="font-semibold" style={{ color: "#6E5410", margin: 0 }}>
              ⚠️ {seuilTva.message}
            </p>
            <p className="text-sm mt-1" style={{ color: "rgba(110,84,16,0.85)", margin: "4px 0 0" }}>
              Douze mois glissants. En attendant, tout le chiffre d&apos;affaires est
              décompté au taux du secteur 1 —{" "}
              <Link href="/reglages/tva" className="font-bold underline">
                Réglages → TVA
              </Link>
              .
            </p>
          </div>
        )}

        {/* Statistiques */}
        <Statistiques
          statsMois={statsMois}
          statsJours={statsJours}
          annee={annee}
          totalAnneeFacture={totalAnneeFacture}
          totalAnneeEncaisse={totalAnneeEncaisse}
          totalAnneePrec={totalAnneePrec}
          totalCotisations={totalCotisations}
          totalEncaisse={totalEncaisse}
          nbChiensActifs={nbChiensActifs}
        />

        {/* Résumé paiements — période filtrée */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 my-8">
          <div className="bg-white rounded-[18px] p-6 border border-[rgba(27,43,94,0.12)] text-center">
            <p className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>{caFacturePeriode.toFixed(2)} CHF</p>
            <p className="text-[rgba(27,43,94,0.55)] text-sm mt-1">CA facturé (prestations)</p>
            <p className="text-xs text-[rgba(27,43,94,0.45)]">{periodLabel}</p>
          </div>
          <div className="bg-white rounded-[18px] p-6 border border-[rgba(27,43,94,0.12)] text-center">
            <p className="text-2xl font-bold text-green-600">{caEncaissePeriode.toFixed(2)} CHF</p>
            <p className="text-[rgba(27,43,94,0.55)] text-sm mt-1">CA encaissé (prestations)</p>
            <p className="text-xs text-[rgba(27,43,94,0.45)]">{periodLabel}</p>
          </div>
          <div className="bg-white rounded-[18px] p-6 border border-[rgba(27,43,94,0.12)] text-center">
            <p className="text-2xl font-bold" style={{ color: "#4AAEA0" }}>{totalCotisFiltrees.toFixed(2)} CHF</p>
            <p className="text-[rgba(27,43,94,0.55)] text-sm mt-1">⭐ Adhésions encaissées</p>
            <p className="text-xs text-[rgba(27,43,94,0.45)]">{periodLabel}</p>
          </div>
          <div className="bg-white rounded-[18px] p-6 border border-[rgba(27,43,94,0.12)] text-center">
            <p className="text-2xl font-bold" style={{ color: "#C9A84C" }}>{totalEncaissePeriode.toFixed(2)} CHF</p>
            <p className="text-[rgba(27,43,94,0.55)] text-sm mt-1">💰 Total encaissé</p>
            <p className="text-xs text-[rgba(27,43,94,0.45)]">{periodLabel}</p>
          </div>
          <div className="bg-white rounded-[18px] p-6 border border-[rgba(27,43,94,0.12)] text-center">
            <p className="text-2xl font-bold text-red-600">{resteAPayer.toFixed(2)} CHF</p>
            <p className="text-[rgba(27,43,94,0.55)] text-sm mt-1">Reste à encaisser</p>
            <p className="text-xs text-[rgba(27,43,94,0.45)]">{periodLabel}</p>
          </div>
        </div>
        <p className="text-xs text-[rgba(27,43,94,0.45)] -mt-6 mb-6">
          Facturé = prestations dues sur la période (par date de séjour). Encaissé = montants perçus (par date de paiement).
        </p>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-[18px] p-4 border border-[rgba(27,43,94,0.12)] text-center">
            <p className="text-2xl font-bold text-green-600">{nbPaye}</p>
            <p className="text-[rgba(27,43,94,0.55)] text-sm">✅ Payées</p>
          </div>
          <div className="bg-white rounded-[18px] p-4 border border-[rgba(27,43,94,0.12)] text-center">
            <p className="text-2xl font-bold text-orange-500">{nbPartiel}</p>
            <p className="text-[rgba(27,43,94,0.55)] text-sm">⚠️ Partielles</p>
          </div>
          <div className="bg-white rounded-[18px] p-4 border border-[rgba(27,43,94,0.12)] text-center">
            <p className="text-2xl font-bold text-red-600">{nbImpaye}</p>
            <p className="text-[rgba(27,43,94,0.55)] text-sm">❌ Impayées</p>
          </div>
        </div>

        {/* Filtre par mois */}
        <FiltresMois annee={annee} moisActif={moisFiltre} />

        {/* Liste détaillée réservations */}
        <div className="bg-white rounded-[18px] border border-[rgba(27,43,94,0.12)] overflow-hidden mb-6">
          <div className="px-6 py-4 border-b" style={{ backgroundColor: "#F5F0E8" }}>
            <h2 className="font-bold" style={{ color: "#1B2B5E" }}>
              📅 Réservations {moisFiltre ? `— ${moisLabels[moisFiltre - 1]} ${annee}` : "— toutes"}
              <span className="ml-2 text-sm font-normal text-[rgba(27,43,94,0.55)]">
                ({reservationsFiltrees?.length ?? 0} réservation(s))
              </span>
            </h2>
          </div>
          <table className="min-w-full">
            <thead>
              <tr style={{ backgroundColor: "#1B2B5E" }}>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Client</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Dates</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Chien(s)</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-white">Facturé</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-white">Payé</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-white">Reste</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-white">Mode</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-white">Statut</th>
              </tr>
            </thead>
            <tbody>
              {reservationsFiltrees?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-[rgba(27,43,94,0.45)] text-sm">
                    Aucune réservation pour ce mois.
                  </td>
                </tr>
              )}
              {reservationsFiltrees?.map((res: any, idx) => {
                const chiens = res.reservation_chiens?.map((rc: any) => rc.chiens?.nom).filter(Boolean).join(", ") || "—";
                const reste = (res.montant_final || 0) - (res.montant_paye || 0);
                return (
                  <tr key={res.id}
                    className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}
                    style={{ borderBottom: "1px solid #E2E8F0" }}>
                    <td className="px-4 py-3 text-sm font-semibold" style={{ color: "#1B2B5E" }}>
                      <NomClientLien id={res.client_id} prenom={res.clients?.prenom} nom={res.clients?.nom} />
                      <BadgeMembre membre={!!res.clients?.membre} aJour={idsAJourCompta.has(res.client_id)} compact />
                    </td>
                    <td className="px-4 py-3 text-sm text-[rgba(27,43,94,0.55)]">
                      {formatDateFR(res.date_debut)} → {formatDateFR(res.date_fin)}
                    </td>
                    <td className="px-4 py-3 text-sm text-[rgba(27,43,94,0.55)]">{chiens}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold" style={{ color: "#1B2B5E" }}>
                      {res.montant_final ? `${res.montant_final} CHF` : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-green-600 font-semibold">
                      {res.montant_paye ? `${res.montant_paye} CHF` : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold"
                      style={{ color: reste > 0 ? "#DC2626" : "#16A34A" }}>
                      {res.montant_final ? `${reste.toFixed(2)} CHF` : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-[rgba(27,43,94,0.55)] capitalize">
                      {res.mode_paiement || "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        res.statut_paiement === "paye" ? "bg-green-100 text-green-700" :
                        res.statut_paiement === "partiel" ? "bg-orange-100 text-orange-700" :
                        "bg-red-100 text-red-700"
                      }`}>
                        {res.statut_paiement === "paye" ? "✅ Payé" :
                         res.statut_paiement === "partiel" ? "⚠️ Partiel" :
                         "❌ Impayé"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Liste cotisations */}
        {cotisationsFiltrees && cotisationsFiltrees.length > 0 && (
          <div className="bg-white rounded-[18px] border border-[rgba(27,43,94,0.12)] overflow-hidden">
            <div className="px-6 py-4 border-b" style={{ backgroundColor: "#F5F0E8" }}>
              <h2 className="font-bold" style={{ color: "#1B2B5E" }}>
                ⭐ Adhésions membres {moisFiltre ? `— ${moisLabels[moisFiltre - 1]} ${annee}` : `— ${annee}`}
                <span className="ml-2 text-sm font-normal text-[rgba(27,43,94,0.55)]">
                  ({cotisationsFiltrees.length} adhésion(s) — {totalCotisFiltrees.toFixed(2)} CHF)
                </span>
              </h2>
            </div>
            <table className="min-w-full">
              <thead>
                <tr style={{ backgroundColor: "#1B2B5E" }}>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">Client</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">Date paiement</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">Validité</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">Mode</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-white">Montant</th>
                </tr>
              </thead>
              <tbody>
                {cotisationsFiltrees.map((c: any, idx) => (
                  <tr key={c.id}
                    className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}
                    style={{ borderBottom: "1px solid #E2E8F0" }}>
                    <td className="px-4 py-3 text-sm font-semibold" style={{ color: "#1B2B5E" }}>
                      <NomClientLien id={c.client_id} prenom={c.clients?.prenom} nom={c.clients?.nom} /> ⭐
                    </td>
                    <td className="px-4 py-3 text-sm text-[rgba(27,43,94,0.55)]">
                      {c.date_paiement ? formatDateFR(c.date_paiement) : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-[rgba(27,43,94,0.55)] whitespace-nowrap">
                      {formatPeriodeCotisation(c.date_debut, c.date_fin)}
                    </td>
                    <td className="px-4 py-3 text-sm text-[rgba(27,43,94,0.55)] capitalize">
                      {c.mode_paiement === "cash" ? "💵 Cash" :
                       c.mode_paiement === "virement" ? "🏦 Virement" :
                       c.mode_paiement === "prochaine_resa" ? "📅 Réservation" : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: "#4AAEA0" }}>
                      {Number(c.montant).toFixed(2)} CHF
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </main>
  );
}