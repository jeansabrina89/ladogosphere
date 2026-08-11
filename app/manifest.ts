import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "La Dogosphère — Pension Canine",
    short_name: "La Dogosphère",
    description: "Réservations et espace client de la pension canine La Dogosphère.",
    start_url: "/",
    display: "standalone",
    lang: "fr",
    background_color: "#F2E3CA",
    theme_color: "#4AAEA0",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
