import { echapperHtml } from "@/src/lib/avisGoogle";

/**
 * Les TEXTES des e-mails, au-delà des quatre champs d'origine (APP 60).
 *
 * ── CE QUI DEVIENT MODIFIABLE, ET CE QUI NE LE DEVIENT PAS ────────────────
 *
 * Modifiable : une phrase qu'un humain pourrait vouloir reformuler — un
 * paragraphe, un titre d'encadré, une ligne de liste, une phrase d'aide.
 *
 * Pas modifiable, et jamais : les montants, les dates, les numéros, l'IBAN, le
 * QR, les récapitulatifs calculés, les horaires (APP 59), la signature
 * (APP 58) et les liens légaux. Ce sont des DONNÉES. Les rendre modifiables
 * n'aurait pas permis de mieux dire les choses : cela aurait permis de les dire
 * fausses.
 *
 * ── LES VALEURS PAR DÉFAUT VIVENT DANS LE CODE ────────────────────────────
 *
 * En base, `blocs` ne contient que ce que Sabrina a RÉELLEMENT changé. Une clé
 * absente, vide, ou inconnue se replie sur le défaut. Trois conséquences qui
 * comptent :
 *
 *  · le jour du déploiement, la base est vide et chaque e-mail est identique au
 *    caractère près à celui d'hier (un test compare les vingt-et-un) ;
 *  · « Revenir au texte d'origine » n'écrit rien : il EFFACE la clé ;
 *  · une clé qui disparaît du code ne casse rien — elle est ignorée.
 *
 * ── L'ÉCHAPPEMENT ────────────────────────────────────────────────────────
 *
 * Tout est échappé, puis une seule balise est rendue : `<strong>`, avec ou sans
 * une couleur. C'est la SEULE balise que les quatre champs d'origine emploient
 * (vérifié dans `DEFAUTS_MODELES` : `<strong>`, `<strong
 * style="color:#4AAEA0;">`, `<strong style="color:#E8847A;">`). Tout le reste
 * — `<script>`, `<a href>`, un guillemet dans un attribut — sort en texte
 * visible plutôt qu'en balise.
 *
 * L'échappement est celui d'APP 58, exporté et partagé : un second, même
 * identique le jour où on l'écrit, se corrige un jour d'un seul côté.
 */

/** Un bloc est une phrase, ou une liste de lignes (l'encadré des avantages). */
export type ValeurBloc = string | string[];
export type BlocsModele = Record<string, ValeurBloc>;

/** Les variables d'un e-mail, comme pour les quatre champs d'origine. */
export type VariablesEmail = Record<string, string | number | undefined | null>;

/** `{prenom}` → la valeur, ou "" si elle manque. Le même que pour les 4 champs. */
export function interpolerBloc(texte: string, vars: VariablesEmail): string {
  return texte.replace(/\{(\w+)\}/g, (_m, cle) => {
    const v = vars[cle];
    return v === undefined || v === null ? "" : String(v);
  });
}

/**
 * Rend les `<strong>` que l'échappement vient de neutraliser, et eux seuls.
 *
 * La couleur est bornée à un code hexadécimal de six chiffres : sans cette
 * borne, `style="color:…"` accepterait n'importe quoi, expression comprise.
 */
function rendreGras(echappe: string): string {
  return echappe
    .replace(/&lt;strong&gt;/g, "<strong>")
    .replace(/&lt;\/strong&gt;/g, "</strong>")
    .replace(
      /&lt;strong style=&quot;color:#([0-9A-Fa-f]{6});&quot;&gt;/g,
      (_m, couleur) => `<strong style="color:#${couleur};">`,
    );
}

/** Un texte de bloc, prêt à entrer dans le HTML. */
export function texteBloc(brut: string, vars: VariablesEmail): string {
  return rendreGras(echapperHtml(interpolerBloc(brut, vars)));
}

/**
 * La valeur d'un bloc : celle de la base si elle dit quelque chose, sinon le
 * défaut.
 *
 * « Dit quelque chose » exclut la chaîne vide et la liste vide : effacer un
 * champ à l'écran doit rendre le texte d'origine, pas un blanc. Le seul moyen
 * de faire disparaître une phrase est de changer le code — et c'est voulu : un
 * e-mail amputé d'un paragraphe entier ne se remarque pas.
 */
export function valeurBloc(
  base: BlocsModele | null | undefined,
  defauts: BlocsModele,
  cle: string,
): ValeurBloc {
  /**
   * Une clé que le CODE ne connaît pas est ignorée, même si la base la porte.
   * La base ne décide pas de ce qu'un e-mail contient : elle reformule ce que
   * le code a prévu. Sans cette borne, une clé restée en base après un
   * changement de code aurait continué de vivre, invisible à l'écran (qui
   * n'affiche que les blocs déclarés) et impossible à retirer.
   */
  if (!(cle in defauts)) return "";

  const perso = base?.[cle];
  if (Array.isArray(perso)) {
    const lignes = perso.map((l) => String(l ?? "").trim()).filter((l) => l !== "");
    if (lignes.length > 0) return lignes;
  } else if (typeof perso === "string" && perso.trim() !== "") {
    return perso;
  }
  return defauts[cle] ?? "";
}

/**
 * L'accès que les modèles d'e-mail utilisent : `b("disponibilite")` rend le
 * texte prêt à poser, `l("avantages")` rend les lignes d'une liste.
 */
export type AccesBlocs = {
  b: (cle: string) => string;
  l: (cle: string) => string[];
};

export function accesBlocs(
  base: BlocsModele | null | undefined,
  defauts: BlocsModele,
  vars: VariablesEmail,
): AccesBlocs {
  return {
    b: (cle) => {
      const v = valeurBloc(base, defauts, cle);
      return texteBloc(Array.isArray(v) ? v.join(" ") : v, vars);
    },
    l: (cle) => {
      const v = valeurBloc(base, defauts, cle);
      return (Array.isArray(v) ? v : [v]).map((ligne) => texteBloc(ligne, vars));
    },
  };
}

/**
 * Les libellés de l'écran, en français clair — jamais la clé technique.
 *
 * Une clé sans libellé ne s'affiche pas : le champ n'apparaîtrait qu'avec son
 * nom de code, et personne ne saurait ce qu'il change. Un test vérifie que
 * chaque bloc d'un modèle a le sien.
 */
export type LibellesBlocs = Record<string, Record<string, string>>;
