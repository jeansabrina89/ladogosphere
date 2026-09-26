// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "./setup/attenteJsdom";
import {
  MESSAGE_INSCRIPTION_NEUTRE,
  REFUS_DE_SAISIE,
} from "@/src/lib/inscriptionNeutre";

/**
 * C-05 : l'inscription ne dit pas si une adresse est connue (APP 28).
 *
 * Trois cas, un seul écran :
 *
 *   (a) adresse inconnue ;
 *   (b) adresse portée par une fiche cliente SANS compte ;
 *   (c) adresse déjà rattachée à un compte.
 *
 * Avant ce lot, les trois se distinguaient — et le troisième le disait en toutes
 * lettres : « Un compte existe déjà pour cette adresse ». Il suffisait d'essayer
 * une adresse pour savoir si la personne était cliente ici. Sur une pension
 * canine, cela dit où quelqu'un fait garder son chien, donc souvent quand il part
 * en vacances.
 *
 * ── CE QUE CE FICHIER COMPARE ─────────────────────────────────────────────
 *
 * Le TEXTE RENDU, caractère pour caractère, dans les trois cas. Pas la présence
 * d'une phrase : le texte entier. Une différence d'un mot suffirait à
 * distinguer, et c'est exactement ce qu'on referme.
 */

const H = vi.hoisted(() => ({
  /** Ce que `signUp` répond : c'est là que les trois cas diffèrent vraiment. */
  signUp: async () =>
    ({ data: { user: { id: "u-1" }, session: null }, error: null }) as {
      data: { user: { id: string } | null; session: unknown | null };
      error: { message: string } | null;
    },
  /** Ce que l'action de fiche répond. */
  fiche: async () => ({ ok: true, client_id: "c-1" }) as { ok: boolean; error?: string },
  /** Les adresses pour lesquelles l'e-mail « déjà un compte » est parti. */
  emailsEnvoyes: [] as string[],
  /** Les redirections demandées : il n'en faut AUCUNE. */
  redirections: [] as string[],
}));

vi.mock("@/src/lib/supabase-browser", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signUp: H.signUp } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (u: string) => { H.redirections.push(u); },
    refresh: () => {},
  }),
}));
vi.mock("@/app/(public)/inscription/actions", () => ({
  creerOuLierFicheClient: async () => H.fiche(),
  signalerInscriptionSiCompteExiste: async (email: string) => { H.emailsEnvoyes.push(email); },
}));

const InscriptionForm = (await import("@/app/(public)/inscription/InscriptionForm")).default;

beforeEach(() => {
  H.emailsEnvoyes.length = 0;
  H.redirections.length = 0;
  H.signUp = async () => ({ data: { user: { id: "u-1" }, session: null }, error: null });
  H.fiche = async () => ({ ok: true, client_id: "c-1" });
});
afterEach(cleanup);

