import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * La fiche de locataire a désormais des portes : depuis la fiche client, et
 * depuis « + Ajouter un locataire ». Elle doit donc s'ouvrir pour un client
 * qui n'est PAS encore locataire — case décochée, et rien du catalogue.
 */

const H = vi.hoisted(() => ({ notFound: 0 }));

vi.mock("@/src/lib/accesAdmin", () => ({
  exigerAccesAdmin: async () => ({ userId: "u1", email: null, role: "admin", isAdmin: true, permissions: {} }),
}));
vi.mock("@/src/lib/supabase-admin", () => ({ supabaseAdmin: {} }));
vi.mock("next/navigation", () => ({
  notFound: () => { H.notFound += 1; throw new Error("NEXT_NOT_FOUND"); },
  useRouter: () => ({ refresh: () => {}, replace: () => {}, push: () => {} }),
  usePathname: () => "/",
}));
vi.mock("@/app/(admin)/(espace-prestations)/prestations/actions", () => ({
  enregistrerLocataire: async () => ({}),
  ajouterPrestation: async () => ({}),
  attribuerFormule: async () => ({}),
  personnaliserSemaine: async () => ({}),
  chercherClientsPourLocation: async () => [],
}));
vi.mock("@/src/lib/prestationsDb", () => ({
  // Le client existe, il n'est pas locataire : ficheLocataire le refuse, comme en vrai.
  ficheLocataire: async () => null,
  clientPourLocation: async (id: string) => id === "client-1"
    ? { id: "client-1", prenom: "Léa", nom: "Rossier", locataire_box: false, box_loue: null,
        loyer_refacture: null, locataire_depuis: null, locataire_jusqu_au: null }
    : null,
  loyerPayeDuMois: async () => 0,
  tachesDuClient: async () => [],
}));

const { default: FicheLocatairePage } = await import("@/app/(admin)/(espace-prestations)/prestations/locataires/[id]/page");

describe("la fiche de locataire d'un client qui ne l'est pas encore", () => {
  it("s'ouvre sans erreur, sur la seule location, case décochée", async () => {
    const element = await FicheLocatairePage({ params: Promise.resolve({ id: "client-1" }) });
    const html = renderToStaticMarkup(element);
    expect(H.notFound).toBe(0);
    expect(html).toContain("Léa Rossier");
    expect(html).toContain("pas encore locataire de box");
    const caseLocataire = html.match(/<input[^>]*name="locataire_box"[^>]*>/)?.[0] ?? "";
    expect(caseLocataire).not.toBe("");
    expect(caseLocataire).not.toMatch(/checked/);
    // Rien du catalogue : ni formule, ni prestation.
    expect(html).not.toContain("Attribuer une formule");
    expect(html).not.toContain("Ajouter une prestation");
  });

  it("un client inexistant reste introuvable", async () => {
    await expect(FicheLocatairePage({ params: Promise.resolve({ id: "inconnu" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("les portes", () => {
  const lire = (chemin: string) => readFileSync(join(__dirname, "..", chemin), "utf8");

  it("la fiche client mène à la fiche de locataire, avec le box si le client l'est déjà", () => {
    const fiche = lire("app/(admin)/(espace-clients)/clients/[id]/page.tsx");
    expect(fiche).toMatch(/perms\.perm_prestations && \(\s*<Bouton variante="secondaire" href=\{`\/prestations\/locataires\/\$\{client\.id\}`\}>/);
    expect(fiche).toContain("🏠 Fiche de locataire");
    expect(fiche).toContain("Box {client.box_loue ?? \"—\"}");
    expect(fiche).toContain("\"🏠 Locataire de box\"");
  });

  it("la liste des locataires propose d'en ajouter un, par une recherche de client", () => {
    expect(lire("app/(admin)/(espace-prestations)/prestations/locataires/page.tsx")).toContain("<AjouterLocataire />");
    const ajout = lire("app/(admin)/(espace-prestations)/prestations/locataires/AjouterLocataire.tsx");
    expect(ajout).toContain("+ Ajouter un locataire");
    expect(ajout).toMatch(/href=\{`\/prestations\/locataires\/\$\{c\.id\}`\}/);
  });

  it("voir demande perm_prestations ; enregistrer garde la garde de facturation", () => {
    const actions = lire("app/(admin)/(espace-prestations)/prestations/actions.ts");
    expect(actions).toMatch(/export async function chercherClientsPourLocation[\s\S]*verifierPermission\("perm_prestations"\)/);
    expect(actions).toMatch(/export async function enregistrerLocataire\(formData: FormData\): Promise<Resultat> \{\s*const verif = await gardeFacturation\(\);/);
  });
});
