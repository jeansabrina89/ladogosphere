"use client";

import { useEffect } from "react";

// Enregistre le service worker minimal (installabilité PWA).
// Ne bloque rien si non supporté (ex. iOS Safari) : garde `'serviceWorker' in navigator`.
export default function RegisterSW() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* installabilité optionnelle : on ignore silencieusement un échec */
    });
  }, []);

  return null;
}
