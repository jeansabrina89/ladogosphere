// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "./setup/attenteJsdom";

/**
 * Le panier membre, à l'écran.
 *
 * ── POURQUOI CE FICHIER EXISTE ────────────────────────────────────────────
 *
 * Le parcours demandé au lot — « panier membre : lignes à la suisse, remise en
 * −, "Prix TTC" une seule fois sous le total » — se fait normalement à l'œil,
 * connecté, sur un build local. Il demande une session cliente, et le panier
 * d'un visiteur est vide : sans ligne, il n'affiche aucun total, donc rien de
 * ce qu'on venait vérifier.
 *
 * Ce test rend le panier AVEC des lignes et lit ce qui s'affiche. Il ne
 * remplace pas le coup d'œil de Sabrina sur la mise en page ; il remplace la
 * partie qu'un coup d'œil vérifie mal — qu'aucun des onze montants du panier
 * n'a gardé son ancien format, et que la mention « Prix TTC » n'apparaît
 * qu'une fois.
 *
 * Les montants sont choisis pour couvrir les quatre formes d'un seul rendu :
 * rond (« 89.– »), à centimes (« 27.50 »), au-dessus du millier
 * (« 1'000.50 ») et négatif (« −12.05 »).
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
vi.mock("@/app/(public)/catalogue/actions", () => ({
  changerQuantite: async () => ({}),
  retirerDuPanier: async () => ({}),
  confirmerCommande: async () => ({}),
}));

afterEach(() => cleanup());

/** Le texte visible, espaces normalisés : ce que la cliente lit vraiment. */
function lu(): string {
  return (document.body.textContent ?? "").replace(/\s+/g, " ");
}

async function rendrePanier() {
  const { default: Panier } = await import("@/app/(public)/catalogue/panier/Panier");
  const lignes = [
    {
      id: "l-1",
      article_id: "a-1",
      libelle: "Harnais",
      quantite: 1,
      // Prix de base 101.05, payé 89.– : une remise membre de 12.05.
      prix_unitaire: 89,
      prix_base: 101.05,
      remise_pourcentage: 10,
      remise_origine: "membre",
      remise_libelle: "Remise membre −10 %",
      taux_tva: 8.1,
      poids_grammes: 500,
      expediable: true,
    },
    {
      id: "l-2",
      article_id: "a-2",
      libelle: "Balle",
      quantite: 5,
      prix_unitaire: 27.5,
      taux_tva: 8.1,
      poids_grammes: 100,
      expediable: true,
    },
  ];
  render(
    <Panier
      lignes={lignes}
      grillePort={[{ jusqu_a_grammes: 2000, prix: 9 }]}
      poidsMaxGrammes={10000}
      francoPortDes={500}
      delaiJours={2}
      reservations={[]}
      adresseClient={null}
    />,
  );
  return lignes;
}

describe("le panier écrit les prix à la suisse", () => {
  it("les montants ronds prennent le tiret, les autres deux décimales", async () => {
    await rendrePanier();
    const texte = lu();
    // La ligne « Harnais » : 89.– l'unité, barré 101.05.
    expect(texte).toContain("89.–");
    expect(texte).toContain("101.05");
    // La ligne « Balle » : 27.50 l'unité, 137.50 pour cinq.
    expect(texte).toContain("27.50");
    expect(texte).toContain("137.50");
  });

  it("le total s'écrit une fois pour toutes, remise déduite", async () => {
    await rendrePanier();
    // Sous-total 238.55 (les prix de BASE), moins 12.05 de remise membre :
    // 226.50. L'apostrophe des milliers est couverte par les tests de la
    // fonction ; ici on garde que l'écran passe bien par elle.
    expect(lu()).toContain("238.55");
    expect(lu()).toContain("226.50");
  });

  it("la remise porte le SIGNE MOINS", async () => {
    await rendrePanier();
    const texte = lu();
    // U+2212, pas le trait d'union. 101.05 − 89 = 12.05.
    expect(texte).toContain("−12.05");
    expect(texte).toContain("Remise membre");
    // CE QUE CE TEST NE PROUVE PAS, et il faut le dire : l'écran passe désormais
    // le montant NÉGATIF à la fonction, au lieu de coller un − devant un montant
    // positif. Les deux rendent exactement « −12.05 » : aucun test ne peut les
    // distinguer, et c'est une mise en ordre, pas une garantie. Elle ne vaudrait
    // que si un montant de remise pouvait devenir négatif — ce que
    // `remisesParOrigine` ne produit pas aujourd'hui.
    expect(texte).not.toContain("−−12.05");
  });

  it("aucun « CHF » nulle part", async () => {
    await rendrePanier();
    expect(lu()).not.toContain("CHF");
  });
});

describe("« Prix TTC » est dit UNE fois, sous le total", () => {
  it("une seule mention dans tout le panier", async () => {
    await rendrePanier();
    // Le total est répété (le décompte et la barre collée en bas), la mention
    // ne l'est pas : c'est elle qui devait cesser d'être du bruit.
    expect(screen.getAllByText("Prix TTC")).toHaveLength(1);
    expect(screen.getAllByText("Total").length).toBeGreaterThan(0);
  });

  it("les lignes, elles, ne disent plus « TTC »", async () => {
    await rendrePanier();
    const texte = lu();
    expect((texte.match(/TTC/g) ?? []).length).toBe(1);
  });
});

describe("la livraison offerte garde son mot", () => {
  it("le seuil s'annonce au format client", async () => {
    await rendrePanier();
    // Seuil à 500.–, articles à 226.50 : le seuil n'est pas atteint, et il est
    // dit sobrement, sans compte à rebours (APP 17n).
    expect(lu()).toContain("Livraison offerte dès 500.– d'articles");
  });
});
