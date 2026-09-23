"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DialogueResultatEssai from "@/app/components/DialogueResultatEssai";
import type { ResultatEssai } from "@/src/lib/journeeEssai";
import { appelerApi } from "@/src/lib/reseau";

export default function BoutonsCheckinDashboard({
  checkin_id,
  statut,
  type,
  est_essai = false,
  nom_chien = "ce chien",
}: {
  checkin_id: string;
  statut: string;
  type: "arrivee" | "depart";
  /** La réservation est-elle une journée d'essai ? (résultat requis au départ) */
  est_essai?: boolean;
  nom_chien?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [dialogueOuvert, setDialogueOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const callAction = async (
    action: string,
    extra: { resultat?: ResultatEssai; note?: string } = {},
  ) => {
    setLoading(true);
    setErreur(null);
    // `toujours` rend la main dans tous les cas : sur cet écran, un bouton qui
    // reste grisé fait croire que l'arrivée est enregistrée alors qu'elle ne
    // l'est pas.
    const res = await appelerApi(
      `Checkin.${action}`,
      `/api/checkin/${checkin_id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      },
      { toujours: () => setLoading(false), siEchec: setErreur },
    );
    if (!res.ok) return;
    setDialogueOuvert(false);
    router.refresh();
  };

  /** Le bouton, et sous lui la phrase quand quelque chose a échoué. */
  const avecMessage = (bouton: React.ReactNode) => (
    <>
      {bouton}
      {erreur && (
        <p role="alert" className="mt-1 text-xs font-semibold" style={{ color: "#8A1F1F" }}>
          {erreur}
        </p>
      )}
    </>
  );

  if (type === "arrivee") {
    if (statut === "attendu") {
      return avecMessage(
        <button
          onClick={() => { void callAction("checkin"); }}
          disabled={loading}
          className="px-4 rounded-lg text-xs font-semibold text-white disabled:opacity-50 inline-flex items-center justify-center"
          style={{ backgroundColor: "#4AAEA0", minHeight: 44 }}>
          {loading ? "…" : "✅ Valider l'arrivée"}
        </button>,
      );
    }
    if (statut === "arrive" || statut === "a_recuperer") {
      return avecMessage(
        <button
          onClick={() => {
            if (!window.confirm("Annuler l'arrivée de ce chien ?")) return;
            void callAction("annuler_checkin");
          }}
          disabled={loading}
          className="px-4 rounded-lg text-xs font-semibold disabled:opacity-50 inline-flex items-center justify-center"
          style={{ backgroundColor: "#F3F4F6", color: "#6B7280", border: "1px solid #E5E7EB", minHeight: 44 }}>
          {loading ? "…" : "↩️ Annuler l'arrivée"}
        </button>,
      );
    }
  }

  if (type === "depart") {
    if (statut === "arrive" || statut === "a_recuperer") {
      return avecMessage(
        <>
          <button
            onClick={() => { if (est_essai) setDialogueOuvert(true); else void callAction("checkout"); }}
            disabled={loading}
            className="px-4 rounded-lg text-xs font-semibold text-white disabled:opacity-50 inline-flex items-center justify-center"
            style={{ backgroundColor: "#E8847A", minHeight: 44 }}>
            {loading ? "…" : "🚪 Valider le départ"}
          </button>
          {dialogueOuvert && (
            <DialogueResultatEssai
              nom_chien={nom_chien}
              loading={loading}
              onAnnuler={() => setDialogueOuvert(false)}
              onValider={(resultat, note) => { void callAction("checkout", { resultat, note }); }}
            />
          )}
        </>,
      );
    }
    if (statut === "parti") {
      return avecMessage(
        <button
          onClick={() => {
            if (!window.confirm("Annuler le départ de ce chien ?")) return;
            void callAction("annuler_checkout");
          }}
          disabled={loading}
          className="px-4 rounded-lg text-xs font-semibold disabled:opacity-50 inline-flex items-center justify-center"
          style={{ backgroundColor: "#F3F4F6", color: "#6B7280", border: "1px solid #E5E7EB", minHeight: 44 }}>
          {loading ? "…" : "↩️ Annuler le départ"}
        </button>,
      );
    }
  }

  return null;
}
