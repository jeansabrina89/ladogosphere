"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/src/utils/supabase/client";

const supabase = createClient();

export default function ChangerMotDePassePage() {
  const router = useRouter();
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState("");
  const [succes, setSucces] = useState(false);
  const [enCours, setEnCours] = useState(false);

  async function enregistrer() {
    setErreur("");
    if (nouveau.length < 8) {
      setErreur("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (nouveau !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setEnCours(true);
    const { error } = await supabase.auth.updateUser({ password: nouveau });
    setEnCours(false);
    if (error) {
      setErreur("Erreur : " + error.message);
      return;
    }
    setSucces(true);
    setNouveau("");
    setConfirmation("");
  }

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-md mx-auto">

        <div className="flex items-center gap-3 mb-6">
          <a href="/employes/mon-espace"
            className="px-3 py-2 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
            ← Retour
          </a>
          <h1 className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>
            🔑 Changer mon mot de passe
          </h1>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">

          {succes ? (
            <div className="text-center py-6">
              <p className="text-2xl mb-3">✅</p>
              <p className="font-semibold text-green-700">Mot de passe modifié avec succès.</p>
              <button
                onClick={() => router.push("/employes/mon-espace")}
                className="mt-4 px-5 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ backgroundColor: "#4AAEA0" }}>
                Retour à mon espace
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                  Nouveau mot de passe
                </label>
                <input
                  type="password"
                  value={nouveau}
                  onChange={e => setNouveau(e.target.value)}
                  placeholder="minimum 8 caractères"
                  className="w-full border rounded-xl p-3"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                  Confirmer le mot de passe
                </label>
                <input
                  type="password"
                  value={confirmation}
                  onChange={e => setConfirmation(e.target.value)}
                  placeholder="répéter le mot de passe"
                  className="w-full border rounded-xl p-3"
                />
              </div>

              {erreur && (
                <p className="text-sm font-semibold text-red-600">{erreur}</p>
              )}

              <button
                onClick={enregistrer}
                disabled={enCours}
                className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#4AAEA0" }}>
                {enCours ? "Enregistrement…" : "💾 Enregistrer le nouveau mot de passe"}
              </button>
            </>
          )}
        </div>

      </div>
    </main>
  );
}
