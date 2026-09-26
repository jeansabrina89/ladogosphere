/**
 * Ce que l'inscription répond — la même chose, toujours (C-05, APP 28).
 *
 * ── LE DÉFAUT QU'ON FERME ─────────────────────────────────────────────────
 *
 * L'écran d'inscription répondait trois choses différentes :
 *
 *   * adresse inconnue → « Votre compte est créé. Cliquez sur le lien de
 *     confirmation… » ;
 *   * adresse sur une fiche cliente sans compte → le même message, la fiche
 *     rattachée au passage ;
 *   * adresse déjà rattachée à un compte → « Un compte existe déjà pour cette
 *     adresse, utilisez « Mot de passe oublié ». »
 *
 * Le troisième message est une réponse à une question qu'on n'a pas le droit de
 * poser : « cette personne est-elle cliente ici ? ». Il suffisait d'essayer une
 * adresse pour le savoir. Sur une pension canine, cela dit où quelqu'un fait
 * garder son chien — donc, souvent, quand il part en vacances.
 *
 * ── CE QUI REMPLACE LES TROIS ─────────────────────────────────────────────
 *
 * Une seule phrase, pour les trois cas, avec le même écran et le même code de
 * retour. « Si cette adresse PEUT être utilisée » : le conditionnel n'est pas une
 * précaution de style, c'est ce qui rend la phrase vraie dans les trois cas sans
 * en distinguer aucun.
 *
 * L'information ne disparaît pas pour autant : dans le troisième cas, un e-mail
 * part à cette adresse. Elle ne va donc qu'à la personne qui relève cette boîte —
 * et si c'est un tiers qui a tenté l'inscription, le titulaire apprend qu'on a
 * essayé sous son nom, ce qui lui est utile.
 */

export const MESSAGE_INSCRIPTION_NEUTRE =
  "Si cette adresse peut être utilisée, vous allez recevoir un e-mail. " +
  "Pensez à vérifier vos indésirables.";

/** Le titre de l'écran. Neutre lui aussi : il ne dit pas qu'un compte est créé. */
export const TITRE_INSCRIPTION_NEUTRE = "📬 Vérifiez votre boîte mail";

/**
 * Les refus qui restent LÉGITIMES, et pourquoi ils ne trahissent rien.
 *
 * Un mot de passe trop court, un prénom manquant, deux mots de passe qui
 * diffèrent : ces refus portent sur ce que la personne vient de taper, pas sur
 * ce que la base contient. Ils sont identiques pour une adresse connue et pour
 * une inconnue — donc ils ne permettent aucune comparaison.
 *
 * Les confondre avec le reste aurait été une faute dans l'autre sens : une
 * inscription qui répond « vous allez recevoir un e-mail » alors que le mot de
 * passe fait trois caractères laisse la personne attendre un e-mail qui ne
 * viendra jamais.
 */
export const REFUS_DE_SAISIE = [
  "Le prénom et le nom sont obligatoires.",
  "Les mots de passe ne correspondent pas.",
  "Le mot de passe doit contenir au moins 6 caractères.",
] as const;
