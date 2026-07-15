"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Carte from "@/app/components/ui/Carte";
import EtatVide from "@/app/components/ui/EtatVide";
import { formatDateFR } from "@/src/lib/dates";

type Facture = { statut: string; numero: string | null };
type Resa = {
  id: string;
  numero: number | null;
  type_reservation: string;
  date_debut: string;
  date_fin: string;
  chiens: string[];
  reste: number;
  facture: Facture | null;
};
type ClientGroupe = { client_id: string; nom: string; reservations: Resa[] };

function libelleType(t: string): string {
  if (t === "journee") return "Journée";
  if (t === "sejour") return "Séjour";
  if (t === "essai") return "Journée d'essai";
  return t;
}

export default function FactureGroupeeClient({
  clients,
}: {
  clients: ClientGroupe[];
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string>("");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const client = clients.find((c) => c.client_id === clientId) || null;
  const resas = client?.reservations ?? [];
  const selected = resas.filter((r) => selection.has(r.id));
  const total = selected.reduce((s, r) => s + r.reste, 0);
  const aDesEnvoyees = selected.some((r) => r.facture?.statut === "envoyee");

  const changerClient = (id: string) => {
    setClientId(id);
    setSelection(new Set());
    setErreur(null);
  };

  const toggle = (id: string) => {
    setSelection((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setErreur(null);
  };

  const generer = async () => {
    if (selection.size === 0) return;
    setLoading(true);
    setErreur(null);
    try {
      const res = await fetch("/api/factures/groupee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservation_ids: Array.from(selection) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Erreur inconnue.");
        setLoading(false);
        return;
      }
      router.push(`/factures/${data.facture_id}`);
    } catch {
      setErreur("Erreur réseau.");
      setLoading(false);
    }
  };

  if (clients.length === 0) {
    return (
      <Carte>
        <EtatVide
          icone="✅"
          titre="Aucune réservation à facturer"
          message="Toutes les réservations sont réglées."
        />
      </Carte>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(27,43,94,0.2)",
    fontSize: 15,
    color: "#1B2B5E",
    background: "#fff",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        paddingBottom: selection.size > 0 ? 96 : 0,
      }}
    >
      <Carte>
        <label
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 600,
            color: "#1B2B5E",
            marginBottom: 6,
          }}
        >
          Client
        </label>
        <select
          style={inputStyle}
          value={clientId}
          onChange={(e) => changerClient(e.target.value)}
        >
          <option value="">— Choisir un client —</option>
          {clients.map((c) => (
            <option key={c.client_id} value={c.client_id}>
              {c.nom} ({c.reservations.length} à régler)
            </option>
          ))}
        </select>
      </Carte>

      {client && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {resas.map((r) => {
            const cochee = selection.has(r.id);
            return (
              <Carte key={r.id} className={cochee ? "ring-2 ring-[#2E8B7E]" : ""}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={cochee}
                    onChange={() => toggle(r.id)}
                    style={{
                      width: 20,
                      height: 20,
                      marginTop: 4,
                      accentColor: "#2E8B7E",
                      cursor: "pointer",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, color: "#1B2B5E" }}>
                      {libelleType(r.type_reservation)}
                      {r.numero ? ` · #${r.numero}` : ""}
                    </p>
                    <p
                      style={{
                        margin: "2px 0 0 0",
                        fontSize: 13,
                        color: "rgba(27,43,94,0.6)",
                      }}
                    >
                      🐶 {r.chiens.join(", ") || "—"} · 📅{" "}
                      {formatDateFR(r.date_debut)} → {formatDateFR(r.date_fin)}
                    </p>
                    {r.facture && (
                      <p
                        style={{
                          margin: "4px 0 0 0",
                          fontSize: 12,
                          fontWeight: 600,
                          color:
                            r.facture.statut === "envoyee" ? "#A8453A" : "#8A6D1F",
                        }}
                      >
                        {r.facture.statut === "envoyee"
                          ? `⚠️ Déjà sur la facture ${
                              r.facture.numero ?? ""
                            } (envoyée) — elle sera annulée`
                          : "Brouillon existant — il sera remplacé"}
                      </p>
                    )}
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontWeight: 700,
                      color: "#1B2B5E",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.reste.toFixed(2)} CHF
                  </p>
                </label>
              </Carte>
            );
          })}
        </div>
      )}

      {selection.size > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 border-t shadow-2xl px-6 py-4 flex items-center justify-between gap-4 flex-wrap"
          style={{ backgroundColor: "#1B2B5E", color: "white" }}
        >
          <div>
            <p className="font-bold text-lg">
              {selection.size} réservation{selection.size > 1 ? "s" : ""} · CHF{" "}
              {total.toFixed(2)}
            </p>
            {aDesEnvoyees && (
              <p className="text-sm" style={{ color: "#FCD34D" }}>
                ⚠️ Une facture déjà envoyée sera annulée et remplacée.
              </p>
            )}
            {erreur && (
              <p className="text-sm font-semibold" style={{ color: "#FCA5A5" }}>
                ❌ {erreur}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setSelection(new Set())}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
            >
              Effacer
            </button>
            <button
              onClick={generer}
              disabled={loading}
              className="px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
              style={{ backgroundColor: "#2E8B7E" }}
            >
              {loading ? "Création…" : "🧾 Générer la facture groupée"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
