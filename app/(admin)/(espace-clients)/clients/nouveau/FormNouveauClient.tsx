"use client";

import { useActionState } from "react";
import { creerClient } from "./actions";
import { LIBELLE_ACCORD_PHOTOS } from "@/src/lib/accordPhotos";
import AlerteFormulaire, { marqueChampClasse } from "@/app/components/AlerteFormulaire";
import {
  ETAT_FORMULAIRE_VIDE,
  caseCochee,
  valeurChamp,
  type EtatFormulaire,
} from "@/src/lib/etatFormulaire";

const CHAMP = "w-full border rounded-xl p-3";

export default function FormNouveauClient() {
  const [etat, action] = useActionState<EtatFormulaire, FormData>(creerClient, ETAT_FORMULAIRE_VIDE);
  const v = etat.valeurs;

  return (
    <form action={action} className="space-y-4">
      <AlerteFormulaire etat={etat} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="prenom" className="block font-semibold mb-1">Prénom *</label>
          <input {...marqueChampClasse(etat, "prenom", CHAMP)} type="text" required
                 defaultValue={valeurChamp(v, "prenom")} />
        </div>
        <div>
          <label htmlFor="nom" className="block font-semibold mb-1">Nom *</label>
          <input {...marqueChampClasse(etat, "nom", CHAMP)} type="text" required
                 defaultValue={valeurChamp(v, "nom")} />
        </div>
      </div>

      <div>
        <label htmlFor="email" className="block font-semibold mb-1">Email *</label>
        <input {...marqueChampClasse(etat, "email", CHAMP)} type="email" required
               defaultValue={valeurChamp(v, "email")} />
      </div>

      <div>
        <label htmlFor="telephone" className="block font-semibold mb-1">Téléphone</label>
        <input {...marqueChampClasse(etat, "telephone", CHAMP)} type="text"
               defaultValue={valeurChamp(v, "telephone")} />
      </div>

      <div>
        <label htmlFor="adresse" className="block font-semibold mb-1">Adresse</label>
        <textarea {...marqueChampClasse(etat, "adresse", CHAMP)} rows={3}
                  defaultValue={valeurChamp(v, "adresse")} />
      </div>

      <div className="border-t pt-4">
        <label htmlFor="photos_ok" className="flex items-start gap-2">
          <input type="checkbox" name="photos_ok" id="photos_ok"
                 defaultChecked={caseCochee(v, "photos_ok", true)}
                 className="mt-1 h-4 w-4 flex-shrink-0" />
          <span className="text-sm">📸 {LIBELLE_ACCORD_PHOTOS}</span>
        </label>
      </div>

      <div className="border-t pt-4">
        <label htmlFor="membre" className="flex items-center gap-2 font-semibold">
          <input type="checkbox" name="membre" id="membre"
                 defaultChecked={caseCochee(v, "membre", false)} />
          ⭐ Membre (tarifs préférentiels)
        </label>
      </div>

      <div className="flex gap-3 pt-4 border-t">
        <button type="submit"
          className="px-6 py-3 rounded-xl font-semibold text-white"
          style={{ backgroundColor: "#2E8B7E" }}>
          💾 Enregistrer
        </button>
        <a href="/clients"
          className="px-6 py-3 rounded-xl font-semibold"
          style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
          ✖ Annuler
        </a>
      </div>
    </form>
  );
}
