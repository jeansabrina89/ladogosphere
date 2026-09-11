"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import SuggestionBox from "./SuggestionBox";
import { formatBoxLabel } from "@/src/lib/boxes";

import SelectHeure from "@/app/components/SelectHeure";
import {
  TYPES_SEJOUR,
  infoTypeSejour,
  typeSejour,
  typesSejourAutorises,
} from "@/src/lib/typeSejour";

export default function FormModifierReservation({ id }: { id: string }) {
  const router = useRouter();
  const [res, setRes] = useState<any>(null);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [boxId, setBoxId] = useState("");
  const [loading, setLoading] = useState(false);
  const [peutUrgence, setPeutUrgence] = useState(false);
  // Le type au chargement : c'est lui qui dit s'il y a requalification.
  const [typeSejourInitial, setTypeSejourInitial] = useState("pension");
  const [typeSejourChoisi, setTypeSejourChoisi] = useState("pension");

  useEffect(() => {
    fetch(`/api/reservations/${id}/details`)
      .then(r => r.json())
      .then(data => {
        setRes(data.reservation);
        setBoxes(data.boxes);
        setBoxId(data.reservation?.box_id || "");
        setPeutUrgence(!!data.peutUrgence);
        const t = typeSejour(data.reservation?.type_sejour);
        setTypeSejourInitial(t);
        setTypeSejourChoisi(t);
      });
  }, [id]);

  if (!res) return <div className="p-8">Chargement...</div>;

  const chien_ids = res.reservation_chiens?.map((rc: any) => rc.chien_id) ?? [];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("box_id", boxId);

    const response = await fetch(`/api/reservations/${id}/modifier`, {
      method: "POST",
      body: formData,
    });

    if (response.ok) {
      router.push(`/reservations/${id}`);
      router.refresh();
    } else {
      alert("Erreur lors de la modification.");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto bg-white rounded-xl p-8 shadow-sm">

        <h1 className="text-4xl font-bold mb-6" style={{ color: "#1B2B5E" }}>
          ✏️ Modifier la réservation
        </h1>

        {/* Résumé */}
        <div className="bg-slate-50 rounded-xl p-4 mb-6 space-y-2 text-sm">
          <p><strong>Client :</strong> {res.clients?.prenom} {res.clients?.nom}
            {res.clients?.membre && <span className="ml-2 text-green-600">⭐ Membre</span>}
          </p>
          <p><strong>Chien(s) :</strong> {res.reservation_chiens?.map((rc: any) => rc.chiens?.nom).join(", ") || "—"}</p>
          <p><strong>Type :</strong> {res.type_reservation === "journee" ? "Journée" : "Séjour"}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Statut */}
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Statut</label>
            <select name="statut" defaultValue={res.statut}
              className="w-full border rounded-xl p-3">
              <option value="en_attente">⏳ En attente</option>
              <option value="validee">✅ Validée</option>
              <option value="refusee">❌ Refusée</option>
              <option value="annulee">🚫 Annulée</option>
              <option value="terminee">🏁 Terminée</option>
            </select>
          </div>

          {/* Box avec suggestions */}
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Box assigné</label>
            <select value={boxId} onChange={e => setBoxId(e.target.value)}
              className="w-full border rounded-xl p-3 mb-2">
              <option value="">-- Pas encore assigné --</option>
              {boxes.map((b: any) => (
                <option key={b.id} value={b.id}>{formatBoxLabel(b)}</option>
              ))}
            </select>

            <SuggestionBox
              chien_ids={chien_ids}
              date_debut={res.date_debut}
              date_fin={res.date_fin}
              heure_arrivee={res.heure_arrivee}
              heure_depart={res.heure_depart}
              type_reservation={res.type_reservation}
              reservation_id={id}
              onSelectBox={(box_id) => setBoxId(box_id)}
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Date début</label>
              <input name="date_debut" type="date"
                defaultValue={res.date_debut}
                className="w-full border rounded-xl p-3" />
            </div>
            <div>
              <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Date fin</label>
              <input name="date_fin" type="date"
                defaultValue={res.date_fin}
                className="w-full border rounded-xl p-3" />
            </div>
          </div>

          {/* Heures */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                Heure arrivée
                <span className="text-gray-400 font-normal text-xs ml-1">(7h30–19h)</span>
              </label>
              <SelectHeure
                name="heure_arrivee"
                defaultValue={res.heure_arrivee || ""}
                className="w-full border rounded-xl p-3"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                Heure départ
                <span className="text-gray-400 font-normal text-xs ml-1">(7h30–19h)</span>
              </label>
              <SelectHeure
                name="heure_depart"
                defaultValue={res.heure_depart || ""}
                className="w-full border rounded-xl p-3"
              />
            </div>
          </div>

          {/* Requalifier le séjour : ce n'est pas une correction de saisie,
              c'est une décision qui déplace des chiffres. Motif obligatoire. */}
          <div>
            <label htmlFor="type_sejour" className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
              Type de séjour
            </label>
            <select
              id="type_sejour"
              name="type_sejour"
              value={typeSejourChoisi}
              onChange={(e) => setTypeSejourChoisi(e.target.value)}
              className="w-full border rounded-xl p-3"
            >
              {TYPES_SEJOUR.filter((t) =>
                typesSejourAutorises({ peutTarifsUrgence: peutUrgence }).includes(t.valeur)
              ).map((t) => (
                <option key={t.valeur} value={t.valeur}>{t.libelle}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {infoTypeSejour(typeSejourChoisi).aide}
            </p>

            {typeSejourChoisi !== typeSejourInitial && (
              <div className="mt-3 rounded-xl p-3" style={{ backgroundColor: "#F4EAC9", border: "1px solid #C9A84C" }}>
                <label htmlFor="motif_type_sejour" className="block font-semibold text-sm mb-1" style={{ color: "#6E5410" }}>
                  Pourquoi ce changement ?
                </label>
                <input
                  id="motif_type_sejour"
                  name="motif_type_sejour"
                  type="text"
                  required
                  placeholder="Chien laissé sur place, propriétaire injoignable…"
                  className="w-full border rounded-xl p-2 text-sm"
                />
                <p className="text-xs mt-1" style={{ color: "rgba(110,84,16,0.85)" }}>
                  De « {infoTypeSejour(typeSejourInitial).libelle} » à «{" "}
                  {infoTypeSejour(typeSejourChoisi).libelle}{" "}». Le motif part au journal :
                  cette requalification déplace des montants hors du chiffre d&apos;affaires,
                  ou les y ramène.
                </p>
              </div>
            )}
          </div>

          {/* Urgence — visible si admin ou permission perm_tarifs_urgence */}
          {peutUrgence && (
            <div className="flex items-center gap-2">
              <input type="checkbox" name="urgence" id="urgence"
                defaultChecked={res.urgence} />
              <label htmlFor="urgence" className="font-semibold" style={{ color: "#1B2B5E" }}>
                🚨 Réservation urgence
              </label>
            </div>
          )}

          {/* Commentaire */}
          <div>
            <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Commentaire admin</label>
            <textarea name="commentaire_admin" rows={3}
              defaultValue={res.commentaire_admin || ""}
              className="w-full border rounded-xl p-3" />
          </div>

          {/* Boutons */}
          <div className="flex flex-wrap gap-3 pt-4 border-t">
            <button type="submit" disabled={loading}
              className="px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "#4AAEA0" }}>
              {loading ? "Enregistrement..." : "💾 Enregistrer"}
            </button>
            <a href={`/reservations/${id}`}
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