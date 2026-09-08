"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enregistrerRegimeTva } from "./actions";
import { GARDE_FOU_TAUX_TDFN, TDFN_MAXIMUM, TDFN_MINIMUM } from "@/src/lib/tvaLogique";
import {
  BASES_DECOMPTE,
  METHODES,
  PERIODICITES,
  periodiciteInhabituelle,
  periodiciteProposee,
  type BaseDecompte,
  type MethodeTva,
  type Periodicite,
} from "@/src/lib/decompteTvaLogique";

const MARINE = "#1B2B5E";
const SOUS = "rgba(27,43,94,0.58)";
const VERT = "#1F6E5B";
const GRENAT = "#8A1F1F";
const BORDURE = "1px solid rgba(27,43,94,0.14)";
const CIBLE = 44;

const champ: React.CSSProperties = {
  width: "100%", minHeight: CIBLE, padding: "10px 12px", border: BORDURE,
  borderRadius: 12, fontSize: 16, color: MARINE, backgroundColor: "#FFFFFF",
  fontFamily: "inherit", boxSizing: "border-box",
};

const etiquette: React.CSSProperties = {
  display: "block", fontSize: 14, fontWeight: 600, color: MARINE, marginBottom: 6,
};

const aide: React.CSSProperties = { color: SOUS, fontSize: 13.5, margin: "6px 0 0" };

export type RegimeInitial = {
  assujettie: boolean;
  dateAssujettissement: string;
  numero: string;
  methode: MethodeTva;
  periodicite: Periodicite;
  baseDecompte: BaseDecompte;
  tauxTdfn1: string;
  libelleSecteur1: string;
  tauxTdfn2: string;
  libelleSecteur2: string;
};

/**
 * Le régime de TVA.
 *
 * Les taux de dette fiscale nette ne sont ni proposés, ni pré-remplis, ni
 * suggérés par un exemple : l'AFC les attribue entreprise par entreprise, et
 * un exemple finit toujours par être pris pour la vraie valeur. Le champ reste
 * vide, et l'aide dit où trouver le chiffre.
 */
