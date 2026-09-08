import * as Sentry from "@sentry/nextjs";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { urlPhotoArticle } from "@/src/lib/boutiqueLogique";
import { envoyerEmailRetourEnStock } from "@/src/lib/email";
import { tracerEvenement } from "@/src/lib/journalEvenements";
import {
  disponibleDe,
  estRetourEnStock,
  normaliserEmail,
  ordreDeNotification,
  refusInscription,
  resumeParArticle,
  type LigneAlerte,
  type ResumeArticle,
} from "@/src/lib/alertesStockLogique";

/**
 * Alertes de retour en stock — couche base.
 *
 * Elle ne décide rien : les règles viennent d'alertesStockLogique. Elle lit,
 * elle écrit, et elle envoie — sans jamais faire échouer ce qui l'a appelée.
 */

const COLONNES = "id, article_id, client_id, email, cree_le, notifie_le, token, source";

export type Alerte = {
  id: string;
  article_id: string;
  client_id: string | null;
  email: string;
  cree_le: string;
  notifie_le: string | null;
  token: string;
  source: string;
};

// ── L'inscription ───────────────────────────────────────────────────────────

export type ResultatInscription = { error?: string; email?: string; deja?: boolean };

/**
 * S'inscrire à une alerte.
 *
 * L'index unique partiel est le dernier mot : deux onglets qui envoient en même
 * temps ne créent pas deux lignes. Le doublon n'est PAS une erreur pour la
 * personne — elle voulait être prévenue, elle le sera.
 */
export async function inscrireAlerte(p: {
  articleId: string;
  email: string;
  clientId?: string | null;
}): Promise<ResultatInscription> {
  const email = normaliserEmail(p.email);

  const { data: article } = await supabaseAdmin
    .from("articles")
    .select("id, nom, type_article, vendable_en_ligne, actif, stock_actuel, stock_reserve")
    .eq("id", p.articleId)
    .maybeSingle();

  const refus = refusInscription(
    article
      ? {
          type_article: article.type_article as string | null,
          vendable_en_ligne: article.vendable_en_ligne as boolean | null,
          actif: article.actif as boolean | null,
          stock_disponible: disponibleDe(article.stock_actuel, article.stock_reserve),
        }
      : null,
    email
  );
  if (refus) return { error: refus };

  const { error } = await supabaseAdmin.from("alertes_stock").insert({
    article_id: p.articleId,
    client_id: p.clientId ?? null,
    email,
    source: "en_ligne",
  });

  if (error) {
    // 23505 : l'index unique partiel a parlé. Elle est déjà inscrite — c'est
    // exactement ce qu'elle voulait, on ne lui montre pas une erreur.
    if (error.code === "23505") return { email, deja: true };
    return { error: "L'inscription n'a pas pu être enregistrée." };
  }

  return { email };
}

/** L'alerte en cours de cette adresse sur cet article, s'il y en a une. */
export async function alerteEnCours(
  articleId: string,
  email: string | null | undefined
): Promise<Alerte | null> {
  const propre = normaliserEmail(email);
  if (!propre) return null;
  const { data } = await supabaseAdmin
    .from("alertes_stock")
    .select(COLONNES)
    .eq("article_id", articleId)
    .eq("email", propre)
    .is("notifie_le", null)
    .maybeSingle();
  return (data as Alerte | null) ?? null;
}

/**
 * Annuler : la ligne s'efface.
 *
 * C'est la seule suppression permise. La notification, elle, ne supprime
 * jamais rien — mais quelqu'un qui se retire a le droit d'être oublié.
 */
export async function annulerAlerte(p: {
  articleId?: string;
  email?: string | null;
  token?: string | null;
}): Promise<{ error?: string; annulee: boolean }> {
  let requete = supabaseAdmin.from("alertes_stock").delete();

  if (p.token) {
    requete = requete.eq("token", p.token);
  } else if (p.articleId && p.email) {
    requete = requete.eq("article_id", p.articleId).eq("email", normaliserEmail(p.email));
  } else {
    return { error: "Alerte introuvable.", annulee: false };
  }

  const { data, error } = await requete.select("id");
  if (error) return { error: "L'annulation n'a pas pu être enregistrée.", annulee: false };
  return { annulee: (data ?? []).length > 0 };
}

/** L'alerte que désigne un jeton de désinscription — pour l'afficher avant d'agir. */
export async function alerteParToken(
  token: string | null | undefined
): Promise<{ alerte: Alerte; article: { id: string; nom: string } } | null> {
  const propre = String(token ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(propre)) return null;

  const { data } = await supabaseAdmin
    .from("alertes_stock")
    .select(`${COLONNES}, articles ( id, nom )`)
    .eq("token", propre)
    .maybeSingle();
  if (!data) return null;

  const brut = data as unknown as Alerte & { articles?: { id: string; nom: string } | null };
  const article = Array.isArray(brut.articles) ? brut.articles[0] : brut.articles;
  return {
    alerte: brut,
    article: article ?? { id: brut.article_id, nom: "cet article" },
  };
}

// ── La notification ─────────────────────────────────────────────────────────

export type ResultatNotification = { envoyees: number; echecs: number };

/**
 * Prévenir tout le monde, dans l'ordre d'inscription.
 *
 * `notifie_le` se remplit à l'envoi RÉUSSI, jamais avant : si Resend refuse au
 * troisième e-mail, les deux premiers sont marqués, le troisième reste en
 * attente, et une reprise le rattrape sans redoubler les deux autres.
 *
 * Ne lève jamais : elle est appelée après une écriture de stock, qui ne doit
 * pas être annulée parce qu'un e-mail n'est pas parti.
 */
