"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/src/lib/supabase-browser";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

export default function InscriptionForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [voirMdp, setVoirMdp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError("Erreur : " + signUpError.message);
      setLoading(false);
      return;
    }

    // Lier au profil client existant si l'email correspond
    if (data.user) {
      await supabase
        .from("clients")
        .update({ auth_user_id: data.user.id })
        .eq("email", email);

      // Créer un profil dans profiles
      await supabase.from("profiles").upsert({
        id: data.user.id,
        email,
        role: "client",
        actif: true,
      });
    }

    router.push("/mon-compte");
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
        <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
          Email *
        </label>
        <input type="email" required value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border rounded-xl p-3"
          placeholder="votre@email.com" />
      </div>

      <div>
        <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
          Mot de passe *
        </label>
        <div className="relative">
          <input type={voirMdp ? "text" : "password"} required value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border rounded-xl p-3 pr-12"
            placeholder="minimum 6 caractères" />
          <button type="button"
            onClick={() => setVoirMdp(v => !v)}
            aria-label={voirMdp ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-gray-600">
            {voirMdp ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
      </div>

      <div>
        <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>
          Confirmer le mot de passe *
        </label>
        <div className="relative">
          <input type={voirMdp ? "text" : "password"} required value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className="w-full border rounded-xl p-3 pr-12"
            placeholder="répétez le mot de passe" />
          <button type="button"
            onClick={() => setVoirMdp(v => !v)}
            aria-label={voirMdp ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-gray-600">
            {voirMdp ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
      </div>

      <button type="submit" disabled={loading}
        className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: "#4AAEA0" }}>
        {loading ? "Création du compte..." : "Créer mon compte"}
      </button>
    </form>
  );
}