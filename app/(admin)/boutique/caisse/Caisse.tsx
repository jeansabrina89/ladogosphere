"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { encaisserVente, chercherClients, type ClientCaisse } from "./actions";
import {
  MODES_CAISSE,
  estPersonnalisable,
  ligneDepuisArticle,
  changerQuantite,
  totalPanier,
  refusPanier,
  encaissementVente,
  rendreMonnaie,
  lireMontant,
  chf,
  type ArticleVendable,
  type LignePanier,
  type ModeReglementVente,
} from "@/src/lib/caisseLogique";
import { urlPhotoArticle } from "@/src/lib/boutiqueLogique";

/**
 * Caisse au comptoir.
 *
 * Une seule page, tenue d'une main, debout : le champ de recherche en haut
 * garde le focus pour enchaîner les scans, les résultats sont de grandes
 * lignes touchables, et le panier occupe la moitié basse sans jamais sortir de
 * l'écran. Aucun tableau : rien qui oblige à défiler de côté.
 */

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.55)";
const BORDURE = "1px solid rgba(27,43,94,0.14)";
const VERT = "#2E8B7E";
const CIBLE = 52; // hauteur minimale de toute cible tactile

const champ: React.CSSProperties = {
  width: "100%", minHeight: CIBLE, padding: "12px 14px", border: BORDURE,
  borderRadius: 14, fontSize: 16, color: MARINE, backgroundColor: "#FFFFFF",
  fontFamily: "inherit", boxSizing: "border-box",
};

type Etape = "panier" | "paiement" | "fait";

