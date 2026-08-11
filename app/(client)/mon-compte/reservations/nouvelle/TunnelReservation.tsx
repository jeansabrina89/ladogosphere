"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDateFR } from "@/src/lib/dates";
import {
  creerDemandeReservation,
  type Occurrence,
} from "@/app/(client)/mon-compte/reservations/actions";
import { calculerMontant } from "@/src/lib/calculTarif";
import { MESSAGE_ADHESION_REQUISE } from "@/src/lib/membre";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import BoutonDemanderAdhesion from "@/app/components/BoutonDemanderAdhesion";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChienTunnel = {
  id: string;
  nom: string;
  race: string | null;
  poids: number | null;
  categorie_poids: string | null;
  journee_essai_effectuee: boolean;
  journee_essai_invalide: boolean;
};

export type TarifLite = {
  categorie: string;
  membre: boolean;
  prix: string;
  annee: number;
};

type Branche = "essai" | "complete";
type EtapeId =
  | "chiens"
  | "perimetre_essai"
  | "decouverte"
  | "formule"
  | "dates"
  | "frequence"
  | "recap";
type DureeRec = "1mois" | "3mois" | "6mois";

const ETAPE_LABELS: Record<EtapeId, string> = {
  chiens: "Chien(s)",
  perimetre_essai: "Périmètre",
  decouverte: "Jour d'essai",
  formule: "Formule",
  dates: "Dates",
  frequence: "Fréquence",
  recap: "Récapitulatif",
};

// ─── Créneaux horaires ────────────────────────────────────────────────────────

function genCreneaux(debut: string, fin: string): string[] {
  const res: string[] = [];
  let [h, m] = debut.split(":").map(Number);
  const [fH, fM] = fin.split(":").map(Number);
  while (h < fH || (h === fH && m <= fM)) {
    res.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += 15;
    if (m >= 60) { m -= 60; h++; }
  }
  return res;
}

const CR_ARR_JOURNEE = ["07:35", "07:45", "08:00", "08:15", "08:30", "08:45", "09:00", "09:15", "09:30", "09:45", "10:00"];
const CR_ARR_SEJOUR  = genCreneaux("09:00", "10:00");
const CR_DEP_STD     = genCreneaux("17:00", "18:00");
const CR_DEP_SEJOUR  = [...genCreneaux("09:00", "10:00"), ...genCreneaux("17:00", "18:00")];

const JOURS_LV = [
  { v: 1, l: "Lundi" }, { v: 2, l: "Mardi" }, { v: 3, l: "Mercredi" },
  { v: 4, l: "Jeudi" }, { v: 5, l: "Vendredi" },
];
const JOURS_ALL = [
  ...JOURS_LV,
  { v: 6, l: "Samedi" }, { v: 0, l: "Dimanche" },
];

