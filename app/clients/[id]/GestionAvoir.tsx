"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ajouterAvoir, retirerAvoir, modifierMouvementAvoir, supprimerMouvementAvoir } from "./actions";
import type { MouvementAvoir } from "../../../src/lib/avoirs";

const LABELS_TYPE: Record<string, string> = {
  ajout_manuel:       "➕ Ajout manuel",
  retrait_manuel:     "➖ Retrait manuel",
  annulation_paiement:"↩️ Annulation paiement",
  utilisation:        "🛒 Utilisation",
  trop_percu:         "↩️ Trop-perçu",
};

export default function GestionAvoir({
  client_id,
  solde,
  mouvements,
}: {
  client_id: string;
  solde: number;
  mouvements: MouvementAvoir[];
}) {
  // ── État formulaire ajout/retrait manuel ─────────────────────────────────
  const [mode, setMode]       = useState<"ajout" | "retrait" | null>(null);
  const [montant, setMontant] = useState("");
  const [motif, setMotif]     = useState("");
  const [loading, setLoading] = useState(false);

  // ── État édition inline ───────────────────────────────────────────────────
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editMontant, setEditMontant] = useState("");
  const [editMotif, setEditMotif]   = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // ── État suppression ──────────────────────────────────────────────────────
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

  const router = useRouter();

  // ── Ajout / retrait manuel ────────────────────────────────────────────────

  const annulerFormulaire = () => {
    setMode(null);
    setMontant("");
    setMotif("");
  };

  const handleSubmitManuel = async () => {
    setLoading(true);
    const formData = new FormData();
    formData.set("client_id", client_id);
    formData.set("montant", montant);
    formData.set("motif", motif);

    const action = mode === "ajout" ? ajouterAvoir : retirerAvoir;
    const res = await action(formData);

    if (res?.error) {
      alert(res.error);
      setLoading(false);
      return;
    }
    annulerFormulaire();
    setLoading(false);
    router.refresh();
  };

  // ── Édition inline ────────────────────────────────────────────────────────

  const ouvrirEdit = (m: MouvementAvoir) => {
    setEditingId(m.id);
    setEditMontant(Math.abs(m.montant).toFixed(2));
    setEditMotif(m.motif ?? "");
  };

  const fermerEdit = () => {
    setEditingId(null);
    setEditMontant("");
    setEditMotif("");
  };

  const handleEditSubmit = async (m: MouvementAvoir) => {
    setEditLoading(true);
    const formData = new FormData();
    formData.set("mouvement_id",    m.id);
    formData.set("client_id",       client_id);
    formData.set("nouveau_montant", editMontant);
    formData.set("nouveau_motif",   editMotif);

    const res = await modifierMouvementAvoir(formData);
    if (res?.error) {
      alert(res.error);
      setEditLoading(false);
      return;
    }
    setEditLoading(false);
    fermerEdit();
    router.refresh();
  };

  // ── Suppression ───────────────────────────────────────────────────────────

  const handleDelete = async (m: MouvementAvoir) => {
    const msg =
      "Supprimer ce mouvement d'avoir ?" +
      (m.reservation_id
        ? " Cela ne modifiera pas le paiement enregistré sur la réservation liée."
        : "");
    if (!confirm(msg)) return;

    setDeleteLoadingId(m.id);
    const formData = new FormData();
    formData.set("mouvement_id", m.id);
    formData.set("client_id",    client_id);

    const res = await supprimerMouvementAvoir(formData);
    if (res?.error) {
      alert(res.error);
      setDeleteLoadingId(null);
      return;
    }
    setDeleteLoadingId(null);
    router.refresh();
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div className="border-t pt-6 mb-8">
      <h2 className="text-2xl font-bold mb-4" style={{ color: "#1B2B5E" }}>
        💳 Avoir client
      </h2>

      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-500 text-sm">Solde actuel</p>
        <p className="text-3xl font-bold" style={{ color: solde < 0 ? "#DC2626" : "#4AAEA0" }}>
          CHF {solde.toFixed(2)}
        </p>
      </div>

      {/* ── Boutons ajout / retrait ── */}
      {mode === null && (
        <div className="flex gap-3 mb-4">
          <button onClick={() => setMode("ajout")}
            className="px-4 py-2 rounded-xl font-semibold text-white"
            style={{ backgroundColor: "#4AAEA0" }}>
            ➕ Ajouter un avoir
          </button>
          <button onClick={() => setMode("retrait")}
            className="px-4 py-2 rounded-xl font-semibold text-white"
            style={{ backgroundColor: "#E8847A" }}>
            ➖ Retirer un avoir
          </button>
        </div>
      )}

      {/* ── Formulaire ajout / retrait ── */}
      {mode !== null && (
        <div className="border-2 rounded-xl p-5 space-y-4 mb-4"
          style={{
            borderColor:       mode === "ajout" ? "#4AAEA0" : "#E8847A",
            backgroundColor:   mode === "ajout" ? "#E8F5F4" : "#FCEEEC",
          }}>
          <p className="font-bold" style={{ color: "#1B2B5E" }}>
            {mode === "ajout" ? "➕ Ajouter un avoir" : "➖ Retirer un avoir"}
          </p>

          <div>
            <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
              Montant (CHF) *
            </label>
            <input type="number" min="0.01" step="0.01" value={montant}
              onChange={e => setMontant(e.target.value)}
              className="border rounded-xl p-2 text-sm w-40" />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
              Motif *
            </label>
            <input type="text" value={motif}
              onChange={e => setMotif(e.target.value)}
              className="border rounded-xl p-2 text-sm w-full" />
          </div>

          <div className="flex gap-3">
            <button onClick={handleSubmitManuel} disabled={loading}
              className="px-5 py-2 rounded-xl font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: mode === "ajout" ? "#4AAEA0" : "#E8847A" }}>
              {loading ? "Enregistrement..." : "💾 Confirmer"}
            </button>
            <button onClick={annulerFormulaire}
              className="px-5 py-2 rounded-xl font-semibold"
              style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
              ✖ Annuler
            </button>
          </div>
        </div>
      )}

      {/* ── Journal des mouvements ── */}
      {mouvements.length > 0 ? (
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Historique</p>

          {mouvements.map((m) => (
            <div key={m.id}>
              {/* Ligne principale */}
              <div className="flex justify-between items-center border rounded-xl p-3 gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm" style={{ color: "#1B2B5E" }}>
                      {LABELS_TYPE[m.type] ?? m.type}
                    </p>
                    {m.reservation_id && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ backgroundColor: "#EFF6FF", color: "#2563EB" }}>
                        Résa {m.reservations?.numero != null ? `#${m.reservations.numero}` : "(liée)"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {m.motif || "—"} — {new Date(m.created_at).toLocaleDateString("fr-CH")}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <p className="font-bold text-sm" style={{ color: m.montant < 0 ? "#DC2626" : "#4AAEA0" }}>
                    {m.montant >= 0 ? "+" : ""}{m.montant.toFixed(2)} CHF
                  </p>
                  <button
                    type="button"
                    onClick={() => editingId === m.id ? fermerEdit() : ouvrirEdit(m)}
                    className="px-2 py-1 rounded-lg text-xs font-semibold border transition"
                    style={{
                      borderColor:     editingId === m.id ? "#4AAEA0" : "#E2E8F0",
                      backgroundColor: editingId === m.id ? "#E8F5F4" : "white",
                      color:           editingId === m.id ? "#4AAEA0" : "#6B7280",
                    }}>
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(m)}
                    disabled={deleteLoadingId === m.id}
                    className="px-2 py-1 rounded-lg text-xs font-semibold border disabled:opacity-50 transition"
                    style={{ borderColor: "#FEE2E2", backgroundColor: "white", color: "#DC2626" }}>
                    {deleteLoadingId === m.id ? "…" : "🗑️"}
                  </button>
                </div>
              </div>

              {/* Formulaire d'édition inline */}
              {editingId === m.id && (
                <div className="mx-1 mb-1 border-2 border-blue-200 rounded-xl p-4 bg-blue-50 space-y-3">
                  {m.reservation_id && (
                    <div className="text-xs rounded-xl px-3 py-2 font-semibold"
                      style={{ backgroundColor: "#FFFBEB", color: "#92400E", border: "1px solid #FDE68A" }}>
                      ⚠️ Cette ligne est liée à une réservation. La modifier ne change PAS le paiement enregistré sur la réservation.
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                        Montant (CHF) *
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={editMontant}
                        onChange={e => setEditMontant(e.target.value)}
                        className="w-full border rounded-xl p-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                        Motif *
                      </label>
                      <input
                        type="text"
                        value={editMotif}
                        onChange={e => setEditMotif(e.target.value)}
                        className="w-full border rounded-xl p-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditSubmit(m)}
                      disabled={editLoading}
                      className="px-4 py-1.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: "#4AAEA0" }}>
                      {editLoading ? "Enregistrement..." : "💾 Enregistrer"}
                    </button>
                    <button
                      type="button"
                      onClick={fermerEdit}
                      className="px-4 py-1.5 rounded-xl text-sm font-semibold"
                      style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-400 text-sm">Aucun mouvement enregistré.</p>
      )}
    </div>
  );
}
