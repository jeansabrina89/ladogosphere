"use client";

import { useState, useMemo } from "react";
import { creerFactureLibre } from "../actionsCreation";
import { COMPTES_PRODUIT } from "@/src/lib/factureStatut";

const MARINE = "#1B2B5E";
const chf = (n: number) => `${n.toFixed(2)} CHF`;

type Client = { id: string; prenom: string; nom: string; adresse: string | null };
type Resa = {
  id: string; client_id: string; numero: number | null;
  date_debut: string; date_fin: string; type_reservation: string;
  reste: number; dejaFacturee: string | null;
};
type Ligne = { cle: number; libelle: string; quantite: string; prix: string; compte: string };

const jolieDate = (iso: string) => {
  const [a, m, j] = iso.slice(0, 10).split("-");
  return `${j}.${m}.${a}`;
};

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

let compteur = 0;
const ligneVide = (): Ligne => ({ cle: ++compteur, libelle: "", quantite: "1", prix: "", compte: "3000" });

export default function AssistantFacture({
  clients, reservations,
}: {
  clients: Client[];
  reservations: Resa[];
}) {
  const aujourdhui = new Date().toISOString().split("T")[0];
  const [recherche, setRecherche] = useState("");
  const [clientId, setClientId] = useState("");
  const [date, setDate] = useState(aujourdhui);
  const [lignes, setLignes] = useState<Ligne[]>([ligneVide()]);
  const [resasChoisies, setResasChoisies] = useState<Set<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [pensionOuverte, setPensionOuverte] = useState(false);

  const client = clients.find((c) => c.id === clientId) ?? null;
  const clientsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (q === "") return clients.slice(0, 40);
    return clients.filter((c) => `${c.prenom} ${c.nom}`.toLowerCase().includes(q)).slice(0, 40);
  }, [clients, recherche]);

  const resasDuClient = reservations.filter((r) => r.client_id === clientId);

  const totalLignes = lignes.reduce(
    (s, l) => s + (parseFloat(l.quantite.replace(",", ".")) || 0) * (parseFloat(l.prix.replace(",", ".")) || 0), 0);
  const totalResas = resasDuClient
    .filter((r) => resasChoisies.has(r.id))
    .reduce((s, r) => s + r.reste, 0);
  const total = totalLignes + totalResas;

  const avertissement = resasDuClient.some((r) => resasChoisies.has(r.id) && r.dejaFacturee);

  function majLigne(cle: number, champ: keyof Ligne, valeur: string) {
    setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, [champ]: valeur } : l)));
  }

  function prefixerPension() {
    setPensionOuverte(true);
  }

  function appliquerPension(mois: number, annee: number, prixJour: string) {
    const jours = new Date(annee, mois + 1, 0).getDate();
    setLignes([
      { cle: ++compteur, libelle: `Pension, ${jours} jours × ${prixJour || "0"} — ${MOIS[mois]} ${annee}`,
        quantite: String(jours), prix: prixJour, compte: "3000" },
      { cle: ++compteur, libelle: "Alimentation", quantite: "1", prix: "", compte: "3010" },
      { cle: ++compteur, libelle: "Frais vétérinaires", quantite: "1", prix: "", compte: "3010" },
    ]);
    setPensionOuverte(false);
  }

  async function envoyer(emettre: boolean) {
    setErreur(null);
    if (!clientId) { setErreur("Choisissez un client."); return; }
    if (!client?.adresse?.trim()) {
      setErreur("Ce client n'a pas d'adresse : complétez sa fiche avant de facturer.");
      return;
    }
    const utiles = lignes
      .filter((l) => l.libelle.trim() !== "")
      .map((l) => ({
        libelle: l.libelle.trim(),
        quantite: parseFloat(l.quantite.replace(",", ".")) || 0,
        prix_unitaire: parseFloat(l.prix.replace(",", ".")) || 0,
        compte_produit: l.compte,
      }));
    if (utiles.length === 0 && resasChoisies.size === 0) {
      setErreur("Ajoutez au moins une ligne ou une réservation.");
      return;
    }

    setEnCours(true);
    const fd = new FormData();
    fd.set("client_id", clientId);
    fd.set("date_facture", date);
    fd.set("lignes", JSON.stringify(utiles));
    fd.set("reservations", [...resasChoisies].join(","));
    fd.set("emettre", emettre ? "1" : "0");
    const res = await creerFactureLibre(fd);
    setEnCours(false);
    if (res?.error) setErreur(res.error);
  }

  return (
    <div className="space-y-4">
      {/* Client */}
      <Bloc titre="Client">
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un client…"
          className="w-full border rounded-xl p-2.5 text-sm mb-2"
        />
        <select
          value={clientId}
          onChange={(e) => { setClientId(e.target.value); setResasChoisies(new Set()); }}
          className="w-full border rounded-xl p-2.5 text-sm"
        >
          <option value="">— Choisir —</option>
          {clientsFiltres.map((c) => (
            <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
          ))}
        </select>
        {client && !client.adresse?.trim() && (
          <p className="text-sm mt-2 px-3 py-2 rounded-lg" style={{ backgroundColor: "#FBE2DE", color: "#A8453A" }}>
            Adresse manquante sur la fiche client : la facture ne peut pas être établie.
          </p>
        )}
        {client?.adresse && (
          <p className="text-sm mt-2 whitespace-pre-line" style={{ color: "rgba(27,43,94,0.6)" }}>{client.adresse}</p>
        )}
        <label className="block text-sm font-semibold mt-3 mb-1" style={{ color: MARINE }}>Date de la facture</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
               className="border rounded-xl p-2.5 text-sm" />
      </Bloc>

      {/* Lignes */}
      <Bloc titre="Lignes">
        <div className="flex gap-2 mb-3 flex-wrap">
          <button type="button" onClick={prefixerPension}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold"
                  style={{ backgroundColor: "#F4EAC9", color: "#6E5410" }}>
            Pension permanente
          </button>
        </div>

        {pensionOuverte && <ChoixPension onValider={appliquerPension} onFermer={() => setPensionOuverte(false)} />}

        <div className="space-y-2">
          {lignes.map((l) => (
            <div key={l.cle} className="flex gap-2 items-start flex-wrap">
              <input
                type="text" value={l.libelle} placeholder="Désignation"
                onChange={(e) => majLigne(l.cle, "libelle", e.target.value)}
                className="border rounded-xl p-2 text-sm" style={{ flex: "2 1 200px" }}
              />
              <select value={l.compte} onChange={(e) => majLigne(l.cle, "compte", e.target.value)}
                      className="border rounded-xl p-2 text-sm" style={{ flex: "1 1 140px" }}>
                {COMPTES_PRODUIT.map((c) => (
                  <option key={c.numero} value={c.numero}>{c.libelle}</option>
                ))}
              </select>
              <input
                type="text" inputMode="decimal" value={l.quantite} placeholder="Qté"
                onChange={(e) => majLigne(l.cle, "quantite", e.target.value)}
                className="border rounded-xl p-2 text-sm text-right" style={{ width: 70 }}
              />
              <input
                type="text" inputMode="decimal" value={l.prix} placeholder="Prix unit."
                onChange={(e) => majLigne(l.cle, "prix", e.target.value)}
                className="border rounded-xl p-2 text-sm text-right" style={{ width: 100 }}
              />
              <span className="text-sm py-2 font-semibold" style={{ color: MARINE, width: 90, textAlign: "right" }}>
                {chf((parseFloat(l.quantite.replace(",", ".")) || 0) * (parseFloat(l.prix.replace(",", ".")) || 0))}
              </span>
              <button type="button" onClick={() => setLignes((ls) => ls.filter((x) => x.cle !== l.cle))}
                      className="px-2 py-2 rounded-lg text-sm" style={{ color: "#A8453A" }} title="Retirer">
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setLignes((ls) => [...ls, ligneVide()])}
                className="mt-3 px-3 py-1.5 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: "#EDE8DF", color: MARINE }}>
          + Ajouter une ligne
        </button>
      </Bloc>

      {/* Réservations impayées */}
      {clientId && resasDuClient.length > 0 && (
        <Bloc titre="Réservations impayées de ce client">
          <div className="space-y-2">
            {resasDuClient.map((r) => (
              <label key={r.id} className="flex items-center gap-3 p-2 rounded-lg cursor-pointer"
                     style={{ backgroundColor: "#F5F0E8" }}>
                <input
                  type="checkbox"
                  checked={resasChoisies.has(r.id)}
                  onChange={(e) => {
                    const next = new Set(resasChoisies);
                    if (e.target.checked) next.add(r.id); else next.delete(r.id);
                    setResasChoisies(next);
                  }}
                />
                <span className="flex-1 text-sm" style={{ color: MARINE }}>
                  #{r.numero} — {jolieDate(r.date_debut)} → {jolieDate(r.date_fin)}
                  {r.dejaFacturee && (
                    <span className="ml-2 text-xs font-semibold" style={{ color: "#A8453A" }}>
                      déjà sur la facture {r.dejaFacturee}
                    </span>
                  )}
                </span>
                <span className="text-sm font-semibold" style={{ color: MARINE }}>{chf(r.reste)}</span>
              </label>
            ))}
          </div>
          {avertissement && (
            <p className="text-sm mt-3 px-3 py-2 rounded-lg" style={{ backgroundColor: "#F4EAC9", color: "#6E5410" }}>
              Une réservation sélectionnée figure déjà sur une facture émise. Cette facture-là devra être
              annulée par un avoir, sans quoi la prestation serait facturée deux fois.
            </p>
          )}
        </Bloc>
      )}

      <Bloc titre="Total">
        <p className="text-2xl font-bold" style={{ color: MARINE }}>{chf(total)}</p>
      </Bloc>

      {erreur && (
        <p className="text-sm px-4 py-3 rounded-xl" style={{ backgroundColor: "#FBE2DE", color: "#A8453A" }}>
          {erreur}
        </p>
      )}

      <div className="flex gap-3 flex-wrap">
        <button onClick={() => envoyer(false)} disabled={enCours}
                className="px-5 py-2.5 rounded-xl font-semibold disabled:opacity-50"
                style={{ backgroundColor: "#EDE8DF", color: MARINE }}>
          Enregistrer en brouillon
        </button>
        <button onClick={() => envoyer(true)} disabled={enCours}
                className="px-5 py-2.5 rounded-xl font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: MARINE }}>
          {enCours ? "…" : "Émettre"}
        </button>
      </div>
    </div>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-5 border" style={{ borderColor: "rgba(27,43,94,0.12)" }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "rgba(27,43,94,0.5)" }}>
        {titre}
      </p>
      {children}
    </div>
  );
}

function ChoixPension({
  onValider, onFermer,
}: {
  onValider: (mois: number, annee: number, prix: string) => void;
  onFermer: () => void;
}) {
  const maintenant = new Date();
  const [mois, setMois] = useState(maintenant.getMonth());
  const [annee, setAnnee] = useState(maintenant.getFullYear());
  const [prix, setPrix] = useState("");
  const jours = new Date(annee, mois + 1, 0).getDate();

  return (
    <div className="rounded-xl p-3 mb-3 flex gap-2 items-end flex-wrap" style={{ backgroundColor: "#F5F0E8" }}>
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: MARINE }}>Mois</label>
        <select value={mois} onChange={(e) => setMois(Number(e.target.value))}
                className="border rounded-lg p-2 text-sm">
          {MOIS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: MARINE }}>Année</label>
        <input type="number" value={annee} onChange={(e) => setAnnee(Number(e.target.value))}
               className="border rounded-lg p-2 text-sm" style={{ width: 90 }} />
      </div>
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: MARINE }}>Prix par jour</label>
        <input type="text" inputMode="decimal" value={prix} onChange={(e) => setPrix(e.target.value)}
               className="border rounded-lg p-2 text-sm" style={{ width: 100 }} />
      </div>
      <span className="text-sm py-2" style={{ color: "rgba(27,43,94,0.6)" }}>{jours} jours</span>
      <button type="button" onClick={() => onValider(mois, annee, prix)}
              className="px-3 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: MARINE }}>
        Pré-remplir
      </button>
      <button type="button" onClick={onFermer} className="px-3 py-2 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: "white", color: MARINE }}>
        Fermer
      </button>
    </div>
  );
}
