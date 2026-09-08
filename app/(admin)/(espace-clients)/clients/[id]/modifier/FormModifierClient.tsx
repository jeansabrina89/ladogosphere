"use client";

import { useActionState } from "react";
import { modifierClient } from "./actions";
import { LIBELLE_ACCORD_PHOTOS } from "@/src/lib/accordPhotos";
import AlerteFormulaire, { marqueChampClasse } from "@/app/components/AlerteFormulaire";
import {
  ETAT_FORMULAIRE_VIDE,
  caseCochee,
  valeurChamp,
  type EtatFormulaire,
} from "@/src/lib/etatFormulaire";

export type ClientFiche = Record<string, unknown> & { id: string };

const CHAMP = "w-full border rounded-xl p-3";

export default function FormModifierClient({
  client,
  estAdmin,
}: {
  client: ClientFiche;
  estAdmin: boolean;
}) {
  const [etat, action] = useActionState<EtatFormulaire, FormData>(
    modifierClient.bind(null, client.id),
    ETAT_FORMULAIRE_VIDE
  );
  const v = etat.valeurs;

  const texte = (nom: string) => valeurChamp(v, nom, (client[nom] as string | null) ?? "");

  return (
    <form action={action} className="space-y-4">
      <AlerteFormulaire etat={etat} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="prenom" className="block font-semibold mb-1">Prénom *</label>
          <input {...marqueChampClasse(etat, "prenom", CHAMP)} type="text" required
                 defaultValue={texte("prenom")} />
        </div>
        <div>
          <label htmlFor="nom" className="block font-semibold mb-1">Nom *</label>
          <input {...marqueChampClasse(etat, "nom", CHAMP)} type="text" required
                 defaultValue={texte("nom")} />
        </div>
      </div>

      <div>
        <label htmlFor="email" className="block font-semibold mb-1">Email *</label>
        <input {...marqueChampClasse(etat, "email", CHAMP)} type="email" required
               defaultValue={texte("email")} />
      </div>

      <div>
        <label htmlFor="telephone" className="block font-semibold mb-1">Téléphone</label>
        <input {...marqueChampClasse(etat, "telephone", CHAMP)} type="text"
               defaultValue={texte("telephone")} />
      </div>

      <div>
        <label htmlFor="adresse" className="block font-semibold mb-1">Adresse</label>
        <textarea {...marqueChampClasse(etat, "adresse", CHAMP)} rows={3}
                  defaultValue={texte("adresse")} />
      </div>

      <div className="border-t pt-4">
        <label htmlFor="photos_ok" className="flex items-start gap-2">
          <input type="checkbox" name="photos_ok" id="photos_ok"
                 defaultChecked={caseCochee(v, "photos_ok", client.photos_ok !== false)}
                 className="mt-1 h-4 w-4 flex-shrink-0" />
          <span className="text-sm">📸 {LIBELLE_ACCORD_PHOTOS}</span>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" name="membre" id="membre"
               defaultChecked={caseCochee(v, "membre", !!client.membre)} />
        <label htmlFor="membre" className="font-semibold">
          ⭐ Membre (tarifs préférentiels)
        </label>
      </div>

      {/* Exemption de cotisation — admin uniquement */}
      {estAdmin && (
        <div className="border-t pt-4">
          <div className="flex items-center gap-2">
            <input type="checkbox" name="cotisation_exemptee" id="cotisation_exemptee"
                   defaultChecked={caseCochee(v, "cotisation_exemptee", !!client.cotisation_exemptee)} />
            <label htmlFor="cotisation_exemptee" className="font-semibold">
              🎟️ Exempté d&apos;adhésion
            </label>
          </div>
          <div className="mt-3">
            <label htmlFor="cotisation_exemptee_raison" className="block font-semibold mb-1">
              Raison de l&apos;exemption
            </label>
            <input {...marqueChampClasse(etat, "cotisation_exemptee_raison", CHAMP)} type="text"
                   defaultValue={texte("cotisation_exemptee_raison")}
                   placeholder="Ex : employée, bénévole…" />
          </div>
        </div>
      )}

      {/* Contact d'urgence */}
      <div className="border-t pt-4">
        <h2 className="font-bold mb-3" style={{ color: "#1B2B5E" }}>
          🚨 Contact d&apos;urgence
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="contact_urgence_prenom" className="block font-semibold mb-1">Prénom</label>
            <input {...marqueChampClasse(etat, "contact_urgence_prenom", CHAMP)} type="text"
                   defaultValue={texte("contact_urgence_prenom")} placeholder="Prénom" />
          </div>
          <div>
            <label htmlFor="contact_urgence_nom" className="block font-semibold mb-1">Nom</label>
            <input {...marqueChampClasse(etat, "contact_urgence_nom", CHAMP)} type="text"
                   defaultValue={texte("contact_urgence_nom")} placeholder="Nom" />
          </div>
        </div>
        <div className="mt-3">
          <label htmlFor="contact_urgence_telephone" className="block font-semibold mb-1">Téléphone</label>
          <input {...marqueChampClasse(etat, "contact_urgence_telephone", CHAMP)} type="text"
                 defaultValue={texte("contact_urgence_telephone")} placeholder="+41 XX XXX XX XX" />
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t">
        <button type="submit"
          className="px-6 py-3 rounded-xl font-semibold text-white"
          style={{ backgroundColor: "#2E8B7E" }}>
          💾 Enregistrer
        </button>
        <a href={`/clients/${client.id}`}
          className="px-6 py-3 rounded-xl font-semibold"
          style={{ backgroundColor: "#EDE8DF", color: "#1B2B5E" }}>
          ✖ Annuler
        </a>
      </div>
    </form>
  );
}