/** Remplit le formulaire et l'envoie. Rend le texte de l'écran obtenu. */
async function inscrire(email = "essai@example.ch"): Promise<string> {
  const { container } = render(<InscriptionForm />);
  fireEvent.change(screen.getByLabelText(/Prénom/i), { target: { value: "Marie" } });
  fireEvent.change(screen.getByLabelText(/^Nom/i), { target: { value: "Dupont" } });
  fireEvent.change(screen.getByLabelText(/^Email/i), { target: { value: email } });
  const mdp = container.querySelectorAll('input[type="password"]');
  for (const champ of Array.from(mdp)) {
    fireEvent.change(champ, { target: { value: "motdepasse" } });
  }
  fireEvent.click(screen.getByRole("button", { name: /inscrire|créer|valider/i }));
  await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
  return (screen.getByRole("status").textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("les trois cas rendent le MÊME écran", () => {
  it("(a) une adresse inconnue", async () => {
    // signUp réussit, pas de session (le projet confirme l'adresse), fiche créée.
    const texte = await inscrire("inconnue@example.ch");
    expect(texte).toContain(MESSAGE_INSCRIPTION_NEUTRE);
  });

  it("(b) une adresse sur une fiche cliente SANS compte", async () => {
    // Même chose côté Auth ; c'est l'action de fiche qui RATTACHE au lieu de
    // créer. Rien ne doit s'en voir à l'écran.
    H.fiche = async () => ({ ok: true, client_id: "fiche-existante" });
    const texte = await inscrire("cliente@example.ch");
    expect(texte).toContain(MESSAGE_INSCRIPTION_NEUTRE);
  });

  it("(c) une adresse DÉJÀ rattachée à un compte", async () => {
    /*
     * Le cas qui parlait. Selon le réglage Supabase, `signUp` rend une erreur
     * (« User already registered ») ou un faux succès ; et l'action de fiche
     * refusait avec « un compte existe déjà ». Aucun des deux ne doit paraître.
     */
    H.signUp = async () => ({
      data: { user: null, session: null },
      error: { message: "User already registered" },
    });
    H.fiche = async () => ({ ok: false, error: "Un compte existe déjà pour cette adresse, utilisez « Mot de passe oublié »." });

    const texte = await inscrire("deja@example.ch");
    expect(texte).toContain(MESSAGE_INSCRIPTION_NEUTRE);
    // Et surtout : aucun mot des anciens messages.
    expect(texte).not.toMatch(/déjà/i);
    expect(texte).not.toMatch(/already/i);
    expect(texte).not.toMatch(/existe/i);
    expect(texte).not.toMatch(/Mot de passe oublié/i);
  });

  it("les trois textes sont IDENTIQUES, caractère pour caractère", async () => {
    const a = await inscrire("inconnue@example.ch");
    cleanup();

    H.fiche = async () => ({ ok: true, client_id: "fiche-existante" });
    const b = await inscrire("cliente@example.ch");
    cleanup();

    H.signUp = async () => ({
      data: { user: null, session: null },
      error: { message: "User already registered" },
    });
    H.fiche = async () => ({ ok: false, error: "Un compte existe déjà pour cette adresse." });
    const c = await inscrire("deja@example.ch");

    expect(b, "(b) doit être identique à (a)").toBe(a);
    expect(c, "(c) doit être identique à (a)").toBe(a);
  });

  it("une session posée ne redirige PLUS : rediriger serait une réponse différente", async () => {
    /*
     * Le piège le plus discret. Quand « Confirm email » est désactivé, une
     * adresse inconnue recevait une session et partait sur /mon-compte ; une
     * adresse connue restait sur la page. L'écran ne disait rien, et pourtant les
     * deux cas se distinguaient d'un coup d'œil à la barre d'adresse.
     */
    H.signUp = async () => ({
      data: { user: { id: "u-1" }, session: { access_token: "t" } },
      error: null,
    });
    const texte = await inscrire("inconnue@example.ch");
    expect(texte).toContain(MESSAGE_INSCRIPTION_NEUTRE);
    expect(H.redirections, "aucune redirection").toEqual([]);
  });
});

describe("le cas (c) : aucun second compte, et un e-mail", () => {
  it("l'e-mail part pour l'adresse tapée, dans tous les cas", async () => {
    /*
     * L'action est appelée à chaque inscription — c'est ELLE qui décide, côté
     * serveur, s'il faut écrire. Le navigateur ne doit pas décider : pour
     * décider, il faudrait qu'il sache, et s'il sait, la fuite est revenue.
     */
    await inscrire("essai@example.ch");
    expect(H.emailsEnvoyes).toEqual(["essai@example.ch"]);
  });

  it("l'action ne rend RIEN : il n'y a pas d'information à redescendre", async () => {
    const source = readFileSync(
      join(__dirname, "..", "app/(public)/inscription/actions.ts"), "utf8");
    expect(source).toMatch(/signalerInscriptionSiCompteExiste\([^)]*\): Promise<void>/);
    // Elle ne crée aucun compte : elle regarde, et elle écrit un e-mail.
    expect(source).not.toMatch(/signalerInscriptionSiCompteExiste[\s\S]{0,2000}createUser/);
    expect(source).toContain("envoyerEmailCompteExisteDeja");
  });

  it("le modèle d'e-mail est éditable comme les autres, et sans variable", async () => {
    const email = readFileSync(join(__dirname, "..", "src/lib/email.ts"), "utf8");
    // Déclaré dans la liste de l'écran des modèles.
    expect(email).toMatch(/type: "compte_existe_deja", label: "[^"]+", variables: \[\]/);
    // Et pourvu d'un défaut, comme tous les autres.
    expect(email).toMatch(/compte_existe_deja: \{\s*\r?\n\s*sujet:/);
    expect(email).toContain("Vous avez déjà un compte chez La Dogosphère");
    expect(email).toContain("Mot de passe oublié");
  });
});

describe("ce qui reste refusé, et qui ne trahit rien", () => {
  it("les refus de SAISIE restent affichés", async () => {
    /*
     * Un mot de passe trop court porte sur ce que la personne vient de taper, pas
     * sur ce que la base contient : il est identique pour une adresse connue et
     * pour une inconnue, donc il ne permet aucune comparaison.
     *
     * Les taire aurait été une faute dans l'autre sens : « vous allez recevoir un
     * e-mail » alors que le mot de passe fait trois caractères ferait attendre un
     * e-mail qui ne viendra jamais.
     */
    const { container } = render(<InscriptionForm />);
    fireEvent.change(screen.getByLabelText(/Prénom/i), { target: { value: "Marie" } });
    fireEvent.change(screen.getByLabelText(/^Nom/i), { target: { value: "Dupont" } });
    fireEvent.change(screen.getByLabelText(/^Email/i), { target: { value: "x@example.ch" } });
    for (const champ of Array.from(container.querySelectorAll('input[type="password"]'))) {
      fireEvent.change(champ, { target: { value: "abc" } });
    }
    fireEvent.click(screen.getByRole("button", { name: /inscrire|créer|valider/i }));

    await waitFor(() =>
      expect(container.textContent).toContain("au moins 6 caractères"));
    // Et rien n'est parti : ni compte, ni e-mail.
    expect(H.emailsEnvoyes).toEqual([]);
  });

  it("les trois refus de saisie sont nommés en un seul endroit", () => {
    const form = readFileSync(
      join(__dirname, "..", "app/(public)/inscription/InscriptionForm.tsx"), "utf8");
    for (const refus of REFUS_DE_SAISIE) {
      expect(form, `« ${refus} » doit rester dans le formulaire`).toContain(refus);
    }
  });
});

describe("le message lui-même", () => {
  it("emploie le conditionnel, qui est ce qui le rend vrai dans les trois cas", () => {
    // « Si cette adresse PEUT être utilisée » : ni « votre compte est créé »
    // (faux dans le cas c), ni « cette adresse est libre » (une réponse).
    expect(MESSAGE_INSCRIPTION_NEUTRE).toContain("peut être utilisée");
    expect(MESSAGE_INSCRIPTION_NEUTRE).toContain("indésirables");
    expect(MESSAGE_INSCRIPTION_NEUTRE).not.toMatch(/votre compte est créé/i);
  });

  it("l'ancien message révélateur n'existe plus nulle part", () => {
    /**
     * La mutation en dur : si quelqu'un remet « Un compte existe déjà » dans un
     * écran, ce test rougit. Le message vit encore dans `inscriptionClient`
     * (MESSAGE_EMAIL_DEJA_UTILISE) parce que la page « compléter mon profil »
     * s'en sert pour un compte DÉJÀ CONNECTÉ — là, la personne a prouvé son
     * identité, et lui cacher la raison ne protégerait personne.
     */
    const form = readFileSync(
      join(__dirname, "..", "app/(public)/inscription/InscriptionForm.tsx"), "utf8");
    // On vise ce que setError AFFICHE, pas les commentaires : un test qui
    // cherche un mot n'importe où dans un fichier se fait satisfaire par un
    // commentaire, dans un sens comme dans l'autre (leçon du lot 23-bis).
    const appelsSetError = form.match(/setError([^)]*)/g) ?? [];
    for (const appel of appelsSetError) {
      expect(appel, "aucun refus ne doit nommer un compte existant")
        .not.toMatch(/existe|déjà|already/i);
    }
    expect(form, "l'erreur de signUp ne doit plus être affichée")
      .not.toMatch(/setError\("Erreur : " \+ signUpError\.message\)/);
  });
});