export default function Caisse({
  articles,
  peutFacturer,
}: {
  articles: ArticleVendable[];
  /** « Sur la facture du client » demande en plus perm_encaissements. */
  peutFacturer: boolean;
}) {
  const router = useRouter();
  const champRecherche = useRef<HTMLInputElement>(null);

  const [recherche, setRecherche] = useState("");
  const [panier, setPanier] = useState<LignePanier[]>([]);
  // Une clé par panier : deux clics, un réseau capricieux, une seule vente.
  const [cle, setCle] = useState<string>(nouvelleCle);
  const [etape, setEtape] = useState<Etape>("panier");
  const [mode, setMode] = useState<ModeReglementVente | null>(null);
  const [recu, setRecu] = useState("");
  const [client, setClient] = useState<ClientCaisse | null>(null);
  const [rechercheClient, setRechercheClient] = useState("");
  const [clients, setClients] = useState<ClientCaisse[]>([]);
  const [forcerFactureLibre, setForcerFactureLibre] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [faite, setFaite] = useState<{ id: string; numero: string; rendu: number | null; arrondi: number } | null>(null);

  const total = totalPanier(panier);
  const encaissement = encaissementVente(total, mode ?? "carte");
  const rendu = rendreMonnaie(encaissement.aRegler, lireMontant(recu));

  const rendreFocus = useCallback(() => {
    // La douchette tape dans ce champ : il ne doit jamais le perdre.
    window.setTimeout(() => champRecherche.current?.focus(), 0);
  }, []);

  const resultats = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return articles.slice(0, 30);
    return articles
      .filter((a) =>
        `${a.nom} ${a.reference} ${a.code_barres ?? ""}`.toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [articles, recherche]);

  const ajouter = useCallback((article: ArticleVendable) => {
    setErreur(null);
    setPanier((actuel) => {
      const i = actuel.findIndex((l) => l.article_id === article.id);
      if (i === -1) return [...actuel, ligneDepuisArticle(article, 1)];
      const suite = [...actuel];
      suite[i] = changerQuantite(suite[i], suite[i].quantite + 1);
      return suite;
    });
    setRecherche("");
    rendreFocus();
  }, [rendreFocus]);

  function surEntree(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const saisi = recherche.trim();
    if (!saisi) return;

    // Une douchette termine par Entrée : un code-barres exact entre au panier
    // sans passer par la liste.
    const parCode = articles.find((a) => (a.code_barres ?? "") === saisi);
    if (parCode) return ouvrirOuAjouter(parCode);

    if (resultats.length === 1) return ouvrirOuAjouter(resultats[0]);
    setErreur(`Aucun article ne correspond à « ${saisi} ».`);
  }

  /** Un article sur mesure ne s'ajoute pas : il se configure. */
  function ouvrirOuAjouter(article: ArticleVendable) {
    if (estPersonnalisable(article)) {
      router.push(`/boutique/caisse/sur-mesure/${article.id}`);
      return;
    }
    ajouter(article);
  }

  function modifier(articleId: string, delta: number) {
    setErreur(null);
    setPanier((actuel) =>
      actuel
        .map((l) => (l.article_id === articleId ? changerQuantite(l, l.quantite + delta) : l))
        .filter((l) => l.quantite > 0)
    );
    rendreFocus();
  }

  function retirer(articleId: string) {
    setPanier((actuel) => actuel.filter((l) => l.article_id !== articleId));
    rendreFocus();
  }

  function repartir() {
    setPanier([]);
    setCle(nouvelleCle());
    setMode(null);
    setRecu("");
    setClient(null);
    setClients([]);
    setRechercheClient("");
    setForcerFactureLibre(false);
    setErreur(null);
    setFaite(null);
    setEtape("panier");
    rendreFocus();
  }

  async function chercher(q: string) {
    setRechercheClient(q);
    if (q.trim().length < 2) return setClients([]);
    setClients(await chercherClients(q));
  }

  async function valider() {
    setErreur(null);
    const refus = refusPanier(panier);
    if (refus) return setErreur(refus);
    if (!mode) return setErreur("Choisissez le mode de règlement.");
    if (mode === "facture_client" && !client) return setErreur("Choisissez le client à facturer.");
    if (mode === "especes" && rendu === null && recu.trim() !== "") {
      return setErreur("Le montant reçu ne couvre pas le total.");
    }

    setEnCours(true);
    const res = await encaisserVente({
      cle_idempotence: cle,
      lignes: panier.map((l) => ({ article_id: l.article_id, quantite: l.quantite })),
      mode,
      client_id: client?.id ?? null,
      montant_recu: mode === "especes" ? lireMontant(recu) : null,
      creer_facture_libre: forcerFactureLibre,
    });
    setEnCours(false);

    if (res.error) {
      setErreur(res.error);
      if (res.proposerFactureLibre) setForcerFactureLibre(false);
      return;
    }

    setFaite({
      id: res.id!,
      numero: res.numero!,
      rendu: res.rendu ?? null,
      arrondi: res.arrondi ?? 0,
    });
    setEtape("fait");
  }

  return (
    <div className="caisse-cadre">
      <style>{`
        .caisse-cadre { display: flex; flex-direction: column; height: calc(100dvh - 57px); background: #F5F0E8; }
        @media (min-width: 768px) { .caisse-cadre { height: 100dvh; } }
      `}</style>

      {/* Recherche — elle reste en haut, toujours atteignable */}
      <div style={{ padding: 12, borderBottom: BORDURE, backgroundColor: "#FFFFFF", flex: "0 0 auto" }}>
        <input
          ref={champRecherche}
          type="text"
          autoFocus
          autoComplete="off"
          value={recherche}
          onChange={(e) => { setRecherche(e.target.value); setErreur(null); }}
          onKeyDown={surEntree}
          placeholder="Nom, référence ou code-barres…"
          aria-label="Chercher un article"
          style={{ ...champ, fontSize: 17 }}
        />
      </div>

      {/* Résultats */}
      <div style={{ flex: "1 1 auto", overflowY: "auto", padding: 12, display: "grid", gap: 8, alignContent: "start" }}>
        {resultats.length === 0 && (
          <p style={{ color: SOUS, fontSize: 15, margin: 0 }}>Aucun article ne correspond.</p>
        )}
        {resultats.map((a) => {
          const stock = Number(a.stock_actuel);
          const dansPanier = panier.find((l) => l.article_id === a.id)?.quantite ?? 0;
          const surMesure = estPersonnalisable(a);
          const epuise = !surMesure && stock - dansPanier <= 0;

          const style: React.CSSProperties = {
            display: "flex", alignItems: "center", gap: 12, textAlign: "left",
            minHeight: 64, padding: "8px 12px", borderRadius: 14,
            border: BORDURE, backgroundColor: "#FFFFFF", fontFamily: "inherit",
            cursor: "pointer", opacity: epuise ? 0.5 : 1, width: "100%",
            textDecoration: "none",
          };

          const contenu = (
            <>
              <Vignette article={a} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", color: MARINE, fontSize: 16, fontWeight: 700 }}>{a.nom}</span>
                <span style={{ display: "block", color: SOUS, fontSize: 13 }}>
                  {a.reference} · {surMesure ? "sur mesure — à configurer" : `reste ${stock - dansPanier} ${a.unite}`}
                </span>
              </span>
              <span style={{ color: MARINE, fontSize: 17, fontWeight: 700, whiteSpace: "nowrap" }}>
                {surMesure ? "dès " : ""}{chf(Number(a.prix_vente))}
              </span>
            </>
          );

          // Un article personnalisable n'entre pas au panier : il ouvre son
          // configurateur, seul endroit où son prix se calcule.
          return surMesure ? (
            <Link key={a.id} href={`/boutique/caisse/sur-mesure/${a.id}`} style={style}>
              {contenu}
            </Link>
          ) : (
            <button
              key={a.id}
              type="button"
              onClick={() => (epuise ? setErreur(`Il ne reste plus de « ${a.nom} » en stock.`) : ajouter(a))}
              style={style}
            >
              {contenu}
            </button>
          );
        })}
      </div>

      {/* Panier — moitié basse, jamais hors de l'écran */}
      <div
        style={{
          flex: "0 0 auto", maxHeight: "46%", display: "flex", flexDirection: "column",
          backgroundColor: "#FFFFFF", borderTop: "2px solid rgba(27,43,94,0.14)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div style={{ flex: "1 1 auto", overflowY: "auto", padding: panier.length ? 12 : 0 }}>
          {panier.length === 0 ? (
            <p style={{ color: SOUS, fontSize: 15, textAlign: "center", padding: 16, margin: 0 }}>
              Panier vide — scannez ou touchez un article.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {panier.map((l) => (
                <div key={l.article_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", color: MARINE, fontSize: 15, fontWeight: 600, overflowWrap: "anywhere" }}>
                      {l.libelle}
                    </span>
                    <span style={{ display: "block", color: SOUS, fontSize: 13 }}>
                      {l.quantite} × {chf(l.prix_unitaire)}
                    </span>
                  </span>

                  <button type="button" onClick={() => modifier(l.article_id, -1)}
                    aria-label={`Retirer un ${l.libelle}`} style={boutonRond}>−</button>
                  <span style={{ minWidth: 28, textAlign: "center", color: MARINE, fontSize: 18, fontWeight: 700 }}>
                    {l.quantite}
                  </span>
                  <button type="button" onClick={() => modifier(l.article_id, 1)}
                    aria-label={`Ajouter un ${l.libelle}`} style={boutonRond}>+</button>

                  <span style={{ minWidth: 78, textAlign: "right", color: MARINE, fontSize: 16, fontWeight: 700 }}>
                    {chf(l.montant)}
                  </span>
                  <button type="button" onClick={() => retirer(l.article_id)}
                    aria-label={`Supprimer ${l.libelle}`}
                    style={{ ...boutonRond, border: "none", background: "transparent", color: SOUS, fontSize: 20 }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {erreur && (
          <p role="alert" style={{
            backgroundColor: "#FDECEC", color: "#8A1F1F", border: "1px solid #F0C2C2",
            borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 600, margin: "0 12px 8px",
          }}>
            ⚠️ {erreur}
          </p>
        )}

        <div style={{ padding: 12, borderTop: BORDURE, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", color: SOUS, fontSize: 13 }}>Total</span>
            <span style={{ display: "block", color: MARINE, fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>
              {chf(total)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => { setEtape("paiement"); setErreur(null); }}
            disabled={panier.length === 0}
            style={{
              minHeight: CIBLE + 4, padding: "0 26px", borderRadius: 14, border: "none",
              backgroundColor: panier.length === 0 ? "#B9CFC9" : VERT, color: "#FFFFFF",
              fontSize: 18, fontWeight: 700, fontFamily: "inherit",
              cursor: panier.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            💳 Encaisser
          </button>
        </div>
      </div>

      {etape === "paiement" && (
        <Voile>
          <h2 style={{ color: MARINE, fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>Encaisser</h2>
          <p style={{ color: SOUS, fontSize: 15, margin: "0 0 16px" }}>
            {panier.length} ligne{panier.length > 1 ? "s" : ""} — {chf(total)}
          </p>

          <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            {MODES_CAISSE.filter((m) => m.valeur !== "facture_client" || peutFacturer).map((m) => (
              <button
                key={m.valeur}
                type="button"
                onClick={() => { setMode(m.valeur); setErreur(null); }}
                style={{
                  minHeight: CIBLE + 4, borderRadius: 14, fontSize: 17, fontWeight: 700,
                  fontFamily: "inherit", cursor: "pointer", textAlign: "left", padding: "0 16px",
                  border: mode === m.valeur ? `2px solid ${VERT}` : BORDURE,
                  backgroundColor: mode === m.valeur ? "#F1F8F6" : "#FFFFFF", color: MARINE,
                }}
              >
                {m.icone} {m.libelle}
              </button>
            ))}
          </div>

          {mode === "especes" && (
            <div style={{ marginBottom: 16 }}>
              {encaissement.arrondi !== 0 && (
                <p style={{ color: SOUS, fontSize: 14, margin: "0 0 8px" }}>
                  Arrondi aux 5 centimes : {encaissement.arrondi > 0 ? "+" : ""}
                  {encaissement.arrondi.toFixed(2)} — à encaisser{" "}
                  <strong style={{ color: MARINE }}>{chf(encaissement.aRegler)}</strong>.
                </p>
              )}
              <label htmlFor="recu" style={{ display: "block", fontSize: 14, fontWeight: 600, color: MARINE, marginBottom: 6 }}>
                Reçu du client
              </label>
              <input
                id="recu" type="text" inputMode="decimal" value={recu}
                onChange={(e) => setRecu(e.target.value)}
                placeholder={encaissement.aRegler.toFixed(2)}
                style={{ ...champ, fontSize: 22, fontWeight: 700 }}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {[10, 20, 50, 100, 200].map((b) => (
                  <button key={b} type="button" onClick={() => setRecu(String(b))}
                    style={{ ...boutonSecondaire, minWidth: 64 }}>{b}</button>
                ))}
                <button type="button" onClick={() => setRecu(encaissement.aRegler.toFixed(2))}
                  style={boutonSecondaire}>Compte juste</button>
              </div>
              <p aria-live="polite" style={{
                marginTop: 12, marginBottom: 0, fontSize: 20, fontWeight: 700,
                color: rendu === null ? SOUS : "#1F6E5B",
              }}>
                {rendu === null
                  ? "Rendu : —"
                  : `Rendu : ${rendu.toFixed(2)}`}
              </p>
            </div>
          )}

          {mode === "facture_client" && (
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="client" style={{ display: "block", fontSize: 14, fontWeight: 600, color: MARINE, marginBottom: 6 }}>
                Client
              </label>
              <input
                id="client" type="search" value={rechercheClient}
                onChange={(e) => chercher(e.target.value)}
                placeholder="Nom du client…"
                style={champ}
              />
              <div style={{ display: "grid", gap: 8, marginTop: 8, maxHeight: 200, overflowY: "auto" }}>
                {clients.map((c) => (
                  <button
                    key={c.id} type="button"
                    onClick={() => { setClient(c); setForcerFactureLibre(false); setErreur(c.prete ? null : c.etat); }}
                    style={{
                      minHeight: CIBLE, borderRadius: 14, padding: "8px 14px", textAlign: "left",
                      border: client?.id === c.id ? `2px solid ${VERT}` : BORDURE,
                      backgroundColor: "#FFFFFF", fontFamily: "inherit", cursor: "pointer",
                    }}
                  >
                    <span style={{ display: "block", color: MARINE, fontSize: 15, fontWeight: 700 }}>{c.nom}</span>
                    <span style={{ display: "block", color: c.prete ? "#1F6E5B" : "#A8453A", fontSize: 13 }}>
                      {c.etat}
                    </span>
                  </button>
                ))}
              </div>

              {client && !client.prete && (
                <label htmlFor="facture_libre" style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, fontSize: 15, color: MARINE }}>
                  <input
                    type="checkbox" id="facture_libre" checked={forcerFactureLibre}
                    onChange={(e) => setForcerFactureLibre(e.target.checked)}
                    style={{ width: 22, height: 22 }}
                  />
                  Créer une facture libre pour cet achat
                </label>
              )}
            </div>
          )}

          {erreur && (
            <p role="alert" style={{
              backgroundColor: "#FDECEC", color: "#8A1F1F", border: "1px solid #F0C2C2",
              borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 600, margin: "0 0 12px",
            }}>
              ⚠️ {erreur}
            </p>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button" onClick={valider}
              disabled={enCours || !mode || (mode === "facture_client" && (!client || (!client.prete && !forcerFactureLibre)))}
              style={{
                flex: 1, minHeight: CIBLE + 4, borderRadius: 14, border: "none",
                backgroundColor: enCours ? "#B9CFC9" : VERT, color: "#FFFFFF",
                fontSize: 18, fontWeight: 700, fontFamily: "inherit",
                cursor: enCours ? "wait" : "pointer",
              }}
            >
              {enCours ? "Enregistrement…" : `Valider ${chf(encaissement.aRegler)}`}
            </button>
            <button type="button" onClick={() => { setEtape("panier"); setErreur(null); rendreFocus(); }}
              style={{ ...boutonSecondaire, minHeight: CIBLE + 4, padding: "0 18px" }}>
              Retour
            </button>
          </div>
        </Voile>
      )}

      {etape === "fait" && faite && (
        <Voile>
          <p style={{ fontSize: 44, textAlign: "center", margin: "0 0 8px" }}>✅</p>
          <h2 style={{ color: MARINE, fontSize: 20, fontWeight: 700, margin: "0 0 4px", textAlign: "center" }}>
            {faite.numero}
          </h2>
          <p style={{ color: SOUS, fontSize: 16, textAlign: "center", margin: "0 0 4px" }}>
            {chf(encaissement.aRegler)} — {MODES_CAISSE.find((m) => m.valeur === mode)?.libelle}
          </p>
          {faite.rendu !== null && (
            <p style={{ color: "#1F6E5B", fontSize: 26, fontWeight: 700, textAlign: "center", margin: "8px 0 0" }}>
              Rendu : {faite.rendu.toFixed(2)}
            </p>
          )}
          {faite.arrondi !== 0 && (
            <p style={{ color: SOUS, fontSize: 14, textAlign: "center", margin: "6px 0 0" }}>
              Arrondi des espèces : {faite.arrondi > 0 ? "+" : ""}{faite.arrondi.toFixed(2)}
            </p>
          )}

          <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
            <a
              href={`/api/ventes/${faite.id}/ticket`}
              target="_blank"
              rel="noreferrer"
              style={{
                minHeight: CIBLE + 4, borderRadius: 14, backgroundColor: MARINE, color: "#FFFFFF",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 17, fontWeight: 700, textDecoration: "none",
              }}
            >
              🖨️ Imprimer le ticket
            </a>
            <a
              href={`/boutique/ventes/${faite.id}`}
              style={{ ...boutonSecondaire, minHeight: CIBLE, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
            >
              Voir la vente
            </a>
            <button type="button" onClick={repartir}
              style={{
                minHeight: CIBLE + 4, borderRadius: 14, border: "none", backgroundColor: VERT,
                color: "#FFFFFF", fontSize: 18, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
              }}>
              Nouvelle vente
            </button>
          </div>
        </Voile>
      )}
    </div>
  );
}

// ── Petites pièces ──────────────────────────────────────────────────────────

const boutonRond: React.CSSProperties = {
  width: CIBLE, height: CIBLE, flexShrink: 0, borderRadius: 14, border: BORDURE,
  backgroundColor: "#FFFFFF", color: MARINE, fontSize: 24, fontWeight: 700,
  fontFamily: "inherit", cursor: "pointer", lineHeight: 1,
};

const boutonSecondaire: React.CSSProperties = {
  minHeight: 48, padding: "0 16px", borderRadius: 12, border: BORDURE,
  backgroundColor: "#FFFFFF", color: MARINE, fontSize: 15, fontWeight: 600,
  fontFamily: "inherit", cursor: "pointer",
};

function Voile({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 60, backgroundColor: "rgba(27,43,94,0.45)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 520, maxHeight: "92dvh", overflowY: "auto",
          backgroundColor: "#FFFFFF", borderTopLeftRadius: 20, borderTopRightRadius: 20,
          padding: "20px 16px calc(20px + env(safe-area-inset-bottom))",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Vignette({ article }: { article: ArticleVendable }) {
  const url = urlPhotoArticle(article.photo_path);
  if (!url) {
    return (
      <span aria-hidden="true" style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 48, height: 48, flexShrink: 0, borderRadius: 12,
        backgroundColor: "#EDE8DF", color: SOUS, fontWeight: 700, fontSize: 18,
      }}>
        {article.nom.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    // Photo du bucket public de la boutique — servie telle quelle.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={48} height={48}
      style={{ width: 48, height: 48, flexShrink: 0, objectFit: "cover", borderRadius: 12, border: BORDURE }} />
  );
}

/** Clé d'idempotence du panier : un double clic ne crée pas deux ventes. */
function nouvelleCle(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
