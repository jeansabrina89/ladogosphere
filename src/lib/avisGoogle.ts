/**
 * Le lien pour donner un avis Google, au pied de chaque e-mail.
 *
 * Une ligne de pied de page, rien de plus : pas d'encadré, pas de bouton. C'est
 * une porte laissée ouverte, pas une demande. Tant que le réglage est vide,
 * aucun e-mail ne change d'un caractère.
 *
 * Module pur : la saisie, le modèle d'e-mail et les tests le lisent.
 */

export const CLE_AVIS_GOOGLE = "avis_google_url";

export const LIBELLE_AVIS_GOOGLE = "★ Donner votre avis sur Google";

export const MESSAGE_LIEN_AVIS_INVALIDE =
  "Indiquez un lien complet qui commence par https:// — par exemple celui que Google " +
  "propose dans « Demander des avis ».";

export type ValidationLienAvis =
  | { ok: true; valeur: string }
  | { ok: false; message: string };

/**
 * Vide : on efface le lien, c'est permis. Sinon, une adresse https complète et
 * rien d'autre — un lien en http ou sans domaine partirait dans chaque e-mail.
 */
export function validerLienAvisGoogle(brut: unknown): ValidationLienAvis {
  const texte = String(brut ?? "").trim();
  if (texte === "") return { ok: true, valeur: "" };
  if (texte.length > 2000 || /\s/.test(texte)) return { ok: false, message: MESSAGE_LIEN_AVIS_INVALIDE };

  let url: URL;
  try {
    url = new URL(texte);
  } catch {
    return { ok: false, message: MESSAGE_LIEN_AVIS_INVALIDE };
  }
  if (url.protocol !== "https:" || !url.hostname.includes(".")) {
    return { ok: false, message: MESSAGE_LIEN_AVIS_INVALIDE };
  }
  return { ok: true, valeur: url.toString() };
}

/** Un attribut HTML ne laisse jamais passer un guillemet ni un chevron. */
function echapperAttribut(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * La ligne à placer sous « 🌐 ladogosphere.ch », ou une chaîne VIDE.
 *
 * Même style que les liens de la signature. La valeur est revalidée ici : une
 * ligne saisie à la main en base, sans passer par l'écran, ne doit pas pouvoir
 * glisser un lien douteux dans tous les e-mails.
 */
export function ligneAvisGooglePiedDePage(url: string | null | undefined): string {
  const validation = validerLienAvisGoogle(url);
  if (!validation.ok || validation.valeur === "") return "";
  return (
    `<p style="margin:4px 0 0 0; font-size:13px;">` +
    `<a href="${echapperAttribut(validation.valeur)}" style="color:#4AAEA0; text-decoration:none;">` +
    `${LIBELLE_AVIS_GOOGLE}</a></p>`
  );
}
