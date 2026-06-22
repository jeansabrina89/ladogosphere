"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FormTimbrage({
  employe_id,
  date,
  timbrage,
}: {
  employe_id: string;
  date: string;
  timbrage: any;
}) {
  const [mode, setMode] = useState<"travail" | "absence">(
    timbrage?.type_absence ? "absence" : "travail"
  );
  const [heureDebutMatin, setHeureDebutMatin] = useState(timbrage?.heure_debut_matin?.slice(0, 5) || "07:30");
  const [heureFinMatin, setHeureFinMatin] = useState(timbrage?.heure_fin_matin?.slice(0, 5) || "12:00");
  const [heureDebutAprem, setHeureDebutAprem] = useState(timbrage?.heure_debut_aprem?.slice(0, 5) || "14:30");
  const [heureFinAprem, setHeureFinAprem] = useState(timbrage?.heure_fin_aprem?.slice(0, 5) || "18:30");
  const [typeAbsence, setTypeAbsence] = useState(timbrage?.type_absence || "maladie");
  const [note, setNote] = useState(timbrage?.note || "");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const heuresMatin = calculerDuree(heureDebutMatin, heureFinMatin);
  const heuresAprem = calculerDuree(heureDebutAprem, heureFinAprem);
  const totalHeures = heuresMatin + heuresAprem;

  const handleSubmit = async () => {
    setLoading(true);
    const body = mode === "travail" ? {
      employe_id, date,
      heure_debut_matin: heureDebutMatin,
      heure_fin_matin: heureFinMatin,
      heure_debut_aprem: heureDebutAprem,
      heure_fin_aprem: heureFinAprem,
      type_absence: null,
      note: note || null,
    } : {
      employe_id, date,
      type_absence: typeAbsence,
      note: note || null,
    };

    await fetch("/api/rh/timbrage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSuccess(true);
    setLoading(false);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {success && (
        <div className="px-4 py-3 rounded-xl text-sm font-semibold" style={{ backgroundColor: "#E8F5F4", color: "#2E8B7E" }}>
          ✅ Timbrage enregistré !
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={() => setMode("travail")}
          className="flex-1 py-2 rounded-xl font-semibold text-sm border-2 transition"
          style={{
            borderColor: mode === "travail" ? "#4AAEA0" : "rgba(27,43,94,0.12)",
            backgroundColor: mode === "travail" ? "#4AAEA0" : "white",
            color: mode === "travail" ? "white" : "#1B2B5E",
          }}>
          ✅ Jour travaillé
        </button>
        <button onClick={() => setMode("absence")}
          className="flex-1 py-2 rounded-xl font-semibold text-sm border-2 transition"
          style={{
            borderColor: mode === "absence" ? "#E8847A" : "rgba(27,43,94,0.12)",
            backgroundColor: mode === "absence" ? "#E8847A" : "white",
            color: mode === "absence" ? "white" : "#1B2B5E",
          }}>
          🏥 Absence
        </button>
      </div>

      {mode === "travail" ? (
        <>
          <div className="border rounded-xl p-4">
            <p className="font-semibold mb-3 text-sm" style={{ color: "#1B2B5E" }}>🌅 Matin</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[rgba(27,43,94,0.5)]">Début</label>
                <input type="time" value={heureDebutMatin}
                  onChange={e => setHeureDebutMatin(e.target.value)}
                  className="w-full border rounded-xl p-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-[rgba(27,43,94,0.5)]">Fin</label>
                <input type="time" value={heureFinMatin}
                  onChange={e => setHeureFinMatin(e.target.value)}
                  className="w-full border rounded-xl p-2 text-sm" />
              </div>
            </div>
            <p className="text-xs text-[rgba(27,43,94,0.4)] mt-2">{heuresMatin.toFixed(1)}h</p>
          </div>

          <div className="border rounded-xl p-4">
            <p className="font-semibold mb-3 text-sm" style={{ color: "#1B2B5E" }}>🌇 Après-midi</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[rgba(27,43,94,0.5)]">Début</label>
                <input type="time" value={heureDebutAprem}
                  onChange={e => setHeureDebutAprem(e.target.value)}
                  className="w-full border rounded-xl p-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-[rgba(27,43,94,0.5)]">Fin</label>
                <input type="time" value={heureFinAprem}
                  onChange={e => setHeureFinAprem(e.target.value)}
                  className="w-full border rounded-xl p-2 text-sm" />
              </div>
            </div>
            <p className="text-xs text-[rgba(27,43,94,0.4)] mt-2">{heuresAprem.toFixed(1)}h</p>
          </div>

          <div className="text-right font-bold" style={{ color: "#4AAEA0" }}>
            Total : {totalHeures.toFixed(1)}h
          </div>
        </>
      ) : (
        <div className="border rounded-xl p-4">
          <label className="block font-semibold mb-2 text-sm" style={{ color: "#1B2B5E" }}>
            Type d'absence
          </label>
          <select value={typeAbsence} onChange={e => setTypeAbsence(e.target.value)}
            className="w-full border rounded-xl p-3 mb-3">
            <option value="maladie">🤒 Maladie</option>
            <option value="accident">🤕 Accident</option>
            <option value="militaire">🎖️ Service militaire</option>
            <option value="vacances">🏖️ Vacances</option>
            <option value="autre">📋 Autre</option>
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
          Note (optionnel)
        </label>
        <input type="text" value={note} onChange={e => setNote(e.target.value)}
          placeholder="Remarque..."
          className="w-full border rounded-xl p-3 text-sm" />
      </div>

      <button onClick={handleSubmit} disabled={loading}
        className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: "#4AAEA0" }}>
        {loading ? "Enregistrement..." : timbrage ? "💾 Modifier" : "💾 Enregistrer"}
      </button>
    </div>
  );
}

function calculerDuree(debut: string, fin: string): number {
  if (!debut || !fin) return 0;
  const [hD, mD] = debut.split(":").map(Number);
  const [hF, mF] = fin.split(":").map(Number);
  return (hF * 60 + mF - (hD * 60 + mD)) / 60;
}