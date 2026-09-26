import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * S-05 — une photo de chien ne se lit plus qu'avec une URL signée.
 *
 * Le bucket `chiens-photos` était PUBLIC : le chemin d'une photo suffisait à
 * l'ouvrir sans compte, et ces chemins circulaient en clair dans le HTML de
 * quatre écrans. Une photo de chien est une donnée personnelle rattachée à un
 * propriétaire identifiable.
 *
 * Ce que ces tests gardent, et qui ne se voit pas à l'œil :
 *   - la fonction part d'un IDENTIFIANT, jamais d'un chemin ;
 *   - le droit vient de la SESSION, jamais d'un paramètre ;
 *   - un client n'obtient rien pour le chien d'un autre ;
 *   - une seule fonction du dépôt signe sur ce bucket.
 */

const H = vi.hoisted(() => ({
  /** L'appelant, tel que `lireAppelant` le rendra. */
  appelant: null as { userId: string; role: string; actif: boolean } | null,
  /** Les chiens en base. */
  chiens: new Map<string, { id: string; client_id: string; photo_principale: string | null }>(),
  /** Les fiches clientes, par auth_user_id. */
  fiches: new Map<string, { id: string }>(),
  /** Les chemins pour lesquels une signature a été demandée. */
  signatures: [] as { chemin: string; secondes: number }[],
}));

vi.mock("@sentry/nextjs", () => ({ captureException: () => {}, captureMessage: () => {} }));
vi.mock("@/src/lib/garde", () => ({ lireAppelant: async () => H.appelant }));

vi.mock("@/src/lib/supabase-admin", () => {
  const table = (nom: string) => {
    const filtres: Record<string, string> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (c: string, v: string) => { filtres[c] = v; return chain; },
      maybeSingle: async () => {
        if (nom === "chiens") return { data: H.chiens.get(filtres.id) ?? null, error: null };
        if (nom === "clients") return { data: H.fiches.get(filtres.auth_user_id) ?? null, error: null };
        return { data: null, error: null };
      },
    };
    return chain;
  };
  return {
    supabaseAdmin: {
      from: table,
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: async (chemin: string, secondes: number) => {
            H.signatures.push({ chemin, secondes });
            return { data: { signedUrl: `https://exemple.test/signe/${bucket}/${chemin}?token=abc` }, error: null };
          },
        }),
      },
    },
  };
});

import { urlSigneePhotoChien, urlsSigneesPhotosChiens, DUREE_URL_PHOTO } from "@/src/lib/photoChien";

const CHIEN_A = "11111111-1111-1111-1111-111111111111";
const CHIEN_B = "22222222-2222-2222-2222-222222222222";
const CHEMIN_A = `${CHIEN_A}/1700000000000.webp`;

beforeEach(() => {
  H.appelant = null;
  H.signatures.length = 0;
  H.fiches.clear();
  H.fiches.set("u-client-a", { id: "fiche-a" });
  H.fiches.set("u-client-b", { id: "fiche-b" });
  H.chiens.clear();
  H.chiens.set(CHIEN_A, { id: CHIEN_A, client_id: "fiche-a", photo_principale: CHEMIN_A });
  H.chiens.set(CHIEN_B, { id: CHIEN_B, client_id: "fiche-b", photo_principale: `${CHIEN_B}/x.webp` });
});