export default function FormulaireTva({ initial }: { initial: RegimeInitial }) {
  const router = useRouter();
  const [assujettie, setAssujettie] = useState(initial.assujettie);
  const [methode, setMethode] = useState<MethodeTva>(initial.methode);
  const [periodicite, setPeriodicite] = useState<Periodicite>(initial.periodicite);
  const [base, setBase] = useState<BaseDecompte>(initial.baseDecompte);
  const [taux2, setTaux2] = useState(initial.tauxTdfn2);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const avisPeriodicite = periodiciteInhabituelle({ methode, periodicite });

  /** Changer de méthode PROPOSE sa périodicité habituelle, sans l'imposer. */
  function choisirMethode(m: MethodeTva) {
    setMethode(m);
    setPeriodicite(periodiciteProposee(m));
  }

  async function envoyer(formData: FormData) {
    setEnCours(true);
    setErreur(null);
    setMessage(null);
    const res = await enregistrerRegimeTva(formData);
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    setMessage(res.message ?? null);
    router.refresh();
  }

  return (
    <form action={envoyer} style={{ display: "grid", gap: 20 }}>
      {erreur && (
        <p role="alert" style={{
          backgroundColor: "#FDECEC", color: GRENAT, border: "1px solid #F0C2C2",
          borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 600, margin: 0,
        }}>
          {erreur}
        </p>
      )}
      {message && (
        <p role="status" style={{
          backgroundColor: "#E4F1EC", color: VERT, border: "1px solid #B9DDD1",
          borderRadius: 12, padding: "10px 12px", fontSize: 15, fontWeight: 600, margin: 0,
        }}>
          ✅ {message}
        </p>
      )}

      {/* ── Assujettissement ── */}
      <section style={{ display: "grid", gap: 12 }}>
        <div>
          <span style={etiquette}>Assujettie à la TVA</span>
          <input type="hidden" name="assujettie" value={assujettie ? "true" : "false"} />
          <div style={{ display: "flex", gap: 8 }}>
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                aria-pressed={assujettie === v}
                onClick={() => setAssujettie(v)}
                style={{
                  minHeight: CIBLE, padding: "0 18px", borderRadius: 12,
                  border: assujettie === v ? `2px solid ${VERT}` : BORDURE,
                  backgroundColor: assujettie === v ? "#F1F8F6" : "#FFFFFF",
                  color: MARINE, fontSize: 15, fontWeight: assujettie === v ? 700 : 500,
                  fontFamily: "inherit", cursor: "pointer",
                }}
              >
                {assujettie === v ? "✓ " : ""}{v ? "Oui" : "Non"}
              </button>
            ))}
          </div>
          {!assujettie && (
            <p style={aide}>
              Tant que ce réglage est sur « Non », aucune facture, aucun ticket et
              aucun avoir ne mentionne de TVA — ni numéro, ni ventilation. C&apos;est
              voulu : laisser croire à une TVA qu&apos;on ne verse pas serait une faute.
            </p>
          )}
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div>
            <label htmlFor="date_assujettissement" style={etiquette}>Date d&apos;assujettissement</label>
            <input id="date_assujettissement" name="date_assujettissement" type="date"
              defaultValue={initial.dateAssujettissement} style={champ} />
            <p style={aide}>Aucune pièce antérieure ne portera de TVA.</p>
          </div>
          <div>
            <label htmlFor="numero_tva" style={etiquette}>Numéro de TVA</label>
            <input id="numero_tva" name="numero_tva" type="text"
              defaultValue={initial.numero} placeholder="CHE-123.456.789 TVA"
              autoComplete="off" style={champ} />
            <p style={aide}>Les neuf chiffres suffisent : la mise en forme se fait toute seule.</p>
          </div>
        </div>
      </section>

      {/* ── Méthode ── */}
      <section style={{ display: "grid", gap: 10 }}>
        <span style={etiquette}>Méthode de décompte</span>
        <input type="hidden" name="methode" value={methode} />
        {METHODES.map((m) => (
          <button
            key={m.valeur}
            type="button"
            aria-pressed={methode === m.valeur}
            onClick={() => choisirMethode(m.valeur)}
            style={{
              width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 14,
              border: methode === m.valeur ? `2px solid ${VERT}` : BORDURE,
              backgroundColor: methode === m.valeur ? "#F1F8F6" : "#FFFFFF",
              fontFamily: "inherit", cursor: "pointer",
            }}
          >
            <span style={{ display: "block", color: MARINE, fontSize: 16, fontWeight: methode === m.valeur ? 700 : 600 }}>
              {methode === m.valeur ? "✓ " : ""}{m.libelle}
            </span>
            <span style={{ display: "block", color: SOUS, fontSize: 14, marginTop: 2 }}>{m.aide}</span>
          </button>
        ))}

        <div>
          <label htmlFor="periodicite" style={etiquette}>Périodicité</label>
          <select id="periodicite" name="periodicite" value={periodicite}
            onChange={(e) => setPeriodicite(e.target.value as Periodicite)} style={champ}>
            {PERIODICITES.map((p) => (
              <option key={p.valeur} value={p.valeur}>{p.libelle}</option>
            ))}
          </select>
          {avisPeriodicite && (
            <p role="status" style={{ ...aide, color: "#6E5410", fontWeight: 600 }}>
              ℹ️ {avisPeriodicite}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="base_decompte" style={etiquette}>La TVA est due</label>
          <select id="base_decompte" name="base_decompte" value={base}
            onChange={(e) => setBase(e.target.value as BaseDecompte)} style={champ}>
            {BASES_DECOMPTE.map((b) => (
              <option key={b.valeur} value={b.valeur}>{b.libelle}</option>
            ))}
          </select>
          <p style={aide}>
            {BASES_DECOMPTE.find((b) => b.valeur === base)?.aide}
          </p>
        </div>
      </section>

      {/* ── Taux de dette fiscale nette ── */}
      {methode === "tdfn" && (
        <section style={{ display: "grid", gap: 12 }}>
          <div>
            <h3 style={{ color: MARINE, fontSize: 17, fontWeight: 700, margin: 0 }}>
              Taux de dette fiscale nette
            </h3>
            <p style={aide}>
              <strong>{GARDE_FOU_TAUX_TDFN}</strong>{" "}
              Ces taux ne se devinent pas et ne se calculent pas : l&apos;AFC les attribue
              à votre entreprise, secteur par secteur, dans sa décision d&apos;autorisation.
              Recopiez-les tels quels. Tant qu&apos;un taux est vide, l&apos;écran de décompte
              refuse de calculer et vous dit lequel manque.
            </p>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <div>
              <label htmlFor="libelle_secteur_1" style={etiquette}>Secteur 1 — nom</label>
              <input id="libelle_secteur_1" name="libelle_secteur_1" type="text"
                defaultValue={initial.libelleSecteur1}
                placeholder="Tel qu'il figure sur la décision de l'AFC" style={champ} />
            </div>
            <div>
              <label htmlFor="taux_tdfn_1" style={etiquette}>Secteur 1 — taux (%)</label>
              <input id="taux_tdfn_1" name="taux_tdfn_1" type="number" step="0.1"
                defaultValue={initial.tauxTdfn1} inputMode="decimal" style={champ} />
              <p style={aide}>
                {GARDE_FOU_TAUX_TDFN} Entre {String(TDFN_MINIMUM).replace(".", ",")} %
                {" "}et {String(TDFN_MAXIMUM).replace(".", ",")} %.
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <div>
              <label htmlFor="libelle_secteur_2" style={etiquette}>
                Secteur 2 — nom <span style={{ fontWeight: 400, color: SOUS }}>(si accordé)</span>
              </label>
              <input id="libelle_secteur_2" name="libelle_secteur_2" type="text"
                defaultValue={initial.libelleSecteur2}
                placeholder="Laissez vide tant que l'AFC n'en a pas accordé" style={champ} />
            </div>
            <div>
              <label htmlFor="taux_tdfn_2" style={etiquette}>Secteur 2 — taux (%)</label>
              <input id="taux_tdfn_2" name="taux_tdfn_2" type="number" step="0.1"
                value={taux2} onChange={(e) => setTaux2(e.target.value)}
                inputMode="decimal" style={champ} />
              <p style={aide}>
                {GARDE_FOU_TAUX_TDFN} Entre {String(TDFN_MINIMUM).replace(".", ",")} %
                {" "}et {String(TDFN_MAXIMUM).replace(".", ",")} %.
              </p>
            </div>
          </div>

          <p style={aide}>
            Sans second taux, tout le chiffre d&apos;affaires est décompté au taux du
            secteur 1 — c&apos;est ce que demande l&apos;AFC tant qu&apos;elle n&apos;en a pas accordé
            d&apos;autre. Le tableau de bord comptable vous préviendra si une activité
            secondaire dépasse 10 % du chiffre d&apos;affaires.
          </p>
        </section>
      )}

      {/* ── Date d'effet ── */}
      <section>
        <label htmlFor="date_debut" style={etiquette}>Ce réglage s&apos;applique à partir du</label>
        <input id="date_debut" name="date_debut" type="date"
          defaultValue={new Date().toISOString().slice(0, 10)} style={{ ...champ, maxWidth: 240 }} />
        <p style={aide}>
          Le régime s&apos;historise : les pièces antérieures gardent le régime de leur
          époque, et un décompte passé se relit avec les taux de son temps.
        </p>
      </section>

      <button type="submit" disabled={enCours} style={{
        minHeight: CIBLE + 8, borderRadius: 14, border: "none",
        backgroundColor: enCours ? "#B9CFC9" : VERT, color: "#FFFFFF",
        fontSize: 16, fontWeight: 700, fontFamily: "inherit",
        cursor: enCours ? "not-allowed" : "pointer", justifySelf: "start", padding: "0 24px",
      }}>
        {enCours ? "Enregistrement…" : "Enregistrer le régime"}
      </button>
    </form>
  );
}
