"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "../../src/lib/supabase-browser";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modeMdpOublie, setModeMdpOublie] = useState(false);
  const [emailReset, setEmailReset] = useState("");
  const [resetEnvoye, setResetEnvoye] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);
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

    // Session persistante si "Se souvenir de moi"
    if (remember) {
      await supabase.auth.updateUser({});
    }

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

  const handleResetMdp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingReset(true);
    setError("");

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(emailReset, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError("Erreur lors de l'envoi de l'email. Vérifiez l'adresse.");
    } else {
      setResetEnvoye(true);
    }
    setLoadingReset(false);
  };

  // Mode mot de passe oublié
  if (modeMdpOublie) {
    return (
      <div className="space-y-4">
        {resetEnvoye ? (
          <div className="bg-green-100 text-green-700 px-4 py-4 rounded-xl text-sm text-center">
            <p className="font-bold mb-1">✅ Email envoyé !</p>
            <p>Vérifiez votre boîte mail et cliquez sur le lien pour réinitialiser votre mot de passe.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500">
              Entrez votre adresse email — vous recevrez un lien pour réinitialiser votre mot de passe.
            </p>

            {error && (
              <div className="bg-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
            )}

            <form onSubmit={handleResetMdp} className="space-y-4">
              <div>
                <label className="block font-semibold mb-1" style={{ color: "#1B2B5E" }}>Email</label>
                <input type="email" required
                  value={emailReset}
                  onChange={e => setEmailReset(e.target.value)}
                  className="w-full border rounded-xl p-3"
                  placeholder="votre@email.com" />
              </div>
              <button type="submit" disabled={loadingReset}
                className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#4AAEA0" }}>
                {loadingReset ? "Envoi..." : "📧 Envoyer le lien"}
              </button>
            </form>
          </>
        )}

        <button onClick={() => { setModeMdpOublie(false); setError(""); setResetEnvoye(false); }}
          className="w-full text-sm text-center mt-2"
          style={{ color: "#4AAEA0" }}>
          ← Retour à la connexion
        </button>
      </div>
    );
  }

  // Mode connexion normal
  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {error && (
        <div className="bg-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
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

      {/* Se souvenir de moi */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
          <input type="checkbox" checked={remember}
            onChange={e => setRemember(e.target.checked)}
            className="rounded" />
          Se souvenir de moi
        </label>
        <button type="button"
          onClick={() => setModeMdpOublie(true)}
          className="text-sm font-semibold"
          style={{ color: "#4AAEA0" }}>
          Mot de passe oublié ?
        </button>
      </div>

      <button type="submit" disabled={loading}
        className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: "#4AAEA0" }}>
        {loading ? "Connexion..." : "Se connecter"}
      </button>

    </form>
  );
}