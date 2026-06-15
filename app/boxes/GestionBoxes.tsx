"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { creerBox, modifierBox, ajouterIndisponibilite, supprimerIndisponibilite } from "./actions";
import { formatBoxLabel } from "../../src/lib/boxes";
import { formatDateFR } from "../../src/lib/dates";

type Indisponibilite = {
  id: string;
  box_id: string;
  date_debut: string;
  date_fin: string;
  motif: string | null;
};

type Box = {
  id: string;
  numero: number;
  nom: string | null;
  capacite_standard: number | null;
  capacite_petits_chiens: number | null;
  notes: string | null;
  actif: boolean;
};

export default function GestionBoxes({
  boxes, indisponibilites,
}: {
  boxes: Box[];
  indisponibilites: Indisponibilite[];
}) {
  const router = useRouter();
  const [boxOuvert, setBoxOuvert] = useState<string | null>(null);
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState("");

  const indisposParBox = (box_id: string) =>
    indisponibilites.filter(i => i.box_id === box_id);

  const handleCreerBox = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setErreur("");
    const form = e.currentTarget;
    const formData = new FormData(form);
    const res = await creerBox(formData);
    if (res.error) {
      setErreur(res.error);
    } else {
      setAjoutOuvert(false);
      form.reset();
      router.refresh();
    }
    setLoading(false);
  };

  const handleModifierBox = async (id: string, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setErreur("");
    const formData = new FormData(e.currentTarget);
    const res = await modifierBox(id, formData);
    if (res.error) setErreur(res.error);
    router.refresh();
    setLoading(false);
  };

  const handleAjouterIndispo = async (box_id: string, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setErreur("");
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("box_id", box_id);
    const res = await ajouterIndisponibilite(formData);
    if (res.error) {
      setErreur(res.error);
    } else {
      form.reset();
      router.refresh();
    }
    setLoading(false);
  };

  const handleSupprimerIndispo = async (id: string) => {
    if (!confirm("Supprimer cette indisponibilité ?")) return;
    setLoading(true);
    const res = await supprimerIndisponibilite(id);
    if (res.error) setErreur(res.error);
    router.refresh();
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      {erreur && (
        <div className="bg-red-100 text-red-700 px-4 py-3 rounded-xl text-sm font-semibold">
          ❌ {erreur}
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={() => setAjoutOuvert(!ajoutOuvert)}
          className="px-4 py-2 rounded-xl font-semibold text-white"
          style={{ backgroundColor: "#4AAEA0" }}>
          {ajoutOuvert ? "✖ Annuler" : "➕ Nouvelle box"}
        </button>
      </div>

      {ajoutOuvert && (
        <form onSubmit={handleCreerBox} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-bold" style={{ color: "#1B2B5E" }}>➕ Nouvelle box</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Numéro *</label>
              <input name="numero" type="number" required
                className="w-full border rounded-xl p-2" />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Nom (optionnel)</label>
              <input name="nom" type="text" placeholder="ex: Box du jardin"
                className="w-full border rounded-xl p-2" />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Capacité standard</label>
              <input name="capacite_standard" type="number"
                className="w-full border rounded-xl p-2" />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Capacité petits chiens</label>
              <input name="capacite_petits_chiens" type="number"
                className="w-full border rounded-xl p-2" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Notes</label>
            <textarea name="notes" rows={2} className="w-full border rounded-xl p-2" />
          </div>
          <button type="submit" disabled={loading}
            className="px-6 py-2 rounded-xl font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "#4AAEA0" }}>
            {loading ? "Création..." : "💾 Créer la box"}
          </button>
        </form>
      )}

      <div className="grid gap-4">
        {boxes.map(box => {
          const indispos = indisposParBox(box.id);
          const estOuvert = boxOuvert === box.id;

          return (
            <div key={box.id} className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div>
                  <p className="font-bold text-lg" style={{ color: "#1B2B5E" }}>
                    {formatBoxLabel(box)}
                    {box.nom && <span className="ml-2 text-sm font-normal text-gray-400">(N° {box.numero})</span>}
                  </p>
                  <p className="text-sm text-gray-500">
                    Capacité standard : {box.capacite_standard ?? "—"} · Petits chiens : {box.capacite_petits_chiens ?? "—"}
                  </p>
                  {box.notes && <p className="text-sm text-gray-400 mt-1">📝 {box.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    box.actif ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>
                    {box.actif ? "✅ Active" : "🚫 Désactivée"}
                  </span>
                  {indispos.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                      {indispos.length} indispo.
                    </span>
                  )}
                  <button onClick={() => setBoxOuvert(estOuvert ? null : box.id)}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold"
                    style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
                    {estOuvert ? "✖ Fermer" : "✏️ Gérer"}
                  </button>
                </div>
              </div>

              {estOuvert && (
                <div className="mt-4 pt-4 border-t space-y-6">

                  <form onSubmit={e => handleModifierBox(box.id, e)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold mb-1">Nom</label>
                        <input name="nom" type="text" defaultValue={box.nom ?? ""}
                          placeholder={`Box ${box.numero}`}
                          className="w-full border rounded-xl p-2" />
                      </div>
                      <div className="flex items-center">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" name="actif" defaultChecked={box.actif} />
                          <span className="text-sm font-semibold">Box active</span>
                        </label>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-1">Capacité standard</label>
                        <input name="capacite_standard" type="number" defaultValue={box.capacite_standard ?? ""}
                          className="w-full border rounded-xl p-2" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-1">Capacité petits chiens</label>
                        <input name="capacite_petits_chiens" type="number" defaultValue={box.capacite_petits_chiens ?? ""}
                          className="w-full border rounded-xl p-2" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1">Notes</label>
                      <textarea name="notes" rows={2} defaultValue={box.notes ?? ""}
                        className="w-full border rounded-xl p-2" />
                    </div>
                    <p className="text-xs text-gray-400">
                      Le numéro de box (N° {box.numero}) est fixé à la création et ne peut pas être modifié.
                    </p>
                    <button type="submit" disabled={loading}
                      className="px-6 py-2 rounded-xl font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: "#4AAEA0" }}>
                      {loading ? "Enregistrement..." : "💾 Enregistrer"}
                    </button>
                  </form>

                  <div>
                    <h3 className="font-semibold mb-2" style={{ color: "#1B2B5E" }}>🚫 Indisponibilités</h3>
                    {indispos.length === 0 ? (
                      <p className="text-sm text-gray-400 mb-3">Aucune période d'indisponibilité.</p>
                    ) : (
                      <div className="space-y-2 mb-3">
                        {indispos.map(i => (
                          <div key={i.id} className="flex justify-between items-center bg-slate-50 rounded-lg p-3 text-sm">
                            <div>
                              <p className="font-semibold" style={{ color: "#1B2B5E" }}>
                                {formatDateFR(i.date_debut)} → {formatDateFR(i.date_fin)}
                              </p>
                              {i.motif && <p className="text-gray-500">{i.motif}</p>}
                            </div>
                            <button onClick={() => handleSupprimerIndispo(i.id)} disabled={loading}
                              className="text-red-500 hover:text-red-700 text-xs font-semibold disabled:opacity-50">
                              🗑️ Supprimer
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <form onSubmit={e => handleAjouterIndispo(box.id, e)} className="flex flex-wrap gap-2 items-end">
                      <div>
                        <label className="block text-xs font-semibold mb-1">Du</label>
                        <input name="date_debut" type="date" required className="border rounded-lg p-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1">Au</label>
                        <input name="date_fin" type="date" required className="border rounded-lg p-2 text-sm" />
                      </div>
                      <div className="flex-1 min-w-[150px]">
                        <label className="block text-xs font-semibold mb-1">Motif (optionnel)</label>
                        <input name="motif" type="text" className="w-full border rounded-lg p-2 text-sm" />
                      </div>
                      <button type="submit" disabled={loading}
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                        style={{ backgroundColor: "#C9A84C" }}>
                        ➕ Ajouter
                      </button>
                    </form>
                  </div>

                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