const JOURS_ENTETE = ["L", "M", "M", "J", "V", "S", "D"];
const MOIS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function fmtDate(annee: number, mois: number, jour: number): string {
  return `${annee}-${String(mois + 1).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

// ─── Génération d'occurrences régulières ─────────────────────────────────────

function genOccurrencesRegulieres({
  formule, dateDebut, jourSemaine, jourArrivee, jourDepart,
  duree, exclusions, invalide,
}: {
  formule: "journee" | "sejour";
  dateDebut: string;
  jourSemaine: number;
  jourArrivee: number;
  jourDepart: number;
  duree: DureeRec;
  exclusions: string[];
  invalide: (d: string) => boolean;
}): Occurrence[] {
  const res: Occurrence[] = [];
  const debut = new Date(dateDebut + "T12:00:00");
  const nbMois = duree === "1mois" ? 1 : duree === "3mois" ? 3 : 6;
  const fin = new Date(debut);
  fin.setMonth(fin.getMonth() + nbMois);
  const cur = new Date(debut);

  if (formule === "journee") {
    while (cur.getDay() !== jourSemaine) cur.setDate(cur.getDate() + 1);
    while (cur <= fin) {
      const ds = cur.toISOString().split("T")[0];
      if (!exclusions.includes(ds) && !invalide(ds))
        res.push({ date_debut: ds, date_fin: ds });
      cur.setDate(cur.getDate() + 7);
    }
  } else {
    while (cur.getDay() !== jourArrivee) cur.setDate(cur.getDate() + 1);
    while (cur <= fin) {
      const dA = cur.toISOString().split("T")[0];
      const dep = new Date(cur);
      let diff = jourDepart - jourArrivee;
      if (diff <= 0) diff += 7;
      dep.setDate(dep.getDate() + diff);
      const dD = dep.toISOString().split("T")[0];
      if (!exclusions.includes(dA)) res.push({ date_debut: dA, date_fin: dD });
      cur.setDate(cur.getDate() + 7);
    }
  }
  return res;
}

// ─── Styles helpers ───────────────────────────────────────────────────────────

const S = {
  card: {
    backgroundColor: "#fff",
    border: "1px solid rgba(27,43,94,0.12)",
    borderRadius: 18,
    padding: 24,
  } as React.CSSProperties,

  titre: {
    fontFamily: "Georgia, 'Times New Roman', serif",
    color: "#1B2B5E",
    fontSize: 20,
    fontWeight: 700,
    margin: "0 0 6px",
  } as React.CSSProperties,

  sousTitre: {
    color: "rgba(27,43,94,0.6)",
    fontSize: 14,
    margin: "0 0 20px",
  } as React.CSSProperties,

  label: {
    color: "#1B2B5E",
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 6,
    display: "block",
  } as React.CSSProperties,

  input: {
    width: "100%",
    border: "1px solid rgba(27,43,94,0.2)",
    borderRadius: 12,
    padding: "12px 16px",
    fontSize: 15,
    color: "#1B2B5E",
    backgroundColor: "#fff",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,

  erreur: {
    backgroundColor: "#FBE2DE",
    color: "#A8453A",
    borderRadius: 12,
    padding: "12px 16px",
    marginBottom: 16,
    fontSize: 14,
  } as React.CSSProperties,

  info: {
    backgroundColor: "#E8F5F4",
    border: "1px solid #4AAEA0",
    borderRadius: 12,
    padding: "12px 16px",
    fontSize: 13,
    color: "#1B2B5E",
  } as React.CSSProperties,

  recapRow: {
    backgroundColor: "#F5F0E8",
    borderRadius: 12,
    padding: "14px 16px",
  } as React.CSSProperties,
};

function cardSelectStyle(selected: boolean, couleur: "rose" | "teal"): React.CSSProperties {
  const C = {
    rose: { border: "#E8847A", bg: "#FBE2DE" },
    teal: { border: "#4AAEA0", bg: "#DBEFEA" },
  }[couleur];
  return {
    border: selected ? `2px solid ${C.border}` : "2px solid rgba(27,43,94,0.12)",
    backgroundColor: selected ? C.bg : "#fff",
    borderRadius: 14,
    padding: "16px 20px",
    cursor: "pointer",
    transition: "all 0.15s",
    display: "flex",
    alignItems: "center",
    gap: 12,
    minHeight: 60,
    textAlign: "left" as const,
    width: "100%",
  };
}

// ─── Calendrier maison (grise les jours indisponibles) ────────────────────────

function CalendrierSelecteur({
  valeur,
  minDate,
  estIndisponible,
  onSelect,
}: {
  valeur: string;
  minDate: string;
  estIndisponible: (ds: string) => boolean;
  onSelect: (ds: string) => void;
}) {
  const base = valeur || minDate;
  const baseD = new Date(base + "T12:00:00");
  const [vue, setVue] = useState<{ annee: number; mois: number }>({
    annee: baseD.getFullYear(),
    mois: baseD.getMonth(),
  });

  const premierJour = new Date(vue.annee, vue.mois, 1);
  const decalage = (premierJour.getDay() + 6) % 7; // Lundi = 0
  const nbJours = new Date(vue.annee, vue.mois + 1, 0).getDate();

  const minD = new Date(minDate + "T12:00:00");
  const moisMin = new Date(minD.getFullYear(), minD.getMonth(), 1);
  const moisVue = new Date(vue.annee, vue.mois, 1);
  const peutReculer = moisVue > moisMin;

  const cellules: (number | null)[] = [
    ...Array(decalage).fill(null),
    ...Array.from({ length: nbJours }, (_, i) => i + 1),
  ];

  function changerMois(delta: number) {
    setVue((v) => {
      const d = new Date(v.annee, v.mois + delta, 1);
      return { annee: d.getFullYear(), mois: d.getMonth() };
    });
  }

  const btnNav = (actif: boolean): React.CSSProperties => ({
    width: 36, height: 36, borderRadius: 10,
    border: "1px solid rgba(27,43,94,0.15)", backgroundColor: "#fff",
    cursor: actif ? "pointer" : "not-allowed",
    color: actif ? "#1B2B5E" : "rgba(27,43,94,0.25)",
    fontSize: 18, lineHeight: 1,
  });

  return (
    <div style={{ border: "1px solid rgba(27,43,94,0.15)", borderRadius: 14, padding: 14, backgroundColor: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button type="button" aria-label="Mois précédent" disabled={!peutReculer}
          onClick={() => peutReculer && changerMois(-1)} style={btnNav(peutReculer)}>‹</button>
        <span style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700, color: "#1B2B5E", fontSize: 15 }}>
          {MOIS_FR[vue.mois]} {vue.annee}
        </span>
        <button type="button" aria-label="Mois suivant"
          onClick={() => changerMois(1)} style={btnNav(true)}>›</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {JOURS_ENTETE.map((j, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "rgba(27,43,94,0.4)", padding: "4px 0" }}>
            {j}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cellules.map((jour, i) => {
          if (jour === null) return <div key={`v${i}`} />;
          const ds = fmtDate(vue.annee, vue.mois, jour);
          const passe = ds < minDate;
          const indispo = passe || estIndisponible(ds);
          const selectionne = ds === valeur;
          return (
            <button
              key={ds}
              type="button"
              disabled={indispo}
              onClick={() => !indispo && onSelect(ds)}
              style={{
                height: 42,
                borderRadius: 10,
                border: selectionne ? "2px solid #2E8B7E" : "1px solid transparent",
                backgroundColor: selectionne ? "#DBEFEA" : indispo ? "transparent" : "#F5F0E8",
                color: selectionne ? "#1F6E5B" : indispo ? "rgba(27,43,94,0.22)" : "#1B2B5E",
                fontWeight: selectionne ? 700 : 500,
                fontSize: 14,
                cursor: indispo ? "not-allowed" : "pointer",
                textDecoration: indispo && !passe ? "line-through" : "none",
              }}
            >
              {jour}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function TunnelReservation({
  chiens,
  tarifs,
  estMembre,
  estExempte,
  montantCotisation,
}: {
  chiens: ChienTunnel[];
  tarifs: TarifLite[];
  estMembre: boolean;
  estExempte: boolean;
  montantCotisation: number;
}) {

  // Navigation
  const [etape, setEtape] = useState<EtapeId>("chiens");
  const [branche, setBranche] = useState<Branche | null>(null);
  const [confirmation, setConfirmation] = useState(false);

  // Étape 1 — chiens
  const [chienIdsSelectionnes, setChienIdsSelectionnes] = useState<string[]>([]);

  // Branche essai
  const [chienIdsEssai, setChienIdsEssai] = useState<string[]>([]);
  const [perimetreEssai, setPerimetreEssai] = useState<"tous" | "seulement">("tous");
  const [dateEssai, setDateEssai] = useState("");
  const [heureDepartEssai, setHeureDepartEssai] = useState("");

  // Branche complète
  const [formule, setFormule] = useState<"sejour" | "journee" | null>(null);
  const [dateArrivee, setDateArrivee] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [heureArrivee, setHeureArrivee] = useState("");
  const [heureDepart, setHeureDepart] = useState("");
  const [modeFreq, setModeFreq] = useState<"ponctuelle" | "reguliere">("ponctuelle");
  const [dateDebutRec, setDateDebutRec] = useState("");
  const [jourSemaine, setJourSemaine] = useState(1);
  const [jourArriveeRec, setJourArriveeRec] = useState(3);
  const [jourDepartRec, setJourDepartRec] = useState(4);
  const [dureeRec, setDureeRec] = useState<DureeRec>("1mois");
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [exclusionInput, setExclusionInput] = useState("");

  // Commun
  const [commentaire, setCommentaire] = useState("");
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);

  // Disponibilités
  const [joursFeries, setJoursFeries] = useState<string[]>([]);
  const [datesPleine, setDatesPleine] = useState<string[]>([]);
  const [datesFermees, setDatesFermees] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/dates-indisponibles?annee=${new Date().getFullYear()}`)
      .then(r => r.json())
      .then(d => {
        setJoursFeries(d.jours_feries ?? []);
        setDatesPleine(d.dates_pleines ?? []);
        setDatesFermees(d.dates_fermees ?? []);
      })
      .catch(() => {});
  }, []);

  // ─── Valeurs dérivées ───────────────────────────────────────────────────────

  const demain = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  })();

  const estDateInvalide = useCallback((ds: string, pourEssai = false) => {
    if (!ds) return false;
    // Garderie & séjour : ouverts tous les jours de l'année (aucune restriction).
    // Seules les journées d'essai sont restreintes (weekend, fériés, jours pleins/fermés).
    if (!pourEssai) return false;
    const jour = new Date(ds + "T12:00:00").getDay();
    if (jour === 0 || jour === 6) return true;
    if (joursFeries.includes(ds)) return true;
    if (datesPleine.includes(ds)) return true;
    if (datesFermees.includes(ds)) return true;
    return false;
  }, [joursFeries, datesPleine, datesFermees]);

  const chiensDisponibles = chiens.filter(c => !(c.journee_essai_effectuee && c.journee_essai_invalide));
  const chiensRefuses = chiens.filter(c => c.journee_essai_effectuee && c.journee_essai_invalide);
  const chiensSelectionnes = chiensDisponibles.filter(c => chienIdsSelectionnes.includes(c.id));
  const chiensNonValidesSelectionnes = chiensSelectionnes.filter(c => !c.journee_essai_effectuee);
  const chiensValidesSelectionnes = chiensSelectionnes.filter(c => c.journee_essai_effectuee && !c.journee_essai_invalide);
  const estMixte = chiensNonValidesSelectionnes.length > 0 && chiensValidesSelectionnes.length > 0;

  // Adhésion obligatoire pour réserver une journée/séjour (branche "complete").
  // La journée d'essai (branche "essai") reste toujours autorisée.
  const adhesionRequise = branche === "complete" && !estMembre && !estExempte;

  const etapes: EtapeId[] = branche === "essai"
    ? (estMixte
        ? ["chiens", "perimetre_essai", "decouverte", "recap"]
        : ["chiens", "decouverte", "recap"])
    : branche === "complete"
    ? ["chiens", "formule", "dates", "frequence", "recap"]
    : ["chiens"];

  const stepIndex = etapes.indexOf(etape);
  const totalSteps = etapes.length;

  const occurrencesRegulieres = (branche === "complete" && modeFreq === "reguliere" && formule && dateDebutRec)
    ? genOccurrencesRegulieres({
        formule,
        dateDebut: dateDebutRec,
        jourSemaine,
        jourArrivee: jourArriveeRec,
        jourDepart: jourDepartRec,
        duree: dureeRec,
        exclusions,
        invalide: (d) => estDateInvalide(d, false),
      })
    : [];

  // ─── Estimation indicative de prix ──────────────────────────────────────────

  function tarifsPourAnnee(annee: number): TarifLite[] {
    const exact = tarifs.filter(t => t.annee === annee);
    if (exact.length) return exact;
    const annees = [...new Set(tarifs.map(t => t.annee))].sort((a, b) => a - b);
    if (annees.length === 0) return [];
    const inf = annees.filter(a => a <= annee).pop();
    const choisie = inf ?? annees[0];
    return tarifs.filter(t => t.annee === choisie);
  }

  const anneeDe = (ds: string) => new Date(ds + "T12:00:00").getFullYear();

  let estimation: number | null = null;
  if (tarifs.length > 0) {
    if (branche === "essai" && dateEssai && chienIdsEssai.length > 0) {
      estimation = calculerMontant({
        tarifs: tarifsPourAnnee(anneeDe(dateEssai)),
        type_reservation: "essai",
        nb_chiens: chienIdsEssai.length,
        est_membre: estMembre,
        est_urgence: false,
        est_privatif: false,
        date_debut: dateEssai,
        date_fin: dateEssai,
        heure_arrivee: "10:00",
        heure_depart: heureDepartEssai || null,
      });
    } else if (branche === "complete" && formule && chiensSelectionnes.length > 0) {
      const occ: Occurrence[] = modeFreq === "reguliere"
        ? occurrencesRegulieres
        : (dateArrivee ? [{ date_debut: dateArrivee, date_fin: formule === "journee" ? dateArrivee : dateFin }] : []);
      const completes = occ.filter(o => o.date_debut && (formule === "journee" || o.date_fin));
      if (completes.length > 0) {
        estimation = completes.reduce((total, o) => total + calculerMontant({
          tarifs: tarifsPourAnnee(anneeDe(o.date_debut)),
          type_reservation: formule,
          nb_chiens: chiensSelectionnes.length,
          est_membre: estMembre,
          est_urgence: false,
          est_privatif: false,
          date_debut: o.date_debut,
          date_fin: o.date_fin || o.date_debut,
          heure_arrivee: heureArrivee || null,
          heure_depart: heureDepart || null,
        }), 0);
      }
    }
  }

  // ─── Navigation ─────────────────────────────────────────────────────────────

  function allerPrecedent() {
    setErreur("");
    const idx = etapes.indexOf(etape);
    if (idx > 0) {
      const prev = etapes[idx - 1];
      setEtape(prev);
      if (prev === "chiens") setBranche(null);
    }
  }

  function allerSuivant() {
    setErreur("");

    if (etape === "chiens") {
      if (chienIdsSelectionnes.length === 0) {
        setErreur("Sélectionne au moins un chien.");
        return;
      }
      const hasNonValide = chiensSelectionnes.some(c => !c.journee_essai_effectuee);
      if (hasNonValide) {
        setBranche("essai");
        setChienIdsEssai(chienIdsSelectionnes);
        setPerimetreEssai("tous");
        setEtape(estMixte ? "perimetre_essai" : "decouverte");
      } else {
        setBranche("complete");
        setEtape("formule");
      }
      return;
    }

    if (etape === "perimetre_essai") {
      setEtape("decouverte");
      return;
    }

    if (etape === "decouverte") {
      if (!dateEssai) { setErreur("Choisis une date."); return; }
      if (estDateInvalide(dateEssai, true)) {
        setErreur(
          joursFeries.includes(dateEssai) ? "Ce jour est férié en Valais."
          : datesPleine.includes(dateEssai) ? "Toutes les places sont prises ce jour."
          : datesFermees.includes(dateEssai) ? "Les journées d'essai sont fermées ce jour."
          : "Les weekends ne sont pas disponibles."
        );
        return;
      }
      if (!heureDepartEssai) { setErreur("Choisis une heure de départ."); return; }
      setEtape("recap");
      return;
    }

    if (etape === "formule") {
      if (!formule) { setErreur("Choisis une formule."); return; }
      setEtape("dates");
      return;
    }

    if (etape === "dates") {
      if (!dateArrivee) { setErreur("Choisis une date d'arrivée."); return; }
      if (formule === "sejour") {
        if (!dateFin) { setErreur("Choisis une date de départ."); return; }
        if (dateFin <= dateArrivee) { setErreur("La date de départ doit être après l'arrivée."); return; }
      }
      if (!heureArrivee) { setErreur("Choisis une heure d'arrivée."); return; }
      if (!heureDepart) { setErreur("Choisis une heure de départ."); return; }
      setEtape("frequence");
      return;
    }

    if (etape === "frequence") {
      if (modeFreq === "reguliere") {
        if (!dateDebutRec) { setErreur("Choisis une date de début."); return; }
        if (occurrencesRegulieres.length === 0) { setErreur("Aucune occurrence générée. Vérifie les paramètres."); return; }
      }
      setEtape("recap");
      return;
    }
  }

  // ─── Soumission ──────────────────────────────────────────────────────────────

  async function soumettre() {
    setErreur("");

    if (adhesionRequise) {
      setErreur(MESSAGE_ADHESION_REQUISE);
      return;
    }

    setChargement(true);

    let input: Parameters<typeof creerDemandeReservation>[0];

    if (branche === "essai") {
      input = {
        chien_ids: chienIdsEssai,
        type_reservation: "essai",
        occurrences: [{ date_debut: dateEssai, date_fin: dateEssai }],
        heure_arrivee: "10:00",
        heure_depart: heureDepartEssai,
        commentaire_client: commentaire || null,
      };
    } else {
      const occurrences: Occurrence[] =
        modeFreq === "reguliere"
          ? occurrencesRegulieres
          : [{ date_debut: dateArrivee, date_fin: formule === "journee" ? dateArrivee : dateFin }];

      input = {
        chien_ids: chienIdsSelectionnes,
        type_reservation: formule!,
        occurrences,
        heure_arrivee: heureArrivee,
        heure_depart: heureDepart,
        commentaire_client: commentaire || null,
      };
    }

    const resultat = await creerDemandeReservation(input);
    setChargement(false);

    if (resultat.ok) {
      setConfirmation(true);
    } else {
      setErreur(resultat.erreur);
    }
  }

  // ─── Blocs réutilisables ──────────────────────────────────────────────────────

  function renderErreur() {
    if (!erreur) return null;
    return <div style={S.erreur}>{erreur}</div>;
  }

  function renderNavFooter(onNext?: () => void, label = "Suivant →", disabled = false) {
    return (
      <div style={{ display: "flex", gap: 12, paddingTop: 24, flexWrap: "wrap" as const }}>
        {etape !== "chiens" && (
          <Bouton variante="discret" onClick={allerPrecedent} type="button">
            ← Précédent
          </Bouton>
        )}
        <Bouton variante="principal" onClick={onNext ?? allerSuivant} disabled={disabled} type="button">
          {label}
        </Bouton>
      </div>
    );
  }

  // ─── Barre de progression ─────────────────────────────────────────────────────

  function renderProgressBar() {
    const pct = ((stepIndex + 1) / totalSteps) * 100;
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ color: "rgba(27,43,94,0.5)", fontSize: 12 }}>
            Étape {stepIndex + 1} / {totalSteps}
          </span>
          <span style={{ color: "rgba(27,43,94,0.5)", fontSize: 12 }}>
            {ETAPE_LABELS[etape]}
          </span>
        </div>
        <div style={{ height: 5, backgroundColor: "#DBEFEA", borderRadius: 99 }}>
          <div style={{
            height: 5, width: `${pct}%`, backgroundColor: "#4AAEA0",
            borderRadius: 99, transition: "width 0.3s ease",
          }} />
        </div>
      </div>
    );
  }

  // ─── Écran de confirmation ─────────────────────────────────────────────────────

  if (confirmation) {
    return (
      <div style={S.card}>
        <EtatVide
          icone="✅"
          titre="Demande envoyée !"
          message="Notre équipe va traiter votre demande et vous confirmera sous 24 heures."
          action={<Bouton variante="principal" href="/mon-compte/reservations">Voir mes réservations</Bouton>}
        />
      </div>
    );
  }

  // ─── Étape 1 : Chiens ─────────────────────────────────────────────────────────

  function renderChiens() {
    return (
      <>
        <p style={S.titre}>Pour quel(s) chien(s) ?</p>
        <p style={S.sousTitre}>Sélectionne le ou les chiens qui viendront.</p>
        {renderErreur()}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {chiensRefuses.map(c => (
            <div key={c.id} style={{ ...cardSelectStyle(false, "rose"), opacity: 0.45, cursor: "not-allowed" }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>❌</span>
              <div>
                <p style={{ margin: 0, fontWeight: 600, color: "#1B2B5E", fontSize: 15 }}>{c.nom}</p>
                <p style={{ margin: 0, fontSize: 12, color: "rgba(27,43,94,0.5)" }}>Non admis après l'essai</p>
              </div>
            </div>
          ))}

          {chiensDisponibles.map(c => {
            const selected = chienIdsSelectionnes.includes(c.id);
            const needsEssai = !c.journee_essai_effectuee;
            return (
              <button
                key={c.id}
                type="button"
                style={cardSelectStyle(selected, "rose")}
                onClick={() => setChienIdsSelectionnes(prev =>
                  selected ? prev.filter(id => id !== c.id) : [...prev, c.id]
                )}
              >
                <span style={{ fontSize: 24, flexShrink: 0 }}>{needsEssai ? "🧪" : "🐾"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, color: "#1B2B5E", fontSize: 15 }}>{c.nom}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "rgba(27,43,94,0.5)" }}>
                    {[c.race, c.poids ? `${c.poids} kg` : null, needsEssai ? "🧪 Essai requis" : "✓ Validé"].filter(Boolean).join(" • ")}
                  </p>
                </div>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                  border: selected ? "2px solid #E8847A" : "2px solid rgba(27,43,94,0.2)",
                  backgroundColor: selected ? "#E8847A" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {selected && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
                </div>
              </button>
            );
          })}
        </div>

        {renderNavFooter()}
      </>
    );
  }

  // ─── Étape essai : périmètre (mixte) ──────────────────────────────────────────

  function renderPerimetreEssai() {
    const nonValides = chiensSelectionnes.filter(c => !c.journee_essai_effectuee);
    return (
      <>
        <p style={S.titre}>Qui participe à l'essai ?</p>
        <p style={S.sousTitre}>Certains chiens sélectionnés ont déjà validé leur journée d'essai.</p>
        {renderErreur()}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button type="button"
            style={cardSelectStyle(perimetreEssai === "tous", "rose")}
            onClick={() => { setPerimetreEssai("tous"); setChienIdsEssai(chienIdsSelectionnes); }}
          >
            <span style={{ fontSize: 22, flexShrink: 0 }}>🐾</span>
            <div>
              <p style={{ margin: 0, fontWeight: 600, color: "#1B2B5E", fontSize: 15 }}>Journée d'essai pour tous</p>
              <p style={{ margin: 0, fontSize: 12, color: "rgba(27,43,94,0.5)" }}>
                {chiensSelectionnes.map(c => c.nom).join(", ")}
              </p>
            </div>
          </button>

          <button type="button"
            style={cardSelectStyle(perimetreEssai === "seulement", "rose")}
            onClick={() => { setPerimetreEssai("seulement"); setChienIdsEssai(nonValides.map(c => c.id)); }}
          >
            <span style={{ fontSize: 22, flexShrink: 0 }}>🧪</span>
            <div>
              <p style={{ margin: 0, fontWeight: 600, color: "#1B2B5E", fontSize: 15 }}>Seulement ceux qui doivent la faire</p>
              <p style={{ margin: 0, fontSize: 12, color: "rgba(27,43,94,0.5)" }}>
                {nonValides.map(c => c.nom).join(", ")}
              </p>
            </div>
          </button>
        </div>

        {renderNavFooter()}
      </>
    );
  }

  // ─── Étape essai : date + heure ───────────────────────────────────────────────

  function renderDecouverte() {
    return (
      <>
        <p style={S.titre}>Jour de la découverte</p>
        <p style={S.sousTitre}>Lundi au vendredi, hors jours fériés valaisans.</p>
        {renderErreur()}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={S.label}>Date *</label>
            <CalendrierSelecteur
              valeur={dateEssai}
              minDate={demain}
              estIndisponible={(ds) => estDateInvalide(ds, true)}
              onSelect={(ds) => { setErreur(""); setDateEssai(ds); }}
            />
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "rgba(27,43,94,0.5)" }}>
              Les jours barrés (week-ends, fériés, fermetures) ne sont pas disponibles.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={S.label}>Heure d'arrivée</label>
              <div style={{ ...S.input, backgroundColor: "#F5F0E8", color: "rgba(27,43,94,0.5)" }}>
                10:00 (fixe)
              </div>
            </div>
            <div>
              <label style={S.label}>Heure de départ *</label>
              <select style={{ ...S.input, appearance: "none" as const }} value={heureDepartEssai}
                onChange={e => setHeureDepartEssai(e.target.value)}>
                <option value="">— Choisir —</option>
                {CR_DEP_STD.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          <div style={S.info}>
            🧪 Arrivée à 10h00 • Départ entre 17h et 18h<br />
            Votre demande sera confirmée sous 24 heures.
          </div>
        </div>

        {renderNavFooter()}
      </>
    );
  }

  // ─── Étape complète : formule ─────────────────────────────────────────────────

  function renderFormule() {
    return (
      <>
        <p style={S.titre}>Quelle formule ?</p>
        <p style={S.sousTitre}>Choisis le type de séjour pour tes chiens.</p>
        {renderErreur()}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button type="button" style={cardSelectStyle(formule === "sejour", "teal")} onClick={() => setFormule("sejour")}>
            <span style={{ fontSize: 28, flexShrink: 0 }}>🏠</span>
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: "#1B2B5E", fontSize: 16 }}>Pension</p>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(27,43,94,0.5)" }}>Hébergement sur plusieurs jours</p>
            </div>
          </button>
          <button type="button" style={cardSelectStyle(formule === "journee", "teal")} onClick={() => setFormule("journee")}>
            <span style={{ fontSize: 28, flexShrink: 0 }}>☀️</span>
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: "#1B2B5E", fontSize: 16 }}>Garderie</p>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(27,43,94,0.5)" }}>Journée sur place, retour le soir</p>
            </div>
          </button>
        </div>

        {renderNavFooter()}
      </>
    );
  }

  // ─── Étape complète : dates + heures ─────────────────────────────────────────

  function renderDates() {
    const crArrivee = formule === "journee" ? CR_ARR_JOURNEE : CR_ARR_SEJOUR;
    const crDepart  = formule === "sejour"  ? CR_DEP_SEJOUR  : CR_DEP_STD;

    return (
      <>
        <p style={S.titre}>{formule === "sejour" ? "Dates du séjour" : "Date de la journée"}</p>
        <p style={S.sousTitre}>
          {formule === "sejour" ? "Arrivée et départ, tous les jours de l'année." : "Tous les jours de l'année."}
        </p>
        {renderErreur()}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: formule === "sejour" ? "1fr 1fr" : "1fr", gap: 12 }}>
            <div>
              <label style={S.label}>{formule === "sejour" ? "Date d'arrivée *" : "Date *"}</label>
              <input type="date" style={S.input} min={demain} value={dateArrivee}
                onChange={e => {
                  const v = e.target.value;
                  setErreur("");
                  setDateArrivee(v);
                  if (formule === "journee") setDateFin(v);
                }}
              />
            </div>
            {formule === "sejour" && (
              <div>
                <label style={S.label}>Date de départ *</label>
                <input type="date" style={S.input} min={dateArrivee || demain} value={dateFin}
                  onChange={e => setDateFin(e.target.value)}
                />
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={S.label}>
                Heure d'arrivée *
                <span style={{ fontWeight: 400, fontSize: 11, color: "rgba(27,43,94,0.4)", marginLeft: 4 }}>
                  {formule === "journee" ? "(7h35–10h)" : "(9h–10h)"}
                </span>
              </label>
              <select style={{ ...S.input, appearance: "none" as const }} value={heureArrivee}
                onChange={e => setHeureArrivee(e.target.value)}>
                <option value="">— Choisir —</option>
                {crArrivee.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>
                Heure de départ *
                <span style={{ fontWeight: 400, fontSize: 11, color: "rgba(27,43,94,0.4)", marginLeft: 4 }}>
                  {formule === "sejour" ? "(9h–10h ou 17h–18h)" : "(17h–18h)"}
                </span>
              </label>
              <select style={{ ...S.input, appearance: "none" as const }} value={heureDepart}
                onChange={e => setHeureDepart(e.target.value)}>
                <option value="">— Choisir —</option>
                {crDepart.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>
        </div>

        {renderNavFooter()}
      </>
    );
  }

  // ─── Étape complète : fréquence ───────────────────────────────────────────────

  function renderFrequence() {
    return (
      <>
        <p style={S.titre}>Fréquence</p>
        <p style={S.sousTitre}>Une seule fois ou à répéter régulièrement ?</p>
        {renderErreur()}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {(["ponctuelle", "reguliere"] as const).map(mode => (
              <button key={mode} type="button"
                style={cardSelectStyle(modeFreq === mode, "teal")}
                onClick={() => setModeFreq(mode)}
              >
                <span style={{ fontSize: 22, flexShrink: 0 }}>{mode === "ponctuelle" ? "📅" : "🔁"}</span>
                <p style={{ margin: 0, fontWeight: 600, color: "#1B2B5E", fontSize: 15 }}>
                  {mode === "ponctuelle" ? "Ponctuelle" : "Régulière"}
                </p>
              </button>
            ))}
          </div>

          {modeFreq === "reguliere" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, borderTop: "1px solid rgba(27,43,94,0.08)", paddingTop: 16 }}>
              <div>
                <label style={S.label}>À partir du *</label>
                <input type="date" style={S.input} min={demain} value={dateDebutRec}
                  onChange={e => setDateDebutRec(e.target.value)} />
              </div>

              {formule === "journee" && (
                <div>
                  <label style={S.label}>Chaque *</label>
                  <select style={{ ...S.input, appearance: "none" as const }} value={jourSemaine}
                    onChange={e => setJourSemaine(parseInt(e.target.value))}>
                    {JOURS_ALL.map(j => <option key={j.v} value={j.v}>{j.l}</option>)}
                  </select>
                </div>
              )}

              {formule === "sejour" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={S.label}>Arrivée chaque *</label>
                    <select style={{ ...S.input, appearance: "none" as const }} value={jourArriveeRec}
                      onChange={e => setJourArriveeRec(parseInt(e.target.value))}>
                      {JOURS_ALL.map(j => <option key={j.v} value={j.v}>{j.l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Départ chaque *</label>
                    <select style={{ ...S.input, appearance: "none" as const }} value={jourDepartRec}
                      onChange={e => setJourDepartRec(parseInt(e.target.value))}>
                      {JOURS_ALL.map(j => <option key={j.v} value={j.v}>{j.l}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label style={S.label}>Durée *</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                  {(["1mois", "3mois", "6mois"] as const).map(d => (
                    <button key={d} type="button" onClick={() => setDureeRec(d)}
                      style={{
                        padding: "10px 18px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer",
                        border: `2px solid ${dureeRec === d ? "#4AAEA0" : "rgba(27,43,94,0.15)"}`,
                        backgroundColor: dureeRec === d ? "#DBEFEA" : "#fff",
                        color: dureeRec === d ? "#1F6E5B" : "#1B2B5E",
                      }}>
                      {d === "1mois" ? "1 mois" : d === "3mois" ? "3 mois" : "6 mois"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={S.label}>Dates à exclure (optionnel)</label>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input type="date" style={{ ...S.input, flex: 1 }} value={exclusionInput}
                    onChange={e => setExclusionInput(e.target.value)} />
                  <button type="button"
                    onClick={() => {
                      if (exclusionInput && !exclusions.includes(exclusionInput)) {
                        setExclusions(prev => [...prev, exclusionInput]);
                        setExclusionInput("");
                      }
                    }}
                    style={{
                      padding: "12px 14px", borderRadius: 12, backgroundColor: "#FBE2DE",
                      color: "#A8453A", fontWeight: 600, fontSize: 14, border: "none",
                      cursor: "pointer", whiteSpace: "nowrap" as const,
                    }}>
                    ➕ Exclure
                  </button>
                </div>
                {exclusions.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
                    {exclusions.map(d => (
                      <span key={d} style={{
                        display: "flex", alignItems: "center", gap: 4,
                        backgroundColor: "#FBE2DE", color: "#A8453A",
                        padding: "4px 10px", borderRadius: 8, fontSize: 12,
                      }}>
                        {formatDateFR(d)}
                        <button type="button" onClick={() => setExclusions(prev => prev.filter(x => x !== d))}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#A8453A", padding: 0, lineHeight: 1 }}>
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {occurrencesRegulieres.length > 0 && (
                <div style={{ backgroundColor: "#E8F5F4", borderRadius: 12, padding: "12px 16px" }}>
                  <p style={{ margin: "0 0 8px", fontWeight: 600, color: "#1B2B5E", fontSize: 13 }}>
                    📋 Aperçu — {occurrencesRegulieres.length} demande(s)
                  </p>
                  <div style={{ maxHeight: 140, overflowY: "auto" as const, display: "flex", flexDirection: "column" as const, gap: 3 }}>
                    {occurrencesRegulieres.map((occ, i) => (
                      <p key={i} style={{ margin: 0, fontSize: 12, color: "#1B2B5E" }}>
                        {formatDateFR(occ.date_debut)}
                        {occ.date_debut !== occ.date_fin ? ` → ${formatDateFR(occ.date_fin)}` : ""}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {renderNavFooter()}
      </>
    );
  }

  // ─── Récapitulatif ────────────────────────────────────────────────────────────

  function renderRecap() {
    const chiensNoms = branche === "essai"
      ? chiens.filter(c => chienIdsEssai.includes(c.id)).map(c => c.nom).join(", ")
      : chiens.filter(c => chienIdsSelectionnes.includes(c.id)).map(c => c.nom).join(", ");

    const nbOcc = (branche === "complete" && modeFreq === "reguliere")
      ? occurrencesRegulieres.length
      : 1;

    let datesLabel = "";
    if (branche === "essai") {
      datesLabel = `${formatDateFR(dateEssai)} • Arrivée 10:00 • Départ ${heureDepartEssai}`;
    } else if (modeFreq === "reguliere") {
      const dureeLabel = dureeRec === "1mois" ? "1 mois" : dureeRec === "3mois" ? "3 mois" : "6 mois";
      datesLabel = `À partir du ${formatDateFR(dateDebutRec)} • ${dureeLabel} • ${nbOcc} demande(s)`;
    } else {
      datesLabel = formatDateFR(dateArrivee);
      if (formule === "sejour" && dateFin) datesLabel += ` → ${formatDateFR(dateFin)}`;
      datesLabel += ` • ${heureArrivee} – ${heureDepart}`;
    }

    const sendLabel = chargement
      ? "Envoi en cours..."
      : nbOcc > 1
      ? `Envoyer ${nbOcc} demande(s)`
      : "Envoyer la demande";

    const captionEstim = branche === "essai"
      ? "Tarif journée d'essai. Le montant définitif est confirmé par notre équipe."
      : "Tarif membre, hébergement partagé. Le montant définitif est confirmé par notre équipe lors de la validation.";

    return (
      <>
        <p style={S.titre}>Récapitulatif</p>
        <p style={S.sousTitre}>Vérifie ta demande avant de l'envoyer.</p>
        {renderErreur()}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          <div style={S.recapRow}>
            <p style={{ margin: "0 0 3px", fontSize: 11, color: "rgba(27,43,94,0.45)", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Chien(s)</p>
            <p style={{ margin: 0, fontWeight: 600, color: "#1B2B5E", fontSize: 15 }}>{chiensNoms}</p>
          </div>

          <div style={S.recapRow}>
            <p style={{ margin: "0 0 3px", fontSize: 11, color: "rgba(27,43,94,0.45)", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Type</p>
            <p style={{ margin: 0, fontWeight: 600, color: "#1B2B5E", fontSize: 15 }}>
              {branche === "essai" ? "🧪 Journée d'essai" : formule === "sejour" ? "🏠 Pension" : "☀️ Garderie"}
            </p>
          </div>

          <div style={S.recapRow}>
            <p style={{ margin: "0 0 3px", fontSize: 11, color: "rgba(27,43,94,0.45)", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Date(s)</p>
            <p style={{ margin: 0, fontWeight: 600, color: "#1B2B5E", fontSize: 15 }}>{datesLabel}</p>
          </div>

          {estimation !== null ? (
            <div style={{ backgroundColor: "#F4EAC9", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 13, color: "#6E5410", fontWeight: 600 }}>
                  {nbOcc > 1 ? `Estimation indicative (${nbOcc} dates)` : "Estimation indicative"}
                </span>
                <span style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 20, fontWeight: 700, color: "#6E5410", whiteSpace: "nowrap" as const }}>
                  CHF {estimation.toFixed(2)}
                </span>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "#6E5410", opacity: 0.85, lineHeight: 1.4 }}>
                {captionEstim}
              </p>
            </div>
          ) : (
            <div style={{ ...S.recapRow, backgroundColor: "#F4EAC9" }}>
              <p style={{ margin: 0, fontSize: 13, color: "#6E5410" }}>
                💬 Le tarif sera confirmé par notre équipe lors de la validation de ta demande.
              </p>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={S.label}>Message / remarques (optionnel)</label>
          <textarea rows={3}
            placeholder="Informations particulières, demandes spéciales..."
            style={{ ...S.input, resize: "vertical" as const }}
            value={commentaire}
            onChange={e => setCommentaire(e.target.value)}
          />
        </div>

        {adhesionRequise ? (
          <div style={{
            backgroundColor: "#FBF3DC", border: "1px solid #C9A84C",
            borderRadius: 12, padding: "16px 18px",
          }}>
            <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#6E5410", fontSize: 15 }}>
              ⭐ Adhésion requise
            </p>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6E5410", lineHeight: 1.5 }}>
              {MESSAGE_ADHESION_REQUISE} La journée d&apos;essai reste possible sans adhésion.
            </p>
            <BoutonDemanderAdhesion montant={montantCotisation} />
            <div style={{ marginTop: 12 }}>
              <Bouton variante="discret" onClick={allerPrecedent} type="button">
                ← Précédent
              </Bouton>
            </div>
          </div>
        ) : (
          renderNavFooter(soumettre, sendLabel, chargement)
        )}
      </>
    );
  }

  // ─── Render principal ─────────────────────────────────────────────────────────

  return (
    <div>
      {renderProgressBar()}
      <div style={S.card}>
        {etape === "chiens"         && renderChiens()}
        {etape === "perimetre_essai" && renderPerimetreEssai()}
        {etape === "decouverte"     && renderDecouverte()}
        {etape === "formule"        && renderFormule()}
        {etape === "dates"          && renderDates()}
        {etape === "frequence"      && renderFrequence()}
        {etape === "recap"          && renderRecap()}
      </div>
    </div>
  );
}
