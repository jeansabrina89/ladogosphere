"use client";

import { useState } from "react";
import Link from "next/link";

type Chien = {
  id: string;
  nom: string;
  race: string;
  couleur: string;
  poids: number;
  date_naissance: string;
  sexe: string;
  sterilisation: string;
};

export default function RechercheChiens({
  chiens,
}: {
  chiens: Chien[];
}) {
  const [recherche, setRecherche] = useState("");

  const chiensFiltres = chiens.filter((chien) =>
    chien.nom.toLowerCase().includes(recherche.toLowerCase())
  );

  function calculerAge(dateNaissance: string) {
    if (!dateNaissance) return "-";

    const naissance = new Date(dateNaissance);
    const aujourdHui = new Date();

    let age =
      aujourdHui.getFullYear() -
      naissance.getFullYear();

    const mois =
      aujourdHui.getMonth() -
      naissance.getMonth();

    if (
      mois < 0 ||
      (mois === 0 &&
        aujourdHui.getDate() < naissance.getDate())
    ) {
      age--;
    }

    return age;
  }

  return (
    <>
      <input
        type="text"
        placeholder="🔍 Rechercher un chien..."
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        className="w-full mb-6 p-3 rounded-xl border bg-white"
      />

      <div className="grid gap-4">
        {chiensFiltres.map((chien) => (
          <div
            key={chien.id}
            className="bg-white rounded-xl p-6 shadow"
          >
            <Link href={`/chiens/${chien.id}`}>
              <h2
                className={`text-xl font-bold hover:underline cursor-pointer ${
                  chien.sexe === "F"
                    ? "text-pink-600"
                    : "text-blue-600"
                }`}
              >
                {chien.nom}{" "}
                {chien.sexe === "F" ? "♀️" : "♂️"}
              </h2>
            </Link>

            <p className="font-medium mb-2">
              {chien.sexe === "M"
                ? chien.sterilisation === "oui"
                  ? "♂️ Mâle castré"
                  : chien.sterilisation === "chimique"
                  ? "♂️ Mâle castré chimiquement"
                  : "♂️ Mâle entier"
                : chien.sterilisation === "oui"
                ? "♀️ Femelle stérilisée"
                : chien.sterilisation === "chimique"
                ? "♀️ Femelle castrée chimiquement"
                : "♀️ Femelle entière"}
            </p>

            <p className="text-gray-600">
              {chien.race}
            </p>

            <p className="text-gray-500">
              🎨 {chien.couleur || "-"}
            </p>

            <p>
              🎂 {calculerAge(chien.date_naissance)} an(s)
            </p>

            <p>
              ⚖️ {chien.poids} kg
            </p>
          </div>
        ))}
      </div>
    </>
  );
}