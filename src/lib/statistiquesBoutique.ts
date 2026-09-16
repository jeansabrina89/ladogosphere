import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { estAdresseDeTest, estArticleDeRecette, estFicheDeRecette } from "@/src/lib/ficheDeRecette";
import { lireAuteurs } from "@/src/lib/auteursDb";
import { initialesDe, nomCompletDe } from "@/src/lib/auteur";
import {
  calculerStatistiques,
  type ArticleCatalogue,
  type Filtres,
  type LigneStat,
  type Statistiques,
} from "@/src/lib/statistiquesBoutiqueLogique";

/**
 * Statistiques de la boutique — la lecture. Le calcul est dans
 * statistiquesBoutiqueLogique, testé sans base.
 */

const jourZurich = (instant: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date(instant));

const decaler = (jour: string, jours: number) => {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
};

type VenteLue = {
  id: string; date_vente: string; canal: string; client_id: string | null; statut: string;
  vendu_par: string | null; vente_origine_id: string | null;
};

/** Les lignes de vente d'une période, prêtes pour le calcul. */
export async function lireLignesStatistiques(du: string, au: string): Promise<LigneStat[]> {
  // Une marge d'un jour de chaque côté : la période est en dates de Zurich, la
  // base en instants. Le tri fin se fait sur le jour de Zurich.
  const { data: ventesBrutes, error } = await supabaseAdmin
    .from("ventes")
    .select("id, date_vente, canal, client_id, statut, vendu_par, vente_origine_id")
    .gte("date_vente", `${decaler(du, -1)}T00:00:00Z`)
    .lt("date_vente", `${decaler(au, 2)}T00:00:00Z`);
  if (error) throw new Error(`Ventes illisibles : ${error.message}`);

  const ventes = ((ventesBrutes ?? []) as VenteLue[]).filter((v) => {
    const j = jourZurich(v.date_vente);
    return j >= du && j <= au;
  });
  if (ventes.length === 0) return [];

  // Les ventes d'origine des retours, qui peuvent précéder la période.
  const idsOrigine = [...new Set(ventes.map((v) => v.vente_origine_id).filter((x): x is string => !!x))];
  const { data: origines } = idsOrigine.length
    ? await supabaseAdmin.from("ventes").select("id, statut, client_id").in("id", idsOrigine)
    : { data: [] };
  const origineParId = new Map(((origines ?? []) as { id: string; statut: string; client_id: string | null }[])
    .map((o) => [o.id, o]));

  const { data: lignes, error: errLignes } = await supabaseAdmin
    .from("ventes_lignes")
    .select("vente_id, article_id, libelle, quantite, montant, taux_tva, cout_unitaire_fige, remise_origine")
    .in("vente_id", ventes.map((v) => v.id));
  if (errLignes) throw new Error(`Lignes de vente illisibles : ${errLignes.message}`);

  const idsArticles = [...new Set(((lignes ?? []) as { article_id: string | null }[])
    .map((l) => l.article_id).filter((x): x is string => !!x))];
  const idsClients = [...new Set([
    ...ventes.map((v) => v.client_id),
    ...[...origineParId.values()].map((o) => o.client_id),
  ].filter((x): x is string => !!x))];

  const [{ data: articles }, { data: clients }] = await Promise.all([
    idsArticles.length
      ? supabaseAdmin.from("articles").select("id, nom, categorie").in("id", idsArticles)
      : Promise.resolve({ data: [] }),
    idsClients.length
      ? supabaseAdmin.from("clients").select("id, nom, prenom, email").in("id", idsClients)
      : Promise.resolve({ data: [] }),
  ]);
  const articleParId = new Map(((articles ?? []) as { id: string; nom: string; categorie: string | null }[])
    .map((a) => [a.id, a]));
  const clientRecette = new Map(((clients ?? []) as { id: string; nom: string | null; prenom: string | null; email: string | null }[])
    .map((c) => [c.id, estFicheDeRecette(c)]));
  const venteParId = new Map(ventes.map((v) => [v.id, v]));

  return ((lignes ?? []) as {
    vente_id: string; article_id: string | null; libelle: string; quantite: number | string;
    montant: number | string; taux_tva: number | string; cout_unitaire_fige: number | string | null;
    remise_origine: string | null;
  }[]).map((l) => {
    const v = venteParId.get(l.vente_id)!;
    const origine = v.vente_origine_id ? origineParId.get(v.vente_origine_id) : undefined;
    const article = l.article_id ? articleParId.get(l.article_id) : undefined;
    const clientId = v.client_id ?? origine?.client_id ?? null;
    return {
      vente_id: v.id,
      vente_origine_id: v.vente_origine_id,
      jour: jourZurich(v.date_vente),
      canal: v.canal,
      vendu_par: v.vendu_par,
      statut_vente: v.statut,
      statut_origine: origine?.statut ?? null,
      client_recette: clientId ? clientRecette.get(clientId) === true : false,
      article_id: l.article_id,
      article_nom: article?.nom ?? null,
      article_categorie: article?.categorie ?? null,
      article_recette: article ? estArticleDeRecette(article) : false,
      quantite: Number(l.quantite),
      montant: Number(l.montant),
      taux_tva: Number(l.taux_tva),
      cout_unitaire_fige: l.cout_unitaire_fige === null ? null : Number(l.cout_unitaire_fige),
      remise_origine: l.remise_origine,
      libelle: l.libelle,
    };
  });
}

/** Les articles qui se vendent en boutique : on les montre aussi à zéro vente. */
export async function lireCatalogueStatistiques(): Promise<ArticleCatalogue[]> {
  const { data } = await supabaseAdmin
    .from("articles")
    .select("id, nom, categorie")
    .eq("actif", true)
    .eq("composant", false);
  return ((data ?? []) as ArticleCatalogue[]).filter((a) => !estArticleDeRecette(a));
}

export async function statistiquesBoutique(filtres: Filtres, avecCatalogue = true): Promise<Statistiques> {
  const [lignes, catalogue] = await Promise.all([
    lireLignesStatistiques(filtres.du, filtres.au),
    avecCatalogue ? lireCatalogueStatistiques() : Promise.resolve([]),
  ]);
  return calculerStatistiques(lignes, filtres, catalogue);
}

/** Les personnes qui ont vendu sur les douze derniers mois, pour le filtre. */
export async function vendeusesBoutique(): Promise<{ id: string; initiales: string; nom: string }[]> {
  const depuis = new Date();
  depuis.setUTCFullYear(depuis.getUTCFullYear() - 1);
  const { data } = await supabaseAdmin
    .from("ventes")
    .select("vendu_par")
    .gte("date_vente", depuis.toISOString())
    .not("vendu_par", "is", null);
  const ids = [...new Set(((data ?? []) as { vendu_par: string }[]).map((v) => v.vendu_par))];
  const auteurs = await lireAuteurs(ids);
  return ids
    // Les comptes de recette ne sont pas des vendeuses.
    .filter((id) => !estAdresseDeTest(auteurs.get(id)?.email))
    .map((id) => ({ id, initiales: initialesDe(auteurs.get(id)), nom: nomCompletDe(auteurs.get(id)) }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}
