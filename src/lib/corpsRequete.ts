import { NextResponse } from "next/server";

/**
 * Lecture du corps d'une requête d'API.
 *
 * Un corps illisible (JSON malformé, ou un JSON envoyé à une route qui attend
 * un formulaire) faisait remonter une exception : le client recevait 500,
 * c'est-à-dire « la pension est en panne », pour une requête mal formée.
 * C'est une erreur d'appel : 400, avec un message court.
 */

export const MESSAGE_JSON_INVALIDE = "Requête invalide : le corps JSON est illisible.";
export const MESSAGE_FORMULAIRE_INVALIDE =
  "Requête invalide : le corps du formulaire est illisible.";

/**
 * Le corps d’un JSON entrant n’est pas typé : c’est chaque route qui sait ce
 * qu’elle attend, exactement comme avec `await req.json()`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CorpsJson = Record<string, any>;

export type LectureCorps<T> =
  | { ok: true; corps: T }
  | { ok: false; reponse: NextResponse };

function refus(message: string): { ok: false; reponse: NextResponse } {
  return { ok: false, reponse: NextResponse.json({ error: message }, { status: 400 }) };
}

/** Corps JSON, ou une réponse 400 prête à renvoyer. */
export async function lireCorpsJson<T = CorpsJson>(
  req: Request
): Promise<LectureCorps<T>> {
  try {
    const corps = await req.json();
    // `null` est un JSON valide mais n'est pas un corps exploitable.
    if (corps === null || typeof corps !== "object") return refus(MESSAGE_JSON_INVALIDE);
    return { ok: true, corps: corps as T };
  } catch {
    return refus(MESSAGE_JSON_INVALIDE);
  }
}

/** Corps de formulaire, ou une réponse 400 prête à renvoyer. */
export async function lireCorpsFormulaire(req: Request): Promise<LectureCorps<FormData>> {
  try {
    return { ok: true, corps: await req.formData() };
  } catch {
    return refus(MESSAGE_FORMULAIRE_INVALIDE);
  }
}
