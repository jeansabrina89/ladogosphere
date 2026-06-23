"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Carte from "@/app/components/ui/Carte";

type Compte = { numero: string; libelle: string; type: string };
type Ligne = { compte: string; debit: string; credit: string };

export default function FormEcriture({ comptes }: { comptes: Compte[] }) {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [libelle, setLibelle] = useState("");
  const [lignes, setLignes] = useState<Ligne[]>([
    { compte: "", debit: "", credit: "" },
    { compte: "", debit: "", credit: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState("");

  const totalDebit = lignes.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lignes.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const equilibre = Math.round(totalDebit * 100) === Math.round(totalCredit * 100) && totalDebit > 0;

  const majLigne = (i: number, champ: keyof Ligne, val: string) => {
    const copie = [...lignes];
    copie[i] = { ...copie[i], [champ]: val };
    if (champ === "debit" && val) copie[i].credit = "";
    if (champ === "credit" && val) copie[i].debit = "";
    setLignes(copie);
  };

  const ajouterLigne = () => setLignes([...lignes, { compte: "", debit: "", credit: "" }]);
  const retirerLigne = (i: number) => setLignes(lignes.filter((_, idx) => idx !== i));

  const enregistrer = async () => {
    setErreur("");
    if (!libelle.trim()) { setErreur("Indique un libellé."); return; }
    const lignesValides = lignes
      .filter(l => l.compte && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0))
      .map(l => ({ compte: l.compte, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 }));
    if (lignesValides.length < 2) { setErreur("Il faut au moins deux lignes (un débit et un crédit)."); return; }
    if (!equilibre) { setErreur("L'écriture n'est pas équilibrée (total débit ≠ total crédit)."); return; }

    setLoading(true);
    const res = await fetch("/api/comptabilite/ecritures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, libelle, lignes: lignesValides }),
    });
    setLoading(false);
    if (res.ok) {
      setLibelle("");
      setLignes([{ compte: "", debit: "", credit: "" }, { compte: "", debit: "", credit: "" }]);
      router.refresh();
    } else {
      const d = await res.json();
      setErreur(d.error || "Erreur lors de l'enregistrement.");
    }
  };

  const inputClass = "rounded-lg p-2 text-sm border border-[rgba(27,43,94,0.18)]";

  return (
    <Carte>
      <h2 className="font-bold mb-4" style={{ color: "#1B2B5E" }}>➕ Nouvelle écriture (saisie manuelle)</h2>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-sm font-semibold mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`w-full ${inputClass}`} />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-semibold mb-1">Libellé</label>
          <input type="text" value={libelle} onChange={e => setLibelle(e.target.value)} placeholder="Ex : Loyer juin, achat croquettes…" className={`w-full ${inputClass}`} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-2 text-xs font-semibold" style={{ color: "rgba(27,43,94,0.55)" }}>
          <div className="col-span-6">Compte</div>
          <div className="col-span-2 text-right">Débit</div>
          <div className="col-span-2 text-right">Crédit</div>
          <div className="col-span-2"></div>
        </div>
        {lignes.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <select value={l.compte} onChange={e => majLigne(i, "compte", e.target.value)} className={`col-span-6 ${inputClass}`}>
              <option value="">— compte —</option>
              {comptes.map(c => <option key={c.numero} value={c.numero}>{c.numero} — {c.libelle}</option>)}
            </select>
            <input type="number" step="0.05" value={l.debit} onChange={e => majLigne(i, "debit", e.target.value)} className={`col-span-2 text-right ${inputClass}`} />
            <input type="number" step="0.05" value={l.credit} onChange={e => majLigne(i, "credit", e.target.value)} className={`col-span-2 text-right ${inputClass}`} />
            <button type="button" onClick={() => retirerLigne(i)} className="col-span-2 text-sm" style={{ color: "#E8847A" }}>retirer</button>
          </div>
        ))}
      </div>

      <button type="button" onClick={ajouterLigne} className="mt-2 px-3 py-1 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: "#4AAEA0" }}>➕ Ligne</button>

      <div className="flex justify-end gap-6 mt-4 text-sm font-bold" style={{ color: equilibre ? "#1F6E5B" : "#A8453A" }}>
        <span>Débit : CHF {totalDebit.toFixed(2)}</span>
        <span>Crédit : CHF {totalCredit.toFixed(2)}</span>
        <span>{equilibre ? "✓ équilibré" : "⚠ déséquilibré"}</span>
      </div>

      {erreur && <div className="mt-3 rounded-lg p-3 text-sm" style={{ backgroundColor: "#FBE2DE", color: "#A8453A" }}>{erreur}</div>}

      <div className="mt-4">
        <button type="button" onClick={enregistrer} disabled={loading || !equilibre} className="px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "#2E8B7E" }}>
          {loading ? "Enregistrement…" : "💾 Enregistrer l'écriture"}
        </button>
      </div>
    </Carte>
  );
}
