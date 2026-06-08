"use client";

import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "../../src/lib/supabase-browser";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [succes, setSucces] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError("Erreur lors de la mise à jour. Le lien a peut-être expiré.");
    } else {
      setSucces(true);
      setTimeout(() => router.push("/login"), 3000);
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-8"
      style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-md w-full bg-white rounded-xl p-8 shadow-lg">
        <div className="text-center mb-8">
          <img src="/Logo.png" alt="La Dogosphère"
            className="h-24 w-24 rounded-full object-cover mx-auto mb-4" />
          <h1 className="text-2xl font-bold" style={{ color: "#1B2B5E" }}>
            Nouveau mot de passe
          </h1>
          <p className="text-gray-500 mt-2 text-sm">Choisissez un nouveau mot de passe sécurisé</p>
        </div>

        {succes ? (
          <div className="bg-green-100 text-green-700 px-4 py-4 rounded-xl text-sm text-center">
            <p className="font-bold mb-1">✅ Mot de passe mis à jour !</p>
            <p>Vous allez être redirigé vers la page de connexion...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
            )}
            <div>
              <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                Nouveau mot de passe
              </label>
              <input type="password" required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border rounded-xl p-3"
                placeholder="••••••••"
                minLength={8} />
              <p className="text-xs text-gray-400 mt-1">Minimum 8 caractères</p>
            </div>
            <div>
              <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
                Confirmer le mot de passe
              </label>
              <input type="password" required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full border rounded-xl p-3"
                placeholder="••••••••" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "#4AAEA0" }}>
              {loading ? "Mise à jour..." : "🔑 Mettre à jour le mot de passe"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}