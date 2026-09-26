"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/src/lib/supabase-browser";
import { Eye, EyeOff } from "lucide-react";
import { creerOuLierFicheClient, signalerInscriptionSiCompteExiste } from "./actions";
import {
  MESSAGE_INSCRIPTION_NEUTRE,
  TITRE_INSCRIPTION_NEUTRE,
} from "@/src/lib/inscriptionNeutre";
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
  /* Plus de `useRouter` : on ne redirige plus vers /mon-compte (C-05).
     Rediriger distinguait l'adresse inconnue des deux autres aussi sûrement
     qu'une phrase — d'un coup d'œil à la barre d'adresse. */

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

    /*
     * ── C-05 : LES TROIS CAS FINISSENT ICI, ET DISENT LA MÊME CHOSE ────────
     *
     * Adresse inconnue, adresse sur une fiche cliente sans compte, adresse déjà
     * rattachée à un compte : le même écran, le même message, le même code.
     *
     * Ce qui a été RETIRÉ, et il faut le dire pour qu'on ne le remette pas :
     *
     *   * « Erreur : User already registered » — c'était la réponse la plus
     *     bavarde. Il suffisait d'essayer une adresse pour savoir si la personne
     *     était cliente ici. Sur une pension canine, cela dit où quelqu'un fait
     *     garder son chien, donc souvent quand il part en vacances.
     *   * « Un compte existe déjà pour cette adresse » — la même fuite, par le
     *     refus de la fiche.
     *   * la redirection vers /mon-compte quand une session est posée. Elle
     *     distinguait le cas (a) des autres AUSSI SÛREMENT qu'une phrase : une
     *     adresse inconnue amenait sur l'espace client, une adresse connue
     *     restait sur la page.
     *
     * L'information n'est pas perdue : dans le troisième cas, un e-mail part à
     * cette adresse. Elle ne va donc qu'à la personne qui relève cette boîte.
     */
    const aucuneSession = !data.session;

    if (!signUpError && data.user) {
      // Fiche client + profil : côté serveur uniquement (la RLS interdit ces
      // écritures au navigateur — c'est ce qui laissait des comptes sans fiche).
      //
      // Son refus n'est PLUS affiché : il disait « un compte existe déjà ».
      await creerOuLierFicheClient({
        userId: data.user.id ?? null,
        email,
        prenom,
        nom,
        telephone,
        photos_ok: photosOk,
      });
    }

    /*
     * L'e-mail « vous avez déjà un compte », si c'est le cas. L'action ne rend
     * RIEN — pas même un booléen : ce qu'elle a trouvé ne doit pas redescendre
     * jusqu'ici, où le navigateur pourrait le lire.
     */
    await signalerInscriptionSiCompteExiste(email);

    /*
     * Et l'écran unique. Y compris quand une session VIENT d'être posée : on ne
     * redirige plus, parce que rediriger serait une réponse différente.
     *
     * La personne qui vient de créer son compte clique sur le lien de son e-mail,
     * ou se connecte — un geste de plus pour elle, la confidentialité de toutes
     * les autres en échange.
     */
    void aucuneSession;
    setVerifierEmail(true);
    setLoading(false);
  };

  if (verifierEmail) {
    /*
     * L'écran des TROIS cas. Pas un mot ne doit varier selon ce que la base
     * contient — ni l'adresse en gras, qui ne dirait rien de plus que ce que la
     * personne vient de taper, mais que nous préférons ne pas réafficher : un
     * écran identique au pixel est plus facile à garder qu'un écran presque
     * identique.
     */
    return (
      <div
        role="status"
        className="bg-green-50 border border-green-200 text-green-800 px-4 py-4 rounded-xl text-sm space-y-2"
      >
        <p className="font-semibold">{TITRE_INSCRIPTION_NEUTRE}</p>
        <p>{MESSAGE_INSCRIPTION_NEUTRE}</p>
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
          <label htmlFor="prenom" className={labelClass} style={{ color: "#1B2B5E" }}>
            Prénom *
          </label>
          <input type="text" required id="prenom" value={prenom}
            onChange={e => setPrenom(e.target.value)}
            className="w-full border rounded-xl p-3"
            placeholder="Camille" />
        </div>
        <div>
          <label htmlFor="nom" className={labelClass} style={{ color: "#1B2B5E" }}>
            Nom *
          </label>
          <input type="text" required id="nom" value={nom}
            onChange={e => setNom(e.target.value)}
            className="w-full border rounded-xl p-3"
            placeholder="Rochat" />
        </div>
      </div>

      <div>
        <label htmlFor="telephone" className={labelClass} style={{ color: "#1B2B5E" }}>
          Téléphone
        </label>
        <input type="tel" id="telephone" value={telephone}
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
        <label htmlFor="email" className={labelClass} style={{ color: "#1B2B5E" }}>
          Email *
        </label>
        <input type="email" required id="email" value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border rounded-xl p-3"
          placeholder="votre@email.com" />
      </div>

      <div>
        <label htmlFor="password" className={labelClass} style={{ color: "#1B2B5E" }}>
          Mot de passe *
        </label>
        <div className="relative">
          <input type={voirMdp ? "text" : "password"} required id="password" value={password}
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
        <label htmlFor="confirm" className={labelClass} style={{ color: "#1B2B5E" }}>
          Confirmer le mot de passe *
        </label>
        <div className="relative">
          <input type={voirMdp ? "text" : "password"} required id="confirm" value={confirm}
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
