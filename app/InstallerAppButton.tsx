"use client";

import { useEffect, useState } from "react";

// Event non typé par TS (spécifique Chromium).
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const TEAL = "#4AAEA0";

export default function InstallerAppButton({ label }: { label?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Déjà installée → rien à proposer.
  if (isStandalone) return null;

  const boutonStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    padding: "10px 16px",
    borderRadius: 12,
    border: "none",
    backgroundColor: TEAL,
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  };

  // Bloc auto-suffisant (intitulé + séparateur + bouton) : rendu uniquement
  // quand l'installation est réellement proposable.
  const Bloc = ({ children }: { children: React.ReactNode }) => (
    <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid rgba(27,43,94,0.1)" }}>
      {label && (
        <p style={{ textAlign: "center", fontSize: 12, color: "#6B7280", margin: "0 0 8px" }}>{label}</p>
      )}
      {children}
    </div>
  );

  const installerAndroid = async () => {
    if (!deferred) return;
    await deferred.prompt();
    try { await deferred.userChoice; } catch { /* ignore */ }
    setDeferred(null); // masque après le choix
  };

  // Android / Chrome / Edge : installation en 1 clic.
  if (deferred) {
    return (
      <Bloc>
        <button type="button" onClick={installerAndroid} style={boutonStyle}>
          📲 Installer l&apos;application
        </button>
      </Bloc>
    );
  }

  // iOS Safari : pas d'API → aide manuelle.
  if (isIOS) {
    return (
      <Bloc>
        <button type="button" onClick={() => setIosOpen(true)} style={boutonStyle}>
          📲 Installer l&apos;application
        </button>
        {iosOpen && (
          <div
            onClick={() => setIosOpen(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 50,
              background: "rgba(27,43,94,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 360, width: "100%" }}
            >
              <p style={{ margin: "0 0 8px", fontWeight: 700, color: "#1B2B5E", fontSize: 17 }}>
                Installer sur iPhone / iPad
              </p>
              <p style={{ margin: "0 0 18px", fontSize: 14, color: "rgba(27,43,94,0.7)", lineHeight: 1.5 }}>
                Dans Safari : touchez <strong>Partager ↑</strong>, puis{" "}
                <strong>« Sur l&apos;écran d&apos;accueil »</strong>.
              </p>
              <button
                type="button"
                onClick={() => setIosOpen(false)}
                style={{ ...boutonStyle, backgroundColor: "#EDE8DF", color: "#1B2B5E" }}
              >
                J&apos;ai compris
              </button>
            </div>
          </div>
        )}
      </Bloc>
    );
  }

  // Autres cas (desktop non éligible, déjà installée hors standalone détecté, etc.).
  return null;
}
