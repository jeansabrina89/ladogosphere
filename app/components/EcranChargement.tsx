/**
 * APP 70 — ce qu'on voit pendant que l'écran charge.
 *
 * Un toucher sur le menu doit changer l'écran TOUT DE SUITE : ce squelette est
 * préchargé avec le lien (loading.tsx), il s'affiche à l'instant, et la vraie
 * page le remplace dès que ses données sont arrivées.
 *
 * Sobre, aux couleurs de l'app : un titre, une ligne, quelques cartes — la
 * silhouette commune à presque tous les écrans, sans prétendre deviner
 * lequel. Pas de « Chargement… » écrit seul au milieu d'une page vide : la
 * phrase existe, mais pour les lecteurs d'écran seulement.
 */
export default function EcranChargement({ cartes = 3 }: { cartes?: number }) {
  return (
    <main
      className="min-h-screen px-4 py-6 md:px-8 md:py-8"
      style={{ backgroundColor: "#F5F0E8" }}
      aria-busy="true"
    >
      <div style={{ maxWidth: 960, margin: "0 auto", minWidth: 0 }}>
        <p role="status" className="sr-only">Chargement de l&apos;écran</p>

        {/* Le titre de l'écran, puis la ligne qui le précise. */}
        <div aria-hidden="true">
          <div className="squelette-bloc" style={{ height: 34, width: "min(320px, 70%)", marginBottom: 12 }} />
          <div className="squelette-bloc" style={{ height: 16, width: "min(220px, 50%)", marginBottom: 28 }} />

          <div style={{ display: "grid", gap: 14 }}>
            {Array.from({ length: cartes }, (_, i) => (
              <div
                key={i}
                className="squelette-bloc"
                style={{ height: i === 0 ? 120 : 84, animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