export async function notifierRetourEnStock(articleId: string): Promise<ResultatNotification> {
  const resultat: ResultatNotification = { envoyees: 0, echecs: 0 };

  try {
    const { data: article } = await supabaseAdmin
      .from("articles")
      .select("id, nom, prix_vente, photo_path")
      .eq("id", articleId)
      .maybeSingle();
    if (!article) return resultat;

    const { data: lignes } = await supabaseAdmin
      .from("alertes_stock")
      .select(COLONNES)
      .eq("article_id", articleId)
      .is("notifie_le", null);

    const aPrevenir = ordreDeNotification((lignes ?? []) as unknown as LigneAlerte[]);
    if (aPrevenir.length === 0) return resultat;

    const photoUrl = urlPhotoArticle(article.photo_path as string | null);

    for (const ligne of aPrevenir) {
      const alerte = (lignes ?? []).find((l) => (l as unknown as Alerte).id === ligne.id) as
        | unknown as Alerte | undefined;
      if (!alerte) continue;

      try {
        await envoyerEmailRetourEnStock({
          email: alerte.email,
          article: article.nom as string,
          prix: article.prix_vente as number,
          articleId: article.id as string,
          token: alerte.token,
          photoUrl,
        });

        // Marqué APRÈS l'envoi : c'est ce qui rend la reprise idempotente.
        await supabaseAdmin
          .from("alertes_stock")
          .update({ notifie_le: new Date().toISOString() })
          .eq("id", alerte.id)
          .is("notifie_le", null);

        resultat.envoyees += 1;
      } catch (err) {
        resultat.echecs += 1;
        Sentry.captureException(err);
        await tracerEvenement({
          entite: "alerte_stock",
          entiteId: alerte.id,
          evenement: "alerte_envoi_echec",
          motif: String((err as Error)?.message ?? err).slice(0, 300),
        });
      }
    }

    if (resultat.envoyees > 0 || resultat.echecs > 0) {
      await tracerEvenement({
        entite: "article",
        entiteId: articleId,
        evenement: "alerte_retour_en_stock",
        apres: { envoyees: resultat.envoyees, echecs: resultat.echecs },
      });
    }
  } catch (err) {
    // Un incident ici ne remonte jamais : l'entrée de stock est déjà écrite.
    Sentry.captureException(err);
    console.error("notifierRetourEnStock:", err);
  }

  return resultat;
}

/**
 * Le mouvement qui vient d'être écrit a-t-il fait revenir l'article ? Si oui,
 * on prévient. Appelé depuis `enregistrerMouvement`, le seul endroit où le
 * stock bouge.
 */
export async function notifierSiRetourEnStock(p: {
  articleId: string;
  disponibleAvant: number;
  disponibleApres: number;
}): Promise<ResultatNotification | null> {
  if (!estRetourEnStock(p.disponibleAvant, p.disponibleApres)) return null;
  return notifierRetourEnStock(p.articleId);
}

// ── Côté pension ────────────────────────────────────────────────────────────

/** Combien de personnes attendent cet article, sans compter celles déjà prévenues. */
export async function compterAttentes(articleId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("alertes_stock")
    .select("id", { count: "exact", head: true })
    .eq("article_id", articleId)
    .is("notifie_le", null);
  return count ?? 0;
}

export type AlerteAffichee = Alerte & { article: { id: string; nom: string; reference: string } | null };

/** Toutes les attentes, avec leur article — l'écran les filtre et les range. */
export async function listerAttentes(articleId?: string | null): Promise<AlerteAffichee[]> {
  let requete = supabaseAdmin
    .from("alertes_stock")
    .select(`${COLONNES}, articles ( id, nom, reference )`)
    .order("cree_le", { ascending: false })
    .limit(500);
  if (articleId) requete = requete.eq("article_id", articleId);

  const { data } = await requete;
  return ((data ?? []) as unknown as (Alerte & { articles?: unknown })[]).map((l) => {
    const a = Array.isArray(l.articles) ? l.articles[0] : l.articles;
    return { ...l, article: (a as AlerteAffichee["article"]) ?? null };
  });
}

/** Le classement de réassort : qui manque le plus. */
export async function resumeAttentes(): Promise<ResumeArticle[]> {
  const { data } = await supabaseAdmin
    .from("alertes_stock")
    .select("id, article_id, email, cree_le, notifie_le");
  return resumeParArticle((data ?? []) as unknown as LigneAlerte[]);
}

/**
 * Renvoyer une alerte déjà notifiée — pour le cas où l'e-mail n'est pas parti.
 *
 * `notifie_le` repart à null AVANT l'envoi : si le second envoi échoue aussi,
 * l'alerte reste en attente et la reprise automatique la rattrapera.
 */
export async function renvoyerAlerte(
  alerteId: string,
  userId?: string | null
): Promise<{ error?: string; envoyee?: boolean }> {
  const { data: alerte } = await supabaseAdmin
    .from("alertes_stock")
    .select(COLONNES)
    .eq("id", alerteId)
    .maybeSingle();
  if (!alerte) return { error: "Alerte introuvable." };

  const a = alerte as unknown as Alerte;

  const { error } = await supabaseAdmin
    .from("alertes_stock")
    .update({ notifie_le: null })
    .eq("id", alerteId);
  if (error) return { error: "L'alerte n'a pas pu être remise en attente." };

  await tracerEvenement({
    entite: "alerte_stock",
    entiteId: alerteId,
    evenement: "alerte_renvoyee",
    avant: { notifie_le: a.notifie_le },
    userId: userId ?? null,
  });

  const res = await notifierRetourEnStock(a.article_id);
  if (res.envoyees === 0) {
    return { error: "L'envoi a de nouveau échoué. L'alerte reste en attente." };
  }
  return { envoyee: true };
}
