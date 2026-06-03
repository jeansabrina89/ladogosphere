"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "../../src/lib/supabase-browser";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("Email ou mot de passe incorrect.");
      setLoading(false);
      return;
    }

    // Vérifier le rôle et rediriger
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    if (profile?.role === "client") {
      router.push("/mon-compte");
    } else {
      router.push("/");
    }
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {error && (
        <div className="bg-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Email</label>
        <input type="email" required
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border rounded-xl p-3"
          placeholder="votre@email.com" />
      </div>

      <div>
        <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Mot de passe</label>
        <input type="password" required
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full border rounded-xl p-3"
          placeholder="••••••••" />
      </div>

      <button type="submit" disabled={loading}
        className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: "#4AAEA0" }}>
        {loading ? "Connexion..." : "Se connecter"}
      </button>

    </form>
  );
}