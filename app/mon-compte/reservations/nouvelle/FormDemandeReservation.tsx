"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Chien = {
  id: string;
  nom: string;
  race: string;
  poids: number;
  categorie_poids: string;
  journee_essai_effectuee: boolean;
  journee_essai_invalide: boolean;
};

const JOURS_SEMAINE = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 0, label: "Dimanche" },
];

function genererCreneaux(heureDebut: string, heureFin: string): string[] {
  const creneaux: string[] = [];
  const [hD, mD] = heureDebut.split(":").map(Number);
  const [hF, mF] = heureFin.split(":").map(Number);
  let h = hD, m = mD;
  while (h < hF || (h === hF && m <= mF)) {
    creneaux.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += 15;
    if (m >= 60) { m -= 60; h++; }
  }
  return creneaux;
}

const creneauxArriveeJournee = genererCreneaux("07:35", "10:00");
const creneauxArriveeSeJour = genererCreneaux("09:00", "10:00");
const creneauxDepartSejour = [...genererCreneaux("09:00", "10:00"), ...genererCreneaux("17:00", "18:00")];
const creneauxDepart = genererCreneaux("17:00", "18:00");

export default function FormDemandeReservation({
  client_id,
  chiens,
  est_membre,
  acces_complet,
}: {
  client_id: string;
  chiens: Chien[];
  est_membre: boolean;
  acces_complet: boolean;
}) {
  const [type, setType] = useState(acces_complet ? "journee" : "essai");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [heureArrivee, setHeureArrivee] = useState(type === "essai" ? "10:00" : "");
  const [heureDepart, setHeureDepart] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [joursFeries, setJoursFeries] = useState<string[]>([]);
  const [datesPleine, setDatesPleine] = useState<string[]>([]);

  // Récurrence
  const [estRecurrente, setEstRecurrente] = useState(false);
  const [jourRecurrence, setJourRecurrence] = useState<number>(1);
  const [dureeRecurrence, setDureeRecurrence] = useState<"1mois" | "3mois" | "6mois">("1mois");
  const [dateDebutRecurrence, setDateDebutRecurrence] = useState("");
  const [jourArrivee, setJourArrivee] = useState<number>(3);
  const [jourDepart, setJourDepart] = useState<number>(4);
  const [datesExclues, setDatesExclues] = useState<string[]>([]);
  const [dateExclueInput, setDateExclueInput] = useState("");
  const [apercu, setApercu] = useState<string[]>([]);

  const [chienIdsSelectionnes, setChienIdsSelectionnes] = useState<string[]>([]);

  const router = useRouter();

  const chiensInvalides = chiens.filter(c => c.journee_essai_invalide);
  const chiensDisponibles = chiens.filter(c => !c.journee_essai_invalide);

  const chiensSelectionnes = chiens.filter(c => chienIdsSelectionnes.includes(c.id));
  const chiensNonEligiblesSejour = chiensSelectionnes.filter(c => !c.journee_essai_effectuee);
  const tousEligiblesSejour = chiensSelectionnes.length > 0 && chiensNonEligiblesSejour.length === 0;
  // Tant qu'aucun chien n'est sélectionné, on se base sur l'accès global du client
  const afficherChoixComplet = chienIdsSelectionnes.length > 0 ? tousEligiblesSejour : acces_complet;

  useEffect(() => {
    const annee = new Date().getFullYear();
    fetch(`/api/dates-indisponibles?annee=${annee}`)
      .then(r => r.json())
      .then(data => {
        setJoursFeries(data.jours_feries || []);
        setDatesPleine(data.dates_pleines || []);
      });
  }, []);

  const estDateInvalide = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const date = new Date(dateStr + "T12:00:00");
    const jour = date.getDay();
    if (jour === 0 || jour === 6) return true;
    if (joursFeries.includes(dateStr)) return true;
    if (type === "essai" && datesPleine.includes(dateStr)) return true;
    return false;
  };

  const genererDates = (): string[] => {
    if (!dateDebutRecurrence) return [];
    const dates: string[] = [];
    const debut = new Date(dateDebutRecurrence + "T12:00:00");
    const nbMois = dureeRecurrence === "1mois" ? 1 : dureeRecurrence === "3mois" ? 3 : 6;
    const fin = new Date(debut);
    fin.setMonth(fin.getMonth() + nbMois);
    const current = new Date(debut);

    if (type === "journee") {
      while (current.getDay() !== jourRecurrence) {
        current.setDate(current.getDate() + 1);
      }
      while (current <= fin) {
        const dateStr = current.toISOString().split("T")[0];
        if (!datesExclues.includes(dateStr) && !estDateInvalide(dateStr)) {
          dates.push(dateStr);
        }
        current.setDate(current.getDate() + 7);
      }
    } else if (type === "sejour") {
      while (current.getDay() !== jourArrivee) {
        current.setDate(current.getDate() + 1);
      }
      while (current <= fin) {
        const dateArriveeStr = current.toISOString().split("T")[0];
        const depart = new Date(current);
        let diff = jourDepart - jourArrivee;
        if (diff <= 0) diff += 7;
        depart.setDate(depart.getDate() + diff);
        const dateDepartStr = depart.toISOString().split("T")[0];
        if (!datesExclues.includes(dateArriveeStr)) {
          dates.push(`${dateArriveeStr}→${dateDepartStr}`);
        }
        current.setDate(current.getDate() + 7);
      }
    }
    return dates;
  };

  useEffect(() => {
    if (estRecurrente && dateDebutRecurrence) {
      setApercu(genererDates());
    }
  }, [estRecurrente, jourRecurrence, jourArrivee, jourDepart, dureeRecurrence, dateDebutRecurrence, datesExclues, type]);

  const handleTypeChange = (val: string) => {
    setType(val);
    setDateDebut("");
    setDateFin("");
    setEstRecurrente(false);
    if (val === "essai") {
      setHeureArrivee("10:00");
    } else {
      setHeureArrivee("");
    }
  };

  // Si la sélection de chiens ne permet plus le séjour, on retombe sur la journée d'essai
  useEffect(() => {
    if (!afficherChoixComplet && type !== "essai") {
      handleTypeChange("essai");
    }
  }, [afficherChoixComplet]);

  const handleDateDebutChange = (val: string) => {
    if (estDateInvalide(val)) {
      setError(
        joursFeries.includes(val) ? "Ce jour est férié en Valais." :
        new Date(val + "T12:00:00").getDay() === 0 || new Date(val + "T12:00:00").getDay() === 6
          ? "Les weekends ne sont pas disponibles." :
          "Toutes les places sont prises ce jour."
      );
      return;
    }
    setError("");
    setDateDebut(val);
    if (type === "journee" || type === "essai") setDateFin(val);
  };

  const creneauxArrivee = type === "journee"
    ? creneauxArriveeJournee
    : type === "sejour"
    ? creneauxArriveeSeJour
    : ["10:00"];

  const creneauxDepartActuels = type === "sejour" ? creneauxDepartSejour : creneauxDepart;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Mode récurrent
    if (estRecurrente) {
      const dates = genererDates();
      if (dates.length === 0) {
        setError("Aucune date générée. Vérifiez les paramètres.");
        setLoading(false);
        return;
      }

      if (!confirm(`Envoyer ${dates.length} demande(s) de réservation récurrente(s) ?`)) {
        setLoading(false);
        return;
      }

      const form = e.currentTarget;
      const formData = new FormData(form);
      const chienIds = formData.getAll("chien_ids") as string[];
      const commentaire = formData.get("commentaire_client") as string;

      let nbCreees = 0;
      for (const dateStr of dates) {
        const fd = new FormData();
        fd.set("client_id", client_id);
        fd.set("type_reservation", type);
        fd.set("heure_arrivee", heureArrivee || "");
        fd.set("heure_depart", heureDepart || "");
        fd.set("commentaire_client", commentaire || "");
        chienIds.forEach(id => fd.append("chien_ids", id));

        if (type === "journee") {
          fd.set("date_debut", dateStr);
          fd.set("date_fin", dateStr);
        } else if (type === "sejour") {
          const [dDebut, dFin] = dateStr.split("→");
          fd.set("date_debut", dDebut);
          fd.set("date_fin", dFin);
        }

        const response = await fetch("/api/reservations/client", {
          method: "POST",
          body: fd,
        });
        if (response.ok) nbCreees++;
      }

      router.push("/mon-compte/reservations");
      router.refresh();
      return;
    }

    // Mode normal
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("client_id", client_id);
    if (type === "journee" || type === "essai") formData.set("date_fin", dateDebut);

    const response = await fetch("/api/reservations/client", {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      router.push("/mon-compte/reservations");
      router.refresh();
    } else {
      const data = await response.json();
      setError(data.error || "Une erreur est survenue.");
      setLoading(false);
    }
  };

  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  const dateMin = demain.toISOString().split("T")[0];

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {error && (
        <div className="bg-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {chiensInvalides.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          ⚠️ {chiensInvalides.map(c => c.nom).join(", ")} — journée d'essai invalide.
        </div>
      )}

      {/* Type */}
      <div>
        <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
          Type de réservation *
        </label>
        {afficherChoixComplet ? (
          <select name="type_reservation" required
            value={type} onChange={e => handleTypeChange(e.target.value)}
            className="w-full border rounded-xl p-3">
            <option value="journee">Journée</option>
            <option value="sejour">Séjour</option>
            <option value="essai">🧪 Journée d'essai</option>
          </select>
        ) : (
          <>
            <input type="hidden" name="type_reservation" value="essai" />
            <div className="border rounded-xl p-3 bg-blue-50 text-sm" style={{ color: "#1B2B5E" }}>
              🧪 Journée d'essai
            </div>
            {chiensNonEligiblesSejour.length > 0 ? (
              <p className="text-xs text-gray-500 mt-1">
                ℹ️ {chiensNonEligiblesSejour.map(c => c.nom).join(", ")}{" "}
                {chiensNonEligiblesSejour.length > 1 ? "doivent" : "doit"} d'abord effectuer
                {chiensNonEligiblesSejour.length > 1 ? " leur" : " sa"} journée d'essai pour accéder au séjour.
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                ℹ️ Tous vos chiens doivent effectuer une journée d'essai avant de pouvoir réserver.
              </p>
            )}
          </>
        )}
      </div>

      {/* Chiens */}
      <div>
        <label className="block font-semibold mb-2" style={{ color: "#1B2B5E" }}>
          Chien(s) *
        </label>
        {chiensDisponibles.length === 0 ? (
          <p className="text-gray-400 text-sm">
            Aucun chien disponible.{" "}
            <a href="/mon-compte/chiens/nouveau" style={{ color: "#4AAEA0" }}>
              Ajouter un chien →
            </a>
          </p>
        ) : (
          <div className="border rounded-xl p-3 space-y-2">
            {chiensDisponibles.map(c => (
              <label key={c.id} className="flex items-center gap-2">
                <input type="checkbox" name="chien_ids" value={c.id}
                  checked={chienIdsSelectionnes.includes(c.id)}
                  onChange={e => {
                    setChienIdsSelectionnes(prev =>
                      e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id)
                    );
                  }} />
                <span className="text-sm">
                  {c.nom} — {c.race || "—"} —{" "}
                  {c.poids ? `${c.poids} kg` : "?"} —{" "}
                  {c.categorie_poids === "moins_15kg" ? "🟢 Petit" :
                   c.categorie_poids === "15_30kg" ? "🟡 Moyen" :
                   c.categorie_poids === "30_40kg" ? "🔴 Grand" : "—"}
                  {c.journee_essai_effectuee && <span className="ml-1 text-green-600">✅</span>}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Option récurrence — seulement pour journée et séjour avec accès complet */}
      {afficherChoixComplet && (type === "journee" || type === "sejour") && (
        <div className="border-2 rounded-xl p-4"
          style={{ borderColor: estRecurrente ? "#4AAEA0" : "#E2E8F0", backgroundColor: estRecurrente ? "#E8F5F4" : "white" }}>
          <label className="flex items-center gap-2 cursor-pointer mb-3">
            <input type="checkbox" checked={estRecurrente}
              onChange={e => setEstRecurrente(e.target.checked)} />
            <span className="font-semibold" style={{ color: "#1B2B5E" }}>
              🔁 Réservation récurrente
            </span>
          </label>

          {estRecurrente && (
            <div className="space-y-4">

              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                  À partir du *
                </label>
                <input type="date" value={dateDebutRecurrence}
                  min={dateMin}
                  onChange={e => setDateDebutRecurrence(e.target.value)}
                  className="w-full border rounded-xl p-2 text-sm" />
              </div>

              {type === "journee" && (
                <div>
                  <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                    Chaque *
                  </label>
                  <select value={jourRecurrence}
                    onChange={e => setJourRecurrence(parseInt(e.target.value))}
                    className="w-full border rounded-xl p-2 text-sm">
                    {JOURS_SEMAINE.map(j => (
                      <option key={j.value} value={j.value}>{j.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {type === "sejour" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                      Arrivée chaque *
                    </label>
                    <select value={jourArrivee}
                      onChange={e => setJourArrivee(parseInt(e.target.value))}
                      className="w-full border rounded-xl p-2 text-sm">
                      {JOURS_SEMAINE.map(j => (
                        <option key={j.value} value={j.value}>{j.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                      Départ chaque *
                    </label>
                    <select value={jourDepart}
                      onChange={e => setJourDepart(parseInt(e.target.value))}
                      className="w-full border rounded-xl p-2 text-sm">
                      {JOURS_SEMAINE.map(j => (
                        <option key={j.value} value={j.value}>{j.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                  Durée *
                </label>
                <div className="flex gap-2">
                  {(["1mois", "3mois", "6mois"] as const).map(d => (
                    <button key={d} type="button"
                      onClick={() => setDureeRecurrence(d)}
                      className="px-4 py-2 rounded-xl text-sm font-semibold border-2 transition"
                      style={{
                        backgroundColor: dureeRecurrence === d ? "#4AAEA0" : "white",
                        borderColor: dureeRecurrence === d ? "#4AAEA0" : "#E2E8F0",
                        color: dureeRecurrence === d ? "white" : "#1B2B5E",
                      }}>
                      {d === "1mois" ? "1 mois" : d === "3mois" ? "3 mois" : "6 mois"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dates exclues */}
              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                  Dates à exclure (optionnel)
                </label>
                <div className="flex gap-2 mb-2">
                  <input type="date" value={dateExclueInput}
                    onChange={e => setDateExclueInput(e.target.value)}
                    className="border rounded-xl p-2 text-sm flex-1" />
                  <button type="button"
                    onClick={() => {
                      if (dateExclueInput && !datesExclues.includes(dateExclueInput)) {
                        setDatesExclues([...datesExclues, dateExclueInput]);
                        setDateExclueInput("");
                      }
                    }}
                    className="px-3 py-2 rounded-xl text-sm font-semibold text-white"
                    style={{ backgroundColor: "#E8847A" }}>
                    ➕ Exclure
                  </button>
                </div>
                {datesExclues.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {datesExclues.map(d => (
                      <span key={d} className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 rounded-lg text-xs">
                        {new Date(d + "T12:00:00").toLocaleDateString("fr-CH")}
                        <button type="button" onClick={() => setDatesExclues(datesExclues.filter(x => x !== d))}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Aperçu */}
              {apercu.length > 0 && (
                <div className="bg-white rounded-xl p-3 border">
                  <p className="text-sm font-semibold mb-2" style={{ color: "#1B2B5E" }}>
                    📋 Aperçu — {apercu.length} demande(s) :
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {apercu.map((d, i) => (
                      <p key={i} className="text-xs text-gray-600">
                        {type === "journee"
                          ? new Date(d + "T12:00:00").toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long" })
                          : (() => {
                              const [dDebut, dFin] = d.split("→");
                              return `${new Date(dDebut + "T12:00:00").toLocaleDateString("fr-CH", { weekday: "short", day: "numeric", month: "short" })} → ${new Date(dFin + "T12:00:00").toLocaleDateString("fr-CH", { weekday: "short", day: "numeric", month: "short" })}`;
                            })()
                        }
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dates — masquées si récurrent */}
      {!estRecurrente && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
              Date arrivée *
              {type === "essai" && (
                <span className="text-xs text-gray-400 font-normal ml-1">
                  (lun–ven, hors jours fériés)
                </span>
              )}
            </label>
            <input name="date_debut" type="date" required={!estRecurrente}
              value={dateDebut} min={dateMin}
              onChange={e => handleDateDebutChange(e.target.value)}
              className="w-full border rounded-xl p-3" />
          </div>
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
              Date départ *
            </label>
            {type === "journee" || type === "essai" ? (
              <>
                <input type="date" value={dateDebut} readOnly
                  className="w-full border rounded-xl p-3 bg-gray-100 text-gray-500 cursor-not-allowed" />
                <p className="text-xs text-gray-400 mt-1">Même jour</p>
              </>
            ) : (
              <input name="date_fin" type="date" required={!estRecurrente}
                value={dateFin} min={dateDebut}
                onChange={e => setDateFin(e.target.value)}
                className="w-full border rounded-xl p-3" />
            )}
          </div>
        </div>
      )}

      {type === "essai" && !estRecurrente && (
        <div className="text-xs text-gray-500 bg-gray-50 rounded-xl p-3">
          ℹ️ Les weekends et jours fériés valaisans ne sont pas disponibles pour la journée d'essai.
        </div>
      )}

      {/* Heures */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
            Heure arrivée *
            <span className="text-gray-400 font-normal text-xs ml-1">
              {type === "essai" ? "(10h00 fixe)" :
               type === "journee" ? "(7h35–10h)" : "(9h–10h ou 17h–18h)"}
            </span>
          </label>
          {type === "essai" ? (
            <>
              <input type="hidden" name="heure_arrivee" value="10:00" />
              <div className="w-full border rounded-xl p-3 bg-gray-100 text-gray-500 text-sm">
                10:00 (fixe)
              </div>
            </>
          ) : (
            <select name="heure_arrivee" required
              value={heureArrivee}
              onChange={e => setHeureArrivee(e.target.value)}
              className="w-full border rounded-xl p-3">
              <option value="">-- Choisir --</option>
              {creneauxArrivee.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
            Heure départ *
            <span className="text-gray-400 font-normal text-xs ml-1">
              {type === "sejour" ? "(9h–10h ou 17h–18h)" : "(17h–18h)"}
            </span>
          </label>
          <select name="heure_depart" required
            value={heureDepart}
            onChange={e => setHeureDepart(e.target.value)}
            className="w-full border rounded-xl p-3">
            <option value="">-- Choisir --</option>
            {creneauxDepartActuels.map(h => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Commentaire */}
      <div>
        <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
          Message / remarques
        </label>
        <textarea name="commentaire_client" rows={3}
          placeholder="Informations particulières, demandes spéciales..."
          className="w-full border rounded-xl p-3" />
      </div>

      {/* Info */}
      <div className="rounded-xl p-4 text-sm"
        style={{ backgroundColor: "#E8F5F4", border: "1px solid #4AAEA0", color: "#1B2B5E" }}>
        {type === "essai" ? (
          <>
            🧪 Journée d'essai — arrivée à 10h00, départ entre 17h et 18h.
            <br />Votre demande sera confirmée par notre équipe sous 24h.
          </>
        ) : estRecurrente ? (
          <>
            🔁 Chaque demande sera traitée individuellement par notre équipe.
            {est_membre && <span className="block mt-1 font-semibold">⭐ Tarifs membres appliqués.</span>}
          </>
        ) : (
          <>
            ℹ️ Votre demande sera traitée par notre équipe sous 24h.
            {est_membre && <span className="block mt-1 font-semibold">⭐ Tarifs membres appliqués.</span>}
          </>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading}
          className="px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: "#4AAEA0" }}>
          {loading ? "Envoi en cours..." : estRecurrente ? `📤 Envoyer ${apercu.length} demande(s)` : "📤 Envoyer la demande"}
        </button>
        <a href="/mon-compte/reservations"
          className="px-6 py-3 rounded-xl font-semibold"
          style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
          ✖ Annuler
        </a>
      </div>

    </form>
  );
}