"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/src/lib/supabase-browser";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { creerOuLierFicheClient } from "./actions";
import { LIBELLE_ACCORD_PHOTOS } from "@/src/lib/accordPhotos";

export default function InscriptionForm() {
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [photosOk, setPhotosOk] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [voirMdp, setVoirMdp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [verifierEmail, setVerifierEmail] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!prenom.trim() || !nom.trim()) {
      setError("Le prénom et le nom sont obligatoires.");
      return;
    }

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

    // Fiche client + profil : côté serveur uniquement (la RLS interdit ces
    // écritures au navigateur — c'est ce qui laissait des comptes sans fiche).
    const res = await creerOuLierFicheClient({
      userId: data.user?.id ?? null,
      email,
      prenom,
      nom,
      telephone,
      photos_ok: photosOk,
    });

    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }

    // Pas de session : le projet exige la confirmation de l'e-mail.
    if (!data.session) {
      setVerifierEmail(true);
      setLoading(false);
      return;
    }

    router.push("/mon-compte");
    router.refresh();
  };

  if (verifierEmail) {
    return (
      <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-4 rounded-xl text-sm space-y-2">
        <p className="font-semibold">📬 Vérifiez votre boîte mail</p>
        <p>
          Votre compte est créé. Cliquez sur le lien de confirmation que nous venons
          d&apos;envoyer à <strong>{email}</strong>, puis connectez-vous.
        </p>
      </div>
    );
  }

  const labelClass = "block font-semibold mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} style={{ color: "#1B2B5E" }}>
            Prénom *
          </label>
          <input type="text" required value={prenom}
            onChange={e => setPrenom(e.target.value)}
            className="w-full border rounded-xl p-3"
            placeholder="Camille" />
        </div>
        <div>
          <label className={labelClass} style={{ color: "#1B2B5E" }}>
            Nom *
          </label>
          <input type="text" required value={nom}
            onChange={e => setNom(e.target.value)}
            className="w-full border rounded-xl p-3"
            placeholder="Rochat" />
        </div>
      </div>

      <div>
        <label className={labelClass} style={{ color: "#1B2B5E" }}>
          Téléphone
        </label>
        <input type="tel" value={telephone}
          onChange={e => setTelephone(e.target.value)}
          className="w-full border rounded-xl p-3"
          placeholder="+41 79 123 45 67" />
      </div>

      <div className="rounded-xl p-4" style={{ backgroundColor: "#F5F0E8", border: "1px solid #C9A84C" }}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={photosOk}
            onChange={e => setPhotosOk(e.target.checked)}
            className="mt-0.5 h-5 w-5 flex-shrink-0 accent-[#4AAEA0]" />
          <span className="text-sm" style={{ color: "#1B2B5E" }}>
            {LIBELLE_ACCORD_PHOTOS}
          </span>
        </label>
      </div>

      <div>
        <label className={labelClass} style={{ color: "#1B2B5E" }}>
          Email *
        </label>
        <input type="email" required value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border rounded-xl p-3"
          placeholder="votre@email.com" />
      </div>

      <div>
        <label className={labelClass} style={{ color: "#1B2B5E" }}>
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
        <label className={labelClass} style={{ color: "#1B2B5E" }}>
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
