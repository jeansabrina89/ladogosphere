"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fusionnerPanierLocal } from "./actionsFusion";
import { lirePanier, viderPanier } from "./panierNavigateur";

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

  useEffect(() => {
    const local = lirePanier();
    if (local.lignes.length === 0) return;

    let vivant = true;
    (async () => {
      const res = await fusionnerPanierLocal(local);
      if (!vivant) return;

      // Le panier local part dans tous les cas où le serveur a répondu : le
      // garder ferait repasser la fusion à chaque écran.
      if (!res.error) {
        viderPanier();
        if (res.message) setMessage(res.message);
        router.refresh();
      }
    })();

    return () => { vivant = false; };
  }, [router]);

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
