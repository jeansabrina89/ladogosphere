"use client";

import { useState, useEffect, useRef } from "react";
import { formatBoxLabel } from "@/src/lib/boxes";
import { formatDateFR } from "@/src/lib/dates";
import SelectHeure from "@/app/components/SelectHeure";
import BadgeMembre from "@/app/components/BadgeMembre";
import { statutEssaiDe, chienReservablePour, messageRefusChien } from "@/src/lib/journeeEssai";

type EtatJourneeEssai = { disponible: boolean; heuresPrises: string[]; creneauxLibres: string[] };
type Client = { id: string; prenom: string; nom: string; membre: boolean; aJour: boolean; cotisation_exemptee?: boolean };
type Chien = { id: string; nom: string; race: string; categorie_poids: string; poids: number; client_id: string; statut_essai: string | null };
type Box = { id: string; numero: number; nom?: string | null };

const JOURS_SEMAINE = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 0, label: "Dimanche" },
];

export default function FormReservation({
  clients,
  chiens,
  boxes,
  peutUrgence,
  estAdmin = false,
}: {
  clients: Client[];
  chiens: Chien[];
  boxes: Box[];
  peutUrgence: boolean;
  /** Seul l'admin peut forcer une seconde journée d'essai le même jour. */
  estAdmin?: boolean;
}) {
  const [type, setType] = useState("journee");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [heureArrivee, setHeureArrivee] = useState("");
  const [heureDepart, setHeureDepart] = useState("");
  const [loading, setLoading] = useState(false);
  const [forcer, setForcer] = useState(false);
  const [forcerRaison, setForcerRaison] = useState("");
  // Journée d'essai : une seule par jour, forçage admin sur un créneau libre.
  const [etatEssai, setEtatEssai] = useState<EtatJourneeEssai | null>(null);
  const [forcerEssai, setForcerEssai] = useState(false);
  const [creneauForce, setCreneauForce] = useState("");
  const [chiensSelectionnes, setChiensSelectionnes] = useState<string[]>([]);
  const [boxId, setBoxId] = useState("");
  const [suggestionBox, setSuggestionBox] = useState<{ message: string; raison: string } | null>(null);
  const [chargementSuggestion, setChargementSuggestion] = useState(false);

  // Client combobox
  const [clientId, setClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientListOpen, setClientListOpen] = useState(false);
  const [clientEditMode, setClientEditMode] = useState(false);

  // Chiens combobox
  const [chienSearch, setChienSearch] = useState("");
  const [chienListOpen, setChienListOpen] = useState(false);
  const chienSearchRef = useRef<HTMLInputElement>(null);

  // Récurrence
  const [estRecurrente, setEstRecurrente] = useState(false);
  const [jourRecurrence, setJourRecurrence] = useState<number>(1); // jour de la semaine
  const [dureeRecurrence, setDureeRecurrence] = useState<"1mois" | "3mois" | "6mois">("1mois");
  const [dateDebutRecurrence, setDateDebutRecurrence] = useState("");
  // Pour séjour récurrent
  const [jourArrivee, setJourArrivee] = useState<number>(3); // mercredi
  const [jourDepart, setJourDepart] = useState<number>(4); // jeudi
  const [datesExclues, setDatesExclues] = useState<string[]>([]);
  const [dateExclueInput, setDateExclueInput] = useState("");
  const [apercu, setApercu] = useState<string[]>([]);

  const handleTypeChange = (val: string) => {
    setType(val);
    setEstRecurrente(false);
    if (val === "journee" || val === "essai") {
      if (dateDebut) setDateFin(dateDebut);
    }
  };

  const handleDateDebutChange = (val: string) => {
    setDateDebut(val);
    if (type === "journee" || type === "essai") setDateFin(val);
  };

  const handleChienToggle = (id: string) => {
    const adding = !chiensSelectionnes.includes(id);
    setChiensSelectionnes(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
    if (adding && !clientId) {
      const chien = chiens.find(c => c.id === id);
      if (chien?.client_id) setClientId(chien.client_id);
    }
  };

  const handleClientSelect = (id: string) => {
    setClientId(id);
    setClientSearch("");
    setClientListOpen(false);
    setClientEditMode(false);
    setChiensSelectionnes(prev => prev.filter(chienId => {
      const chien = chiens.find(c => c.id === chienId);
      return chien?.client_id === id;
    }));
  };

  const handleClientClear = () => {
    setClientId("");
    setClientSearch("");
    setChiensSelectionnes([]);
    setChienSearch("");
    setClientEditMode(false);
  };

  const chiensSelectionnesInfos = chiens.filter(c => chiensSelectionnes.includes(c.id));
  const statutDe = (c: Chien) => statutEssaiDe(c);
  const chiensRefusesSel = chiensSelectionnesInfos.filter(c => statutDe(c) === "refuse");
  const chiensNonValidesSel = chiensSelectionnesInfos.filter(c => statutDe(c) !== "valide");
  // Chiens qui bloquent le type choisi (hors passage outre).
  const chiensBloquantsSel = chiensSelectionnesInfos.filter(
    c => !chienReservablePour(statutDe(c), type).autorise
  );
  const reservationBloquee = chiensBloquantsSel.length > 0 && !forcer;
  const seulEssaiAutorise = chiensNonValidesSel.length > 0 && chiensRefusesSel.length === 0;
  const tousValidesSel = chiensSelectionnesInfos.length > 0 && chiensNonValidesSel.length === 0;

  const clientSelectionne = clients.find(c => c.id === clientId) ?? null;
  const clientsFiltres = clientSearch
    ? clients.filter(c => `${c.prenom} ${c.nom}`.toLowerCase().includes(clientSearch.toLowerCase()))
    : clients;
  const chiensFiltres = chiens.filter(c => {
    if (clientId && c.client_id !== clientId) return false;
    if (chienSearch) {
      const s = chienSearch.toLowerCase();
      return c.nom.toLowerCase().includes(s) || (c.race ?? "").toLowerCase().includes(s);
    }
    return true;
  });

  useEffect(() => {
    if (tousValidesSel && type === "essai") handleTypeChange("journee");
    else if (seulEssaiAutorise && type !== "essai") handleTypeChange("essai");
  }, [tousValidesSel, seulEssaiAutorise]);

  // Une seule journée d'essai par jour : on interroge la date choisie.
  // Tout passe par un état unique, posé de façon asynchrone : rien n'est
  // remis à zéro de manière synchrone dans l'effet.
  useEffect(() => {
    let annule = false;
    (async () => {
      if (type !== "essai" || !dateDebut) {
        if (!annule) setEtatEssai(null);
        return;
      }
      const r = await fetch(`/api/reservations/essai-du-jour?date=${dateDebut}`);
      if (annule) return;
      if (!r.ok) { setEtatEssai(null); return; }
      const etat: EtatJourneeEssai = await r.json();
      if (!annule) setEtatEssai(etat);
    })();
    return () => { annule = true; };
  }, [type, dateDebut]);

  // Journée d'essai à une date déjà prise : bloquée, sauf forçage admin valide.
  const essaiDatePrise = type === "essai" && etatEssai !== null && !etatEssai.disponible;
  const creneauxLibres = etatEssai?.creneauxLibres ?? [];
  // Le créneau retenu est dérivé de l'état courant : pas de state à resynchroniser.
  const creneauRetenu =
    creneauForce && creneauxLibres.includes(creneauForce) ? creneauForce : creneauxLibres[0] ?? "";
  const forcageEssaiActif = essaiDatePrise && estAdmin && forcerEssai && creneauRetenu !== "";
  const essaiBloque = essaiDatePrise && !forcageEssaiActif;

  // Générer l'aperçu des dates récurrentes
  const genererDates = (): string[] => {
    if (!dateDebutRecurrence) return [];

    const dates: string[] = [];
    const debut = new Date(dateDebutRecurrence + "T12:00:00");
    const nbMois = dureeRecurrence === "1mois" ? 1 : dureeRecurrence === "3mois" ? 3 : 6;
    const fin = new Date(debut);
    fin.setMonth(fin.getMonth() + nbMois);

    const current = new Date(debut);

    if (type === "journee") {
      // Trouver le premier jour correspondant
      while (current.getDay() !== jourRecurrence) {
        current.setDate(current.getDate() + 1);
      }
      while (current <= fin) {
        const dateStr = current.toISOString().split("T")[0];
        if (!datesExclues.includes(dateStr)) {
          dates.push(dateStr);
        }
        current.setDate(current.getDate() + 7);
      }
    } else if (type === "sejour") {
      // Trouver le premier jour d'arrivée
      while (current.getDay() !== jourArrivee) {
        current.setDate(current.getDate() + 1);
      }
      while (current <= fin) {
        const dateArriveeStr = current.toISOString().split("T")[0];
        // Calculer le jour de départ
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

  // Suggestion automatique de box
  useEffect(() => {
    const dateF = type === "journee" || type === "essai" ? dateDebut : dateFin;
    if (chiensSelectionnes.length === 0 || !dateDebut || !dateF) {
      setSuggestionBox(null);
      return;
    }

    const chercher = async () => {
      setChargementSuggestion(true);
      try {
        const res = await fetch("/api/boxes/suggestion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chien_ids: chiensSelectionnes,
            date_debut: dateDebut,
            date_fin: dateF,
            heure_arrivee: heureArrivee,
            heure_depart: heureDepart,
            type_reservation: type,
          }),
        });
        const data = await res.json();
        if (data.box_id) {
          setBoxId(data.box_id);
          setSuggestionBox({ message: data.message, raison: data.raison });
        } else {
          setSuggestionBox({ message: "⚠️ Aucun box suggéré — choisissez manuellement", raison: "none" });
        }
      } catch (e) {
        console.error(e);
      }
      setChargementSuggestion(false);
    };

    const timeout = setTimeout(chercher, 500);
    return () => clearTimeout(timeout);
  }, [chiensSelectionnes, dateDebut, dateFin, heureArrivee, heureDepart, type]);

  const verifierHoraires = (): boolean => {
    if (type === "journee") {
      const arriveeOk = !heureArrivee || (heureArrivee >= "07:35" && heureArrivee <= "10:00");
      const departOk = !heureDepart || (heureDepart >= "17:00" && heureDepart <= "18:00");
      if (!arriveeOk || !departOk) {
        return confirm("⚠️ Horaire hors plage habituelle !\nJournée : arrivée 7h35–10h00 · départ 17h00–18h00\n\nConfirmer quand même ?");
      }
    }
    if (type === "essai") {
      const arriveeOk = !heureArrivee || heureArrivee === "10:00";
      const departOk = !heureDepart || (heureDepart >= "17:00" && heureDepart <= "18:00");
      if (!arriveeOk || !departOk) {
        return confirm("⚠️ Horaire hors plage habituelle !\nJournée d'essai : arrivée 10h00 · départ 17h00–18h00\n\nConfirmer quand même ?");
      }
    }
    if (type === "sejour") {
      const arriveeOk = !heureArrivee ||
        (heureArrivee >= "09:00" && heureArrivee <= "10:00") ||
        (heureArrivee >= "17:00" && heureArrivee <= "18:00");
      const departOk = !heureDepart ||
        (heureDepart >= "09:00" && heureDepart <= "10:00") ||
        (heureDepart >= "17:00" && heureDepart <= "18:00");
      if (!arriveeOk || !departOk) {
        return confirm("⚠️ Horaire hors plage habituelle !\nSéjour : arrivée/départ entre 9h00–10h00 ou 17h00–18h00\n\nConfirmer quand même ?");
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!boxId) {
      alert("❌ Veuillez sélectionner un box.");
      return;
    }

    if (!verifierHoraires()) return;

    setLoading(true);

    // Mode récurrent
    if (estRecurrente) {
      const dates = genererDates();
      if (dates.length === 0) {
        alert("❌ Aucune date générée. Vérifiez les paramètres.");
        setLoading(false);
        return;
      }

      if (!confirm(`Créer ${dates.length} réservation(s) récurrente(s) ?`)) {
        setLoading(false);
        return;
      }

      const form = e.currentTarget;
      const formData = new FormData(form);
      const client_id = formData.get("client_id") as string;
      const statut = formData.get("statut") as string;
      const commentaire_admin = formData.get("commentaire_admin") as string;

      let nbCreees = 0;
      let derniereId = "";

      for (const dateStr of dates) {
        const fd = new FormData();
        fd.set("client_id", client_id);
        fd.set("box_id", boxId);
        fd.set("type_reservation", type);
        fd.set("statut", statut || "en_attente");
        fd.set("heure_arrivee", heureArrivee || "");
        fd.set("heure_depart", heureDepart || "");
        fd.set("urgence", "");
        fd.set("commentaire_admin", commentaire_admin || "");
        if (forcer) {
          fd.set("forcer", "on");
          fd.set("forcer_raison", forcerRaison);
        }
        chiensSelectionnes.forEach(id => fd.append("chien_ids", id));

        if (type === "journee") {
          fd.set("date_debut", dateStr);
          fd.set("date_fin", dateStr);
        } else if (type === "sejour") {
          const [dDebut, dFin] = dateStr.split("→");
          fd.set("date_debut", dDebut);
          fd.set("date_fin", dFin);
        }

        const response = await fetch("/api/reservations", {
          method: "POST",
          body: fd,
        });

        if (response.ok) {
          const { id } = await response.json();
          derniereId = id;
          nbCreees++;
        }
      }

      alert(`✅ ${nbCreees} réservation(s) créée(s) !`);
      window.location.href = `/reservations`;
      return;
    }

    // Mode normal
    if (type === "sejour" && dateFin && dateDebut && dateFin < dateDebut) {
      alert("❌ La date de départ ne peut pas être avant la date d'arrivée.");
      setLoading(false);
      return;
    }

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("box_id", boxId);
    formData.delete("chien_ids");
    chiensSelectionnes.forEach(id => formData.append("chien_ids", id));

    if (type === "journee" || type === "essai") {
      formData.set("date_fin", dateDebut);
    }

    // Seconde journée d'essai forcée par l'admin : créneau transmis au serveur,
    // qui revérifie tout (rôle, date prise, créneau réellement libre).
    if (forcageEssaiActif) {
      formData.set("forcer_essai", "on");
      formData.set("forcer_essai_heure", creneauRetenu);
    }

    const response = await fetch("/api/reservations", {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      const { id } = await response.json();
      window.location.href = `/reservations/${id}`;
    } else {
      const { error } = await response.json();
      alert("Erreur : " + error);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto bg-white rounded-xl p-8 shadow-sm">

        <h1 className="text-4xl font-bold mb-6" style={{ color: "#1B2B5E" }}>
          ➕ Nouvelle réservation
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Client */}
          <div>
            <label className="block font-semibold mb-1">Client *</label>
            <input type="hidden" name="client_id" value={clientId} />
            {clientSelectionne && !clientEditMode ? (
              <div className="flex items-center justify-between border rounded-xl p-3">
                <button type="button"
                  onClick={() => { setClientEditMode(true); setClientSearch(""); setClientListOpen(true); }}
                  className="font-medium text-left flex-1 hover:underline">
                  {clientSelectionne.prenom} {clientSelectionne.nom}<BadgeMembre membre={clientSelectionne.membre} aJour={clientSelectionne.aJour} compact />
                </button>
                <button type="button" onClick={handleClientClear}
                  className="text-gray-400 hover:text-red-500 ml-3 font-bold text-lg leading-none">
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={clientSearch}
                    autoFocus={clientEditMode}
                    onChange={e => { setClientSearch(e.target.value); setClientListOpen(true); }}
                    onFocus={() => setClientListOpen(true)}
                    onBlur={() => setTimeout(() => { setClientListOpen(false); setClientEditMode(false); }, 150)}
                    placeholder="Rechercher un client…"
                    className="w-full border rounded-xl p-3"
                  />
                  {clientListOpen && (
                    <div className="absolute z-10 w-full bg-white border rounded-xl shadow-lg mt-1 max-h-60 overflow-y-auto">
                      {clientsFiltres.slice(0, 20).map(c => (
                        <button key={c.id} type="button"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => handleClientSelect(c.id)}
                          className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm">
                          {c.prenom} {c.nom}<BadgeMembre membre={c.membre} aJour={c.aJour} compact />
                        </button>
                      ))}
                      {clientsFiltres.length === 0 && (
                        <p className="px-4 py-2 text-sm text-gray-400">Aucun résultat</p>
                      )}
                    </div>
                  )}
                </div>
                {clientSelectionne && (
                  <button type="button" onClick={handleClientClear}
                    className="text-gray-400 hover:text-red-500 font-bold text-lg leading-none flex-shrink-0">
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Chiens */}
          <div>
            <label className="block font-semibold mb-1">Chien(s) *</label>
            {chiensSelectionnesInfos.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {chiensSelectionnesInfos.map(c => (
                  <span key={c.id} className="flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium"
                    style={{ backgroundColor: "#E8F5F4", color: "#1B2B5E" }}>
                    <button type="button"
                      onClick={() => chienSearchRef.current?.focus()}
                      className="hover:underline">
                      {c.nom}
                    </button>
                    <button type="button"
                      onClick={() => handleChienToggle(c.id)}
                      className="ml-1 hover:text-red-500 font-bold leading-none">
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <input
                ref={chienSearchRef}
                type="text"
                value={chienSearch}
                onChange={e => { setChienSearch(e.target.value); setChienListOpen(true); }}
                onFocus={() => setChienListOpen(true)}
                onBlur={() => setTimeout(() => setChienListOpen(false), 150)}
                placeholder={clientSelectionne ? `Ajouter un chien de ${clientSelectionne.prenom}…` : "Rechercher un chien…"}
                className="w-full border rounded-xl p-3"
              />
              {chienListOpen && (
                <div className="absolute z-10 w-full bg-white border rounded-xl shadow-lg mt-1 max-h-60 overflow-y-auto">
                  {chiensFiltres.filter(c => !chiensSelectionnes.includes(c.id)).slice(0, 20).map(c => (
                    <button key={c.id} type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { handleChienToggle(c.id); setChienSearch(""); }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm">
                      {c.nom} — {c.race || "—"} — {c.poids ? `${c.poids} kg` : "?"} —{" "}
                      {c.categorie_poids === "moins_15kg" ? "🟢 Petit" :
                       c.categorie_poids === "15_30kg" ? "🟡 Moyen" :
                       c.categorie_poids === "30_40kg" ? "🔴 Grand" : "—"}
                    </button>
                  ))}
                  {chiensFiltres.filter(c => !chiensSelectionnes.includes(c.id)).length === 0 && (
                    <p className="px-4 py-2 text-sm text-gray-400">
                      {chiensSelectionnes.length > 0 && clientId
                        ? "Tous les chiens de ce client sont sélectionnés"
                        : clientId ? "Aucun chien pour ce client" : "Aucun chien trouvé"}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="block font-semibold mb-1">Type *</label>
            {reservationBloquee ? (
              <div className="space-y-2">
                {chiensRefusesSel.map(c => (
                  <div key={c.id} className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                    <strong>{c.nom}</strong> n'a pas été accepté à l'issue de sa journée d'essai et ne peut donc pas faire l'objet d'une réservation. N'hésitez pas à nous contacter pour plus d'informations ou pour envisager une nouvelle journée d'essai.
                  </div>
                ))}
              </div>
            ) : seulEssaiAutorise ? (
              <>
                <input type="hidden" name="type_reservation" value="essai" />
                <div className="border rounded-xl p-3 bg-blue-50 text-sm" style={{ color: "#1B2B5E" }}>
                  🧪 Journée d'essai
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  ℹ️ {chiensNonValidesSel.map(c => c.nom).join(", ")}{" "}
                  {chiensNonValidesSel.length > 1 ? "doivent" : "doit"} d'abord valider{" "}
                  {chiensNonValidesSel.length > 1 ? "leur" : "sa"} journée d'essai avant de pouvoir réserver une journée ou un séjour. Vous pouvez réserver une journée d'essai.
                </p>
              </>
            ) : (
              <>
                <select name="type_reservation" required className="w-full border rounded-xl p-3"
                  value={type} onChange={e => handleTypeChange(e.target.value)}>
                  <option value="journee">Journée</option>
                  <option value="sejour">Séjour</option>
                  {!tousValidesSel && <option value="essai">🧪 Journée d'essai</option>}
                </select>
                {type === "essai" && (
                  <p className="text-xs text-gray-500 mt-1">
                    ℹ️ Tarif journée membre. Arrivée à 10h00 · Départ 17h–18h.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Option récurrence — seulement pour journée et séjour */}
          {(type === "journee" || type === "sejour") && (
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

                  {/* Date de début de la récurrence */}
                  <div>
                    <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                      À partir du *
                    </label>
                    <input type="date" value={dateDebutRecurrence}
                      onChange={e => setDateDebutRecurrence(e.target.value)}
                      className="w-full border rounded-xl p-2 text-sm" required={estRecurrente} />
                  </div>

                  {/* Jour(s) de la semaine */}
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

                  {/* Durée */}
                  <div>
                    <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                      Durée *
                    </label>
                    <div className="flex gap-2">
                      {(["1mois", "3mois", "6mois"] as const).map(d => (
                        <button key={d} type="button"
                          onClick={() => setDureeRecurrence(d)}
                          className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition ${
                            dureeRecurrence === d ? "text-white border-transparent" : "bg-white"
                          }`}
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
                      Dates à exclure (ex: vacances)
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
                            {formatDateFR(d + "T12:00:00")}
                            <button type="button" onClick={() => setDatesExclues(datesExclues.filter(x => x !== d))}>
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Aperçu des dates */}
                  {apercu.length > 0 && (
                    <div className="bg-white rounded-xl p-3 border">
                      <p className="text-sm font-semibold mb-2" style={{ color: "#1B2B5E" }}>
                        📋 Aperçu — {apercu.length} réservation(s) :
                      </p>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {apercu.map((d, i) => (
                          <p key={i} className="text-xs text-gray-600">
                            {type === "journee"
                              ? formatDateFR(d + "T12:00:00")
                              : (() => {
                                  const [dDebut, dFin] = d.split("→");
                                  return `${formatDateFR(dDebut + "T12:00:00")} → ${formatDateFR(dFin + "T12:00:00")}`;
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
                <label className="block font-semibold mb-1">Date début *</label>
                <input name="date_debut" type="date" required={!estRecurrente}
                  value={dateDebut}
                  onChange={e => handleDateDebutChange(e.target.value)}
                  className="w-full border rounded-xl p-3" />
              </div>
              <div>
                <label className="block font-semibold mb-1">Date fin *</label>
                {type === "journee" || type === "essai" ? (
                  <>
                    <input name="date_fin" type="date"
                      value={dateDebut} readOnly
                      className="w-full border rounded-xl p-3 bg-gray-100 text-gray-500 cursor-not-allowed" />
                    <p className="text-xs text-gray-400 mt-1">Même jour que l'arrivée</p>
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

          {/* Box — suggestion automatique */}
          <div>
            <label className="block font-semibold mb-1">Box *</label>
            {chargementSuggestion && (
              <p className="text-xs text-gray-400 mb-2">🔍 Recherche du meilleur box...</p>
            )}
            {suggestionBox && !chargementSuggestion && (
              <div className={`mb-2 px-3 py-2 rounded-xl text-sm font-semibold ${
                suggestionBox.raison === "box_compatible" ? "bg-blue-50 text-blue-700" :
                suggestionBox.raison === "vide" ? "bg-green-50 text-green-700" :
                suggestionBox.raison === "ami_ok" ? "bg-green-50 text-green-700" :
                "bg-orange-50 text-orange-700"
              }`}>
                {suggestionBox.message}
              </div>
            )}
            <select value={boxId}
              onChange={e => { setBoxId(e.target.value); setSuggestionBox(null); }}
              className="w-full border rounded-xl p-3" required>
              <option value="">-- Sélectionner un box --</option>
              {boxes.map(b => (
                <option key={b.id} value={b.id}>
                  {formatBoxLabel(b)}{b.id === boxId && suggestionBox ? " ← suggéré" : ""}
                </option>
              ))}
            </select>
            {estRecurrente && (
              <p className="text-xs text-gray-400 mt-1">
                ℹ️ Le même box sera utilisé pour toutes les réservations récurrentes.
              </p>
            )}
          </div>

          {/* Heures */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">
                Heure arrivée
                <span className="text-gray-400 font-normal text-xs ml-1">(7h30–19h)</span>
              </label>
              <SelectHeure
                name="heure_arrivee"
                value={heureArrivee}
                onChange={setHeureArrivee}
                className="w-full border rounded-xl p-3"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">
                Heure départ
                <span className="text-gray-400 font-normal text-xs ml-1">(7h30–19h)</span>
              </label>
              <SelectHeure
                name="heure_depart"
                value={heureDepart}
                onChange={setHeureDepart}
                className="w-full border rounded-xl p-3"
              />
            </div>
          </div>

          {/* Urgence — visible si admin ou permission perm_tarifs_urgence */}
          {peutUrgence && (
            <div className="flex items-center gap-2">
              <input type="checkbox" name="urgence" id="urgence" />
              <label htmlFor="urgence" className="font-semibold">
                🚨 Réservation urgence (membres uniquement)
              </label>
            </div>
          )}

          {/* Journée d'essai : une seule par jour */}
          {essaiDatePrise && (
            <div className="rounded-xl p-4" style={{ backgroundColor: "#FFF8E1", border: "1px solid #C9A84C" }}>
              <p className="font-semibold text-sm mb-1" style={{ color: "#7A5C00" }}>
                🧪 Une journée d&apos;essai est déjà prévue à {etatEssai!.heuresPrises.join(", ")}
              </p>
              <p className="text-xs mb-3" style={{ color: "rgba(122,92,0,0.85)" }}>
                La pension n&apos;accueille qu&apos;une journée d&apos;essai par jour.
              </p>

              {!estAdmin ? (
                <p className="text-sm font-semibold" style={{ color: "#A8453A" }}>
                  Choisissez une autre date : seule l&apos;administratrice peut en ajouter une seconde.
                </p>
              ) : creneauxLibres.length === 0 ? (
                <p className="text-sm font-semibold" style={{ color: "#A8453A" }}>
                  Plus aucun créneau disponible ce jour-là (9h30, 10h30 et 11h00 sont pris).
                </p>
              ) : (
                <>
                  <label className="flex items-center gap-2 font-semibold text-sm" style={{ color: "#7A5C00" }}>
                    <input type="checkbox" checked={forcerEssai}
                      onChange={e => setForcerEssai(e.target.checked)} />
                    Forcer une seconde journée d&apos;essai
                  </label>
                  {forcerEssai && (
                    <div className="mt-2">
                      <label className="block text-sm font-semibold mb-1" style={{ color: "#7A5C00" }}>
                        Heure d&apos;arrivée
                      </label>
                      <select value={creneauRetenu}
                        onChange={e => setCreneauForce(e.target.value)}
                        className="w-full border rounded-xl p-2 text-sm">
                        {creneauxLibres.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      <p className="text-xs mt-1" style={{ color: "rgba(122,92,0,0.85)" }}>
                        Créneaux de 30 minutes entre 9h30 et 11h00, hors 10h00 et hors créneaux déjà pris.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Journée d'essai : blocage par chien, avec passage outre possible */}
          {chiensBloquantsSel.length > 0 && (
            <div className="rounded-xl p-4" style={{ backgroundColor: "#FFF8E1", border: "1px solid #C9A84C" }}>
              <p className="font-semibold text-sm mb-2" style={{ color: "#7A5C00" }}>
                🧪 Journée d&apos;essai — cette réservation ne respecte pas la règle :
              </p>
              <ul className="text-sm mb-3" style={{ color: "#7A5C00", paddingLeft: 18, listStyle: "disc" }}>
                {chiensBloquantsSel.map(c => (
                  <li key={c.id}>
                    {messageRefusChien(c.nom, chienReservablePour(statutDe(c), type).raison)}
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2 font-semibold text-sm" style={{ color: "#7A5C00" }}>
                <input type="checkbox" name="forcer" checked={forcer}
                  onChange={e => setForcer(e.target.checked)} />
                Forcer la réservation malgré tout
              </label>
              {forcer && (
                <div className="mt-2">
                  <label className="block text-sm font-semibold mb-1" style={{ color: "#7A5C00" }}>
                    Raison (obligatoire, enregistrée avec la réservation)
                  </label>
                  <input type="text" name="forcer_raison" value={forcerRaison}
                    onChange={e => setForcerRaison(e.target.value)}
                    placeholder="Ex. : chien connu de la pension, accord de la responsable"
                    className="w-full border rounded-xl p-2 text-sm" />
                </div>
              )}
            </div>
          )}

          {/* Statut */}
          <div>
            <label className="block font-semibold mb-1">Statut</label>
            <select name="statut" className="w-full border rounded-xl p-3">
              <option value="en_attente">⏳ En attente</option>
              <option value="validee">✅ Validée</option>
            </select>
          </div>

          {/* Commentaire */}
          <div>
            <label className="block font-semibold mb-1">Commentaire admin</label>
            <textarea name="commentaire_admin" rows={3}
              className="w-full border rounded-xl p-3" />
          </div>

          {/* Boutons */}
          <div className="flex gap-3 pt-4 border-t">
            <button type="submit" disabled={loading || reservationBloquee || essaiBloque}
              className="px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "#4AAEA0" }}>
              {loading ? "Enregistrement..." : estRecurrente ? `🔁 Créer ${apercu.length} réservation(s)` : "💾 Enregistrer"}
            </button>
            <a href="/reservations"
              className="px-6 py-3 rounded-xl font-semibold"
              style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
              ✖ Annuler
            </a>
          </div>

        </form>
      </div>
    </main>
  );
}