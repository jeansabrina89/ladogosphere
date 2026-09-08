"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Encaisser from "../Encaisser";
import { emettreFactureAction, renvoyerFactureAction, annulerBrouillon } from "../actions";
import { creerAvoir } from "../actionsCreation";

const MARINE = "#1B2B5E";

type LigneAvoir = { id: string; libelle: string; quantite: number; prix_unitaire: number };

export default function ActionsFacture({
  factureId, numero, type, estClose, reste, peutEncaisser, aUnPdf, aUnEmail, nbLignes, lignes,
}: {
  factureId: string;
  numero: string | null;
  type: string;
  estClose: boolean;
  reste: number;
  peutEncaisser: boolean;
  aUnPdf: boolean;
  aUnEmail: boolean;
  nbLignes: number;
  lignes: LigneAvoir[];
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [avoirOuvert, setAvoirOuvert] = useState(false);

  const estBrouillon = !numero;
  const estAvoir = type === "avoir";

  async function lancer(cle: string, action: () => Promise<{ error?: string } | void>) {
    setEnCours(cle);
    setMessage(null);
    const res = await action();
    setEnCours(null);
    if (res && "error" in res && res.error) {
      setMessage({ texte: res.error, erreur: true });
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="bg-white rounded-2xl p-4 border space-y-2" style={{ borderColor: "rgba(27,43,94,0.12)" }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "rgba(27,43,94,0.5)" }}>
        Actions
      </p>

      {message && (
        <p className="text-sm px-3 py-2 rounded-lg"
           style={message.erreur
             ? { backgroundColor: "#FBE2DE", color: "#A8453A" }
             : { backgroundColor: "#DBEFEA", color: "#1F6E5B" }}>
          {message.texte}
        </p>
      )}

      {estBrouillon ? (
        <>
          <BoutonAction
            libelle={enCours === "emettre" ? "Émission…" : "Émettre la facture"}
            couleur="#1B2B5E"
            disabled={nbLignes === 0 || enCours !== null}
            onClick={() => lancer("emettre", async () => {
              const r = await emettreFactureAction(factureId);
              if (!r.error) setMessage({ texte: `Facture ${r.numero} émise.`, erreur: false });
              return r;
            })}
          />
          {nbLignes === 0 && (
            <p className="text-xs" style={{ color: "rgba(27,43,94,0.5)" }}>
              Ajoutez au moins une ligne avant d&apos;émettre.
            </p>
          )}
          <BoutonAction
            libelle="Annuler le brouillon"
            couleur="#EDE8DF"
            texteFonce
            disabled={enCours !== null}
            onClick={async () => {
              if (!confirm("Supprimer définitivement ce brouillon ?")) return;
              const ok = await lancer("annuler", () => annulerBrouillon(factureId));
              if (ok) router.push("/factures");
            }}
          />
        </>
      ) : (
        <>
          {peutEncaisser && !estClose && !estAvoir && reste > 0 && (
            <Encaisser
              factureId={factureId}
              resteDu={reste}
              libellePiece={`Facture ${numero}`}
            />
          )}

          {aUnPdf && (
            <a
              href={`/api/factures/${factureId}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-2.5 rounded-xl font-semibold text-white"
              style={{ backgroundColor: "#4A7DAE" }}
            >
              Télécharger le PDF
            </a>
          )}

          {peutEncaisser && aUnEmail && (
            <BoutonAction
              libelle={enCours === "renvoyer" ? "Envoi…" : "Renvoyer par e-mail"}
              couleur="#C9A84C"
              disabled={enCours !== null}
              onClick={() => lancer("renvoyer", async () => {
                const r = await renvoyerFactureAction(factureId);
                if (!r.error) setMessage({ texte: "E-mail envoyé.", erreur: false });
                return r;
              })}
            />
          )}

          {peutEncaisser && !estAvoir && !estClose && (
            <BoutonAction
              libelle="Créer un avoir"
              couleur="#E8847A"
              disabled={enCours !== null || lignes.length === 0}
              onClick={() => setAvoirOuvert(true)}
            />
          )}

          {!estAvoir && (
            <p className="text-xs pt-1" style={{ color: "rgba(27,43,94,0.45)" }}>
              Une facture émise ne s&apos;annule pas : elle se corrige par un avoir.
            </p>
          )}
        </>
      )}

      {avoirOuvert && (
        <DialogueAvoir
          factureId={factureId}
          lignes={lignes}
          onFermer={() => setAvoirOuvert(false)}
          onFait={(numeroAvoir) => {
            setAvoirOuvert(false);
            setMessage({ texte: `Avoir ${numeroAvoir} créé.`, erreur: false });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function BoutonAction({
  libelle, couleur, onClick, disabled, texteFonce,
}: {
  libelle: string; couleur: string; onClick: () => void; disabled?: boolean; texteFonce?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-2.5 rounded-xl font-semibold disabled:opacity-50"
      style={{ backgroundColor: couleur, color: texteFonce ? MARINE : "white" }}
    >
      {libelle}
    </button>
  );
}

function DialogueAvoir({
  factureId, lignes, onFermer, onFait,
}: {
  factureId: string;
  lignes: LigneAvoir[];
  onFermer: () => void;
  onFait: (numero: string) => void;
}) {
  const [quantites, setQuantites] = useState<Record<string, number>>(
    Object.fromEntries(lignes.map((l) => [l.id, l.quantite])),
  );
  const [choisies, setChoisies] = useState<Record<string, boolean>>(
    Object.fromEntries(lignes.map((l) => [l.id, true])),
  );
  const [motif, setMotif] = useState("");
  const [destination, setDestination] = useState<"credit" | "rembourser">("credit");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const total = lignes.reduce(
    (s, l) => s + (choisies[l.id] ? (quantites[l.id] ?? 0) * l.prix_unitaire : 0), 0);

  async function valider() {
    if (!motif.trim()) { setErreur("Le motif est obligatoire."); return; }
    const retenues = lignes
      .filter((l) => choisies[l.id] && (quantites[l.id] ?? 0) > 0)
      .map((l) => ({ ligne_id: l.id, quantite: quantites[l.id] }));
    if (retenues.length === 0) { setErreur("Sélectionnez au moins une ligne."); return; }

    setEnCours(true);
    setErreur(null);
    const fd = new FormData();
    fd.set("facture_id", factureId);
    fd.set("motif", motif.trim());
    fd.set("destination", destination);
    fd.set("lignes", JSON.stringify(retenues));
    const res = await creerAvoir(fd);
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    onFait(res.numero ?? "");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-1" style={{ color: MARINE }}>Créer un avoir</h2>
        <p className="text-sm mb-4" style={{ color: "rgba(27,43,94,0.6)" }}>
          Total ou partiel : décochez ou ajustez les quantités.
        </p>

        <div className="mb-4 space-y-2">
          {lignes.map((l) => (
            <div key={l.id} className="flex items-center gap-3 p-2 rounded-lg" style={{ backgroundColor: "#F5F0E8" }}>
              <input
                type="checkbox"
                checked={!!choisies[l.id]}
                onChange={(e) => setChoisies({ ...choisies, [l.id]: e.target.checked })}
              />
              <span className="flex-1 text-sm" style={{ color: MARINE }}>{l.libelle}</span>
              <input
                type="number"
                min={0}
                max={l.quantite}
                step="0.01"
                value={quantites[l.id] ?? 0}
                onChange={(e) => setQuantites({ ...quantites, [l.id]: parseFloat(e.target.value) || 0 })}
                disabled={!choisies[l.id]}
                className="w-16 border rounded-lg p-1 text-sm text-right"
              />
              <span className="text-sm w-24 text-right" style={{ color: MARINE }}>
                {((choisies[l.id] ? (quantites[l.id] ?? 0) : 0) * l.prix_unitaire).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        <p className="text-right font-bold mb-4" style={{ color: MARINE }}>
          Montant de l&apos;avoir : {total.toFixed(2)} CHF
        </p>

        <label className="block text-sm font-semibold mb-1" style={{ color: MARINE }}>
          Motif <span style={{ color: "#A8453A" }}>*</span>
        </label>
        <textarea
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          rows={2}
          placeholder="Séjour écourté, erreur de facturation…"
          className="w-full border rounded-xl p-2.5 text-sm mb-4"
        />

        <label className="block text-sm font-semibold mb-1" style={{ color: MARINE }}>Destination</label>
        <div className="flex gap-2 mb-4">
          {([["credit", "Porter au crédit du client"], ["rembourser", "Rembourser"]] as const).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setDestination(v)}
              className="flex-1 px-3 py-2 rounded-xl text-sm font-semibold border"
              style={{
                backgroundColor: destination === v ? MARINE : "white",
                color: destination === v ? "white" : MARINE,
                borderColor: destination === v ? MARINE : "rgba(27,43,94,0.2)",
              }}
            >
              {l}
            </button>
          ))}
        </div>

        {erreur && (
          <p className="text-sm mb-3 px-3 py-2 rounded-lg"
             style={{ backgroundColor: "#FBE2DE", color: "#A8453A" }}>{erreur}</p>
        )}

        <div className="flex gap-3">
          <button onClick={valider} disabled={enCours}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: "#E8847A" }}>
            {enCours ? "…" : "Créer l'avoir"}
          </button>
          <button onClick={onFermer} className="px-4 py-2.5 rounded-xl font-semibold"
                  style={{ backgroundColor: "#EDE8DF", color: MARINE }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
