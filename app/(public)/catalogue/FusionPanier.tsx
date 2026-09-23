"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fusionnerPanierLocal } from "./actionsFusion";
import { lirePanier, viderPanier } from "./panierNavigateur";
import { tenterReseau } from "@/src/lib/reseau";

/**
 * Le panier du navigateur rejoint le compte, à la connexion.
 *
 * Monté sur les écrans de la boutique dès qu'une session existe : s'il reste
 * un panier local, il part vers le compte, puis il est vidé du navigateur —
 * sinon il repartirait à chaque visite.
 *
 * Une ligne à l'écran, et une seule : ce qui a rejoint le compte, et ce qui a
 * été retiré parce qu'il n'est plus proposé.
 */
export default function FusionPanier() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  // Un refus garde le panier du navigateur : la cliente voit ce qui cloche et
  // peut corriger, plutôt que de perdre sa sélection.
  const [refus, setRefus] = useState<string | null>(null);

  useEffect(() => {
    const local = lirePanier();
    if (local.lignes.length === 0) return;

    let vivant = true;
    void (async () => {
      // Le panier du navigateur n'est PAS vidé si l'appel n'aboutit pas : on
      // ne perd pas une sélection parce que le réseau a lâché.
      const tentative = await tenterReseau(
        "FusionPanier.fusionner",
        () => fusionnerPanierLocal(local),
        { siEchec: (phrase) => { if (vivant) setRefus(phrase); } },
      );
      if (!vivant || !tentative.ok) return;
      const res = tentative.valeur;

      // Le panier local part dans tous les cas où le serveur a répondu : le
      // garder ferait repasser la fusion à chaque écran.
      if (res.error) {
        setRefus(res.error);
        return;
      }
      viderPanier();
      const avertissements = (res.invalides ?? []).map((i) => i.message);
      if (res.message || avertissements.length > 0) {
        setMessage([res.message, ...avertissements].filter(Boolean).join(" "));
      }
      router.refresh();
    })();

    return () => { vivant = false; };
  }, [router]);

  if (refus) {
    return (
      <p role="alert" style={{
        backgroundColor: "#FDECEC", color: "#8A1F1F", border: "1px solid #F0C2C2",
        borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 600, margin: "0 0 16px",
      }}>
        🛒 {refus}
      </p>
    );
  }

  if (!message) return null;

  return (
    <p
      role="status"
      style={{
        backgroundColor: "#E4F1EC", color: "#1F6E5B", border: "1px solid #B9DDD1",
        borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 600,
        margin: "0 0 16px",
      }}
    >
      🛒 {message}
    </p>
  );
}
