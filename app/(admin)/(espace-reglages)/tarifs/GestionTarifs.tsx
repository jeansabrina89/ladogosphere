"use client";

import { useState } from "react";
import {
  AVERTISSEMENT_SANS_IBAN,
  NON_RENSEIGNE,
  ibanMasque,
} from "@/src/lib/ibanMasque";
import { useRouter } from "next/navigation";

type Tarif = {
  id: string;
  categorie: string;
  membre: boolean;
  prix: string;
  annee: number;
};

const LABELS: Record<string, string> = {
  "journee_partage_1": "Journée — 1 chien partagé",
  "journee_partage_2": "Journée — 2 chiens partagés",
  "journee_partage_3": "Journée — 3 chiens partagés",
  "journee_privatif": "Journée — Box privatif",
  "sejour_partage_1": "Séjour 24h — 1 chien partagé",
  "sejour_partage_2": "Séjour 24h — 2 chiens partagés",
  "sejour_partage_3": "Séjour 24h — 3 chiens partagés",
  "sejour_privatif": "Séjour 24h — Box privatif",
  "urgence_partage_1": "Urgence — 1 chien partagé",
  "urgence_partage_2": "Urgence — 2 chiens partagés",
  "urgence_partage_3": "Urgence — 3 chiens partagés",
  "urgence_privatif": "Urgence — Box privatif",
};

const GROUPES = [
  { label: "☀️ Journée", prefix: "journee" },
  { label: "🏠 Séjour 24h", prefix: "sejour" },
  { label: "🚨 Urgence (membres uniquement)", prefix: "urgence" },
];

/*
 * APP 63 — `ibanValide` et `estQrIban` vivaient ici pour valider les champs
 * que cet écran portait. Ces champs sont partis avec eux : l'identité de
 * paiement se règle dans Réglages → Entreprise, et cet écran ne fait plus que
 * la lire, masquée.
 */

export default function GestionTarifs({
  tarifs, annee, anneesDisponibles, cotisationMontant, identite,
}: {
  tarifs: Tarif[];
  annee: number;
  anneesDisponibles: number[];
  cotisationMontant: number;
  /**
   * APP 63 — l'identité de paiement en LECTURE SEULE. Elle vit sur
   * `entites_juridiques` et se règle dans Réglages → Entreprise.
   */
  identite: { raisonSociale: string; iban: string | null; qrIban: string | null };
}) {
  const router = useRouter();
  const [tarifsLocaux, setTarifsLocaux] = useState<Record<string, number>>(
    Object.fromEntries(tarifs.map(t => [`${t.categorie}_${t.membre}`, parseFloat(t.prix)]))
  );
  const [cotisation, setCotisation] = useState(cotisationMontant);
  const [nouvelleAnnee, setNouvelleAnnee] = useState(annee + 1);
  const [loading, setLoading] = useState(false);
  const [succes, setSucces] = useState("");

  const getKey = (categorie: string, membre: boolean) => `${categorie}_${membre}`;


  const sauvegarderTarifs = async () => {
    setLoading(true);
    setSucces("");

    const updates = tarifs.map(t => ({
      id: t.id,
      prix: tarifsLocaux[getKey(t.categorie, t.membre)] ?? parseFloat(t.prix),
    }));

    /**
     * UNE SEULE porte : les prix et le montant d'adhésion.
     *
     * Cet écran appelait aussi `/api/entite/coordonnees` avec l'IBAN, le
     * titulaire et l'adresse relus d'anciens réglages. Enregistrer un TARIF
     * réécrivait donc l'identité de l'entreprise : le 29.09.2026 à 20:45 UTC,
     * l'IBAN en vigueur est passé à null et la raison sociale a changé. Cet
     * écran ne touche plus jamais `entites_juridiques`.
     */
    const res = await fetch("/api/tarifs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates, cotisation }),
    });

    if (res.ok) {
      setSucces("✅ Paramètres sauvegardés !");
      router.refresh();
    }
    setLoading(false);
  };

  const copierPourNouvelleAnnee = async () => {
    if (!confirm(`Copier les tarifs ${annee} pour l'année ${nouvelleAnnee} ?`)) return;
    setLoading(true);

    const res = await fetch("/api/tarifs/copier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annee_source: annee, annee_cible: nouvelleAnnee }),
    });

    if (res.ok) {
      setSucces(`✅ Tarifs copiés pour ${nouvelleAnnee} !`);
      router.push(`/tarifs?annee=${nouvelleAnnee}`);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">

      {/* Sélecteur d'année */}
      <div className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="font-semibold text-sm" style={{ color: "#1B2B5E" }}>Année :</label>
          <div className="flex gap-2">
            {anneesDisponibles.map(a => (
              <a key={a} href={`/tarifs?annee=${a}`}
                className="px-3 py-1 rounded-lg text-sm font-semibold"
                style={{
                  backgroundColor: a === annee ? "#1B2B5E" : "#EDE8DF",
                  color: a === annee ? "white" : "#1B2B5E",
                }}>
                {a}
              </a>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <input type="number" value={nouvelleAnnee}
            onChange={e => setNouvelleAnnee(parseInt(e.target.value))}
            className="border rounded-lg p-2 text-sm w-24" />
          <button onClick={copierPourNouvelleAnnee} disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "#4AAEA0" }}>
            📋 Copier pour {nouvelleAnnee}
          </button>
        </div>
      </div>

      {succes && (
        <div className="bg-green-100 text-green-700 px-4 py-3 rounded-xl text-sm font-semibold">
          {succes}
        </div>
      )}

      {/* Cotisation membre */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
          ⭐ Adhésion membre
        </h2>
        <div className="flex items-center gap-4 flex-wrap">
          <label className="font-semibold text-sm" style={{ color: "#1B2B5E" }}>
            Montant annuel (CHF) :
          </label>
          <input type="number" value={cotisation}
            onChange={e => setCotisation(parseFloat(e.target.value))}
            className="border rounded-xl p-3 w-32 text-lg font-bold text-center"
            style={{ color: "#1B2B5E" }} />
          <span className="text-sm text-gray-500">CHF / an — valable 12 mois à partir du 1er du mois de paiement</span>
        </div>
      </div>

      {/*
        APP 63 — l'identité de paiement se LIT ici, elle ne s'y règle plus.

        Cet écran portait des champs IBAN, titulaire et adresse, remplis depuis
        d'anciens réglages de `parametres`. Chaque sauvegarde des PRIX les
        renvoyait à l'entité juridique : le 29.09.2026 à 20:45 UTC, enregistrer
        un tarif a mis l'IBAN en vigueur à null et changé la raison sociale.

        L'IBAN est masqué : on vient vérifier qu'il est bien réglé, pas le lire.
        Il se lit en clair là où il se règle.
      */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-bold mb-1" style={{ color: "#1B2B5E" }}>
          🏦 Coordonnées de paiement
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Servent aux e-mails de paiement et au bulletin QR sur les factures.
          Elles se modifient dans Réglages → Entreprise.
        </p>

        <dl className="text-sm space-y-2" style={{ color: "#1B2B5E" }}>
          <div className="flex gap-2 flex-wrap">
            <dt className="font-semibold">Raison sociale :</dt>
            <dd>{identite.raisonSociale || NON_RENSEIGNE}</dd>
          </div>
          <div className="flex gap-2 flex-wrap">
            <dt className="font-semibold">IBAN :</dt>
            <dd className="font-mono">{ibanMasque(identite.iban) || NON_RENSEIGNE}</dd>
          </div>
          <div className="flex gap-2 flex-wrap">
            <dt className="font-semibold">QR-IBAN :</dt>
            <dd className="font-mono">{ibanMasque(identite.qrIban) || NON_RENSEIGNE}</dd>
          </div>
        </dl>

        {!identite.iban && !identite.qrIban && (
          <p role="alert" className="rounded-xl p-3 text-xs mt-4"
             style={{ backgroundColor: "#FDECEC", color: "#8A1F1F" }}>
            {AVERTISSEMENT_SANS_IBAN}
          </p>
        )}

        <a href="/reglages/entreprise" className="inline-block text-sm font-semibold mt-4"
           style={{ color: "#1F6E5B", textDecoration: "underline" }}>
          Modifier dans Réglages → Entreprise
        </a>
      </div>

      {/* Tableaux de tarifs par groupe */}
      {GROUPES.map(({ label, prefix }) => {
        const categories = [`${prefix}_partage_1`, `${prefix}_partage_2`, `${prefix}_partage_3`, `${prefix}_privatif`];
        // Réservations au tarif membre uniquement : on ne gère plus de colonne non-membre.
        const aMembreUniquement = true;

        return (
          <div key={prefix} className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-4" style={{ color: "#1B2B5E" }}>{label}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left pb-3 text-gray-500 font-semibold">Catégorie</th>
                  {!aMembreUniquement && <th className="pb-3 text-gray-500 font-semibold text-center">Non-membre (CHF)</th>}
                  <th className="pb-3 font-semibold text-center" style={{ color: "#4AAEA0" }}>⭐ Membre (CHF)</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => {
                  const hasTarif = tarifs.some(t => t.categorie === cat);
                  if (!hasTarif) return null;

                  return (
                    <tr key={cat} className="border-t">
                      <td className="py-3 font-medium" style={{ color: "#1B2B5E" }}>
                        {LABELS[cat] || cat}
                      </td>
                      {!aMembreUniquement && (
                        <td className="py-3 text-center">
                          <input
                            type="number"
                            value={tarifsLocaux[getKey(cat, false)] ?? 0}
                            onChange={e => setTarifsLocaux(prev => ({
                              ...prev,
                              [getKey(cat, false)]: parseFloat(e.target.value) || 0,
                            }))}
                            className="border rounded-lg p-2 w-24 text-center font-bold"
                          />
                        </td>
                      )}
                      <td className="py-3 text-center">
                        <input
                          type="number"
                          value={tarifsLocaux[getKey(cat, true)] ?? 0}
                          onChange={e => setTarifsLocaux(prev => ({
                            ...prev,
                            [getKey(cat, true)]: parseFloat(e.target.value) || 0,
                          }))}
                          className="border rounded-lg p-2 w-24 text-center font-bold"
                          style={{ color: "#4AAEA0" }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* Bouton sauvegarder */}
      <div className="flex justify-end">
        <button onClick={sauvegarderTarifs} disabled={loading}
          className="px-8 py-3 rounded-xl font-semibold text-white text-lg disabled:opacity-50"
          style={{ backgroundColor: "#4AAEA0" }}>
          {loading ? "Sauvegarde..." : "💾 Sauvegarder"}
        </button>
      </div>

    </div>
  );
}
