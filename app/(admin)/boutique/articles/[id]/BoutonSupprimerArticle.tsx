"use client";

import { useActionState } from "react";
import { supprimerArticle } from "@/app/(admin)/boutique/actions";

/**
 * « Supprimer définitivement », et il n'apparaît QUE pour un article qui n'a
 * jamais servi.
 *
 * La confirmation nomme la référence ET le nom : « Supprimer définitivement
 * ART-0057 Paille ? » se relit avant de cliquer, là où « Supprimer cet
 * article ? » ne dit pas lequel — et on a souvent deux onglets ouverts.
 *
 * L'écran ne décide de rien : c'est `article_supprimable`, relue en base, qui
 * dit si ce bouton existe, et c'est `supprimer_article` qui refuse pour de bon
 * si la situation a changé entre l'affichage et le clic.
 */
export default function BoutonSupprimerArticle({
  id,
  reference,
  nom,
}: {
  id: string;
  reference: string;
  nom: string;
}) {
  const [etat, action, enCours] = useActionState(supprimerArticle, {});

  return (
    <form action={action} style={{ display: "grid", gap: 8 }}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={enCours}
        onClick={(e) => {
          if (
            !confirm(
              `Supprimer définitivement ${reference} ${nom} ? Cette action est irréversible.`
            )
          ) {
            e.preventDefault();
          }
        }}
        style={{
          minHeight: 44,
          padding: "10px 18px",
          borderRadius: 12,
          border: "1px solid #8A1F1F",
          background: enCours ? "#EDE8DF" : "#FFFFFF",
          color: "#8A1F1F",
          fontSize: 15,
          fontWeight: 700,
          fontFamily: "inherit",
          cursor: enCours ? "not-allowed" : "pointer",
          justifySelf: "start",
        }}
      >
        {enCours ? "Suppression…" : "🗑️ Supprimer définitivement"}
      </button>
      {/*
        * Le refus de dernière seconde : quelqu'un a vendu l'article pendant que
        * la page était ouverte. Il s'affiche ICI, sous le bouton, parce que
        * c'est là qu'on regarde après avoir cliqué.
        */}
      {etat.erreur && (
        <p role="alert" style={{ color: "#8A1F1F", fontSize: 14, fontWeight: 600, margin: 0 }}>
          {etat.erreur}
        </p>
      )}
    </form>
  );
}