describe("qui obtient l'URL signée d'une photo de chien", () => {
  it("le client propriétaire obtient une URL pour SON chien", async () => {
    H.appelant = { userId: "u-client-a", role: "client", actif: true };

    const r = await urlSigneePhotoChien(CHIEN_A);

    expect(r.url, "le propriétaire n'obtient pas la photo de son propre chien").toBeTruthy();
    expect(H.signatures).toEqual([{ chemin: CHEMIN_A, secondes: DUREE_URL_PHOTO }]);
    expect(DUREE_URL_PHOTO, "la durée n'est plus d'une heure").toBe(3600);
  });

  it("un client n'obtient RIEN pour le chien d'un autre client", async () => {
    H.appelant = { userId: "u-client-a", role: "client", actif: true };

    const r = await urlSigneePhotoChien(CHIEN_B);

    expect(
      r.url,
      "un client a obtenu l'URL de la photo du chien de quelqu'un d'autre",
    ).toBeNull();
    expect("motif" in r && r.motif).toBe("refuse");
    expect(H.signatures, "une signature a été demandée malgré le refus").toEqual([]);
  });

  it("le personnel obtient l'URL de n'importe quel chien", async () => {
    // C'est ce que disent déjà la politique `personnel_select_chiens` et les
    // écrans : l'équipe voit tous les chiens de la pension.
    H.appelant = { userId: "u-employe", role: "employe", actif: true };
    const r = await urlSigneePhotoChien(CHIEN_B);
    expect(r.url).toBeTruthy();
  });

  it("un compte du personnel DÉSACTIVÉ n'obtient rien", async () => {
    H.appelant = { userId: "u-employe", role: "employe", actif: false };

    const r = await urlSigneePhotoChien(CHIEN_A);

    expect(r.url).toBeNull();
    expect("motif" in r && r.motif).toBe("non_connecte");
    expect(H.signatures).toEqual([]);
  });

  it("un visiteur non connecté n'obtient rien", async () => {
    H.appelant = null;

    const r = await urlSigneePhotoChien(CHIEN_A);

    expect(r.url).toBeNull();
    expect("motif" in r && r.motif).toBe("non_connecte");
    expect(H.signatures).toEqual([]);
  });

  it("un chien sans photo donne null, sans faire d'histoire", async () => {
    H.appelant = { userId: "u-employe", role: "employe", actif: true };
    H.chiens.set(CHIEN_A, { id: CHIEN_A, client_id: "fiche-a", photo_principale: null });

    const r = await urlSigneePhotoChien(CHIEN_A);

    expect(r.url).toBeNull();
    expect("motif" in r && r.motif).toBe("sans_photo");
  });
});

describe("la fonction refuse un CHEMIN à la place d'un identifiant", () => {
  /**
   * Le cœur de la mesure. Un chemin accepté ici désignerait n'importe quel
   * objet du bucket — celui du chien d'un autre client compris — et la garde
   * serait enjambée sans jamais être touchée : elle vérifie le droit sur un
   * chien, pas sur un objet.
   */
  const CHEMINS = [
    `${CHIEN_B}/x.webp`,
    "chiens-photos/quelquechose.webp",
    "https://lljxyrbocdqerricggfc.supabase.co/storage/v1/object/public/chiens-photos/x/y.png",
    "../autre/chemin.webp",
    "photo.webp",
  ];

  it.each(CHEMINS)("refuse « %s »", async (valeur) => {
    // Même avec les droits les plus larges : c'est la FORME qui est refusée.
    H.appelant = { userId: "u-admin", role: "admin", actif: true };

    const r = await urlSigneePhotoChien(valeur);

    expect(r.url, `un chemin a été accepté comme identifiant : ${valeur}`).toBeNull();
    expect("motif" in r && r.motif).toBe("identifiant_invalide");
    expect(H.signatures, "une signature a été demandée pour un chemin brut").toEqual([]);
  });

  it("et un identifiant vide", async () => {
    H.appelant = { userId: "u-admin", role: "admin", actif: true };
    const r = await urlSigneePhotoChien("");
    expect(r.url).toBeNull();
    expect(H.signatures).toEqual([]);
  });
});

describe("les listes : une URL par chien, chacune vérifiée", () => {
  it("un client ne récupère que les siens, même en demandant les deux", async () => {
    H.appelant = { userId: "u-client-a", role: "client", actif: true };

    const urls = await urlsSigneesPhotosChiens([CHIEN_A, CHIEN_B]);

    expect(urls.has(CHIEN_A)).toBe(true);
    expect(
      urls.has(CHIEN_B),
      "la version en lot a contourné la vérification que la version simple fait",
    ).toBe(false);
  });
});

describe("une seule porte dans tout le dépôt", () => {
  /**
   * Deux endroits qui signent, c'est un endroit de trop : le second finira par
   * oublier la vérification, ou par accepter un chemin. Ce test relit le dépôt.
   */
  const RACINE = join(__dirname, "..");
  const PORTE = join("src", "lib", "photoChien.ts");

  const sources = (dossier: string): string[] =>
    readdirSync(dossier).flatMap((nom) => {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) return sources(chemin);
      return /\.(ts|tsx)$/.test(nom) ? [chemin] : [];
    });

  it("seul photoChien.ts signe sur le bucket des chiens", () => {
    const fautifs: string[] = [];
    for (const chemin of [...sources(join(RACINE, "app")), ...sources(join(RACINE, "src"))]) {
      const rel = relative(RACINE, chemin);
      if (rel === PORTE) continue;
      const code = readFileSync(chemin, "utf8");
      // On ne regarde que les fichiers qui parlent du bucket des chiens.
      if (!/chiens-photos|BUCKET_CHIENS/.test(code)) continue;
      // Les commentaires ne signent rien : on retire `//…` et `/*…*/` d'abord.
      const nu = code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
      if (/createSignedUrl|getPublicUrl/.test(nu)) fautifs.push(rel);
    }
    expect(
      fautifs,
      "ces fichiers fabriquent une URL de photo de chien sans passer par urlSigneePhotoChien()",
    ).toEqual([]);
  });

  it("et plus aucun écran ne rend photo_principale directement", () => {
    // La colonne porte un CHEMIN depuis le lot 24 : la mettre dans un `src`
    // afficherait une image cassée, et trahirait un oubli de branchement.
    const fautifs: string[] = [];
    for (const chemin of sources(join(RACINE, "app"))) {
      const code = readFileSync(chemin, "utf8");
      if (/src=\{[^}]*photo_principale/.test(code)) fautifs.push(relative(RACINE, chemin));
    }
    expect(fautifs, "photo_principale est rendu tel quel : ce n'est plus une URL").toEqual([]);
  });
});

describe("le bucket reste privé dans le dépôt", () => {
  /**
   * Le contrôle en base a été fait à la main le 26.09.2026, et il ne peut pas
   * l'être ici : la suite n'a pas de connexion à Supabase. Mesuré alors, sur
   * l'unique objet du bucket :
   *
   *   l'URL publique exacte, déjà demandée avant  → 200, CF-Cache-Status: HIT
   *   la même URL avec ?nocache=<horodatage>      → 400
   *   un chemin inexistant du même bucket         → 400
   *   la même URL en HEAD                         → 400
   *
   * La permission est donc fermée ; ce qui répondait encore était le cache du
   * CDN, borné par le `cache-control: public, max-age=3600` que Storage avait
   * posé. C'est écrit dans docs/SECURITE.md.
   *
   * Ce que CE test garde, et qu'aucune mesure d'un jour ne garde : qu'aucune
   * migration future ne rouvre le bucket par distraction.
   */
  const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");
  /** La migration qui ferme : la règle vaut pour ce qui vient après. */
  const FERMETURE = "20260926120451_chiens_photos_bucket_prive.sql";

  const fichiers = () => readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

  it("la migration de fermeture est bien dans le dépôt", () => {
    expect(fichiers()).toContain(FERMETURE);
  });

  it("elle passe bien chiens-photos en privé, et ne touche pas boutique-photos", () => {
    const sql = readFileSync(join(MIGRATIONS, FERMETURE), "utf8");
    const nu = sql.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").toLowerCase();
    expect(nu).toMatch(/set\s+public\s*=\s*false\s+where\s+id\s*=\s*'chiens-photos'/);
    expect(
      nu,
      "la migration touche boutique-photos, qui doit rester public",
    ).not.toContain("boutique-photos");
  });

  it("aucune migration postérieure ne rouvre le bucket", () => {
    const fautives: string[] = [];
    for (const f of fichiers().filter((f) => f > FERMETURE)) {
      const nu = readFileSync(join(MIGRATIONS, f), "utf8")
        .replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").toLowerCase();
      if (!nu.includes("chiens-photos")) continue;
      // Rouvrir, c'est repasser `public` à true, ou poser une politique de
      // lecture sur les objets de ce bucket.
      if (/public\s*=\s*true/.test(nu) || /create\s+policy/.test(nu)) fautives.push(f);
    }
    expect(
      fautives,
      "une migration rouvre le bucket des photos de chiens, que le lot 24 avait fermé",
    ).toEqual([]);
  });
});
