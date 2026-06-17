import type { CSSProperties } from "react";
import { createSupabaseServerClient } from "@/src/lib/supabase-server";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { redirect } from "next/navigation";

const MARINE = "#1B2B5E";

const sCarte: CSSProperties = {
  backgroundColor: "#fff",
  border: "1px solid rgba(27,43,94,0.12)",
  borderRadius: 18,
  padding: 22,
  marginBottom: 16,
};

const sSecTitre: CSSProperties = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: 19,
  fontWeight: 700,
  color: MARINE,
  margin: "0 0 4px",
};

const sSecSous: CSSProperties = {
  margin: "0 0 16px",
  fontSize: 13,
  color: "rgba(27,43,94,0.5)",
};

function getPrix(
  tarifs: { categorie: string; membre: boolean; prix: string }[],
  categorie: string,
  membre: boolean
): string {
  const t = tarifs.find((r) => r.categorie === categorie && r.membre === membre);
  if (!t) return "—";
  const n = parseFloat(t.prix);
  return isNaN(n) ? "—" : `CHF ${n.toFixed(2)}`;
}

function LigneGrille({
  label,
  nm,
  mb,
  estMembre,
}: {
  label: string;
  nm: string;
  mb: string;
  estMembre: boolean;
}) {
  const highlightNm: CSSProperties = !estMembre
    ? { fontWeight: 700, color: MARINE }
    : { color: "rgba(27,43,94,0.6)" };
  const highlightMb: CSSProperties = estMembre
    ? { fontWeight: 700, color: "#1F6E5B" }
    : { color: "rgba(27,43,94,0.6)" };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 8,
        padding: "10px 0",
        borderBottom: "1px solid rgba(27,43,94,0.07)",
        alignItems: "center",
      }}
    >
      <span style={{ fontSize: 14, color: MARINE }}>{label}</span>
      <span style={{ fontSize: 14, textAlign: "right", ...highlightNm }}>{nm}</span>
      <span style={{ fontSize: 14, textAlign: "right", ...highlightMb }}>{mb}</span>
    </div>
  );
}

function EnTeteGrille() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 8,
        padding: "0 0 8px",
        borderBottom: "2px solid rgba(27,43,94,0.12)",
        marginBottom: 2,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(27,43,94,0.4)", textTransform: "uppercase", letterSpacing: "0.5px" }}></span>
      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(27,43,94,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Non-membre</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#1F6E5B", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Membre ★</span>
    </div>
  );
}

export default async function TarifsClientPage() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) redirect("/login");

  const annee = new Date().getFullYear();

  const { data: tarifsRows } = await supabaseAdmin
    .from("tarifs")
    .select("categorie, membre, prix")
    .eq("annee", annee)
    .eq("actif", true);

  const { data: parametres } = await supabaseAdmin
    .from("parametres")
    .select("cle, valeur")
    .in("cle", ["cotisation_montant"]);

  const tarifs = tarifsRows ?? [];
  const cotisation = parseFloat(
    parametres?.find((p) => p.cle === "cotisation_montant")?.valeur ?? "0"
  );

  // Statut membre du client connecté
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const estMembre = client
    ? !!(await supabaseAdmin
        .from("cotisations_membres")
        .select("id")
        .eq("client_id", client.id)
        .eq("annee", annee)
        .eq("statut", "payee")
        .limit(1)
        .then(({ data }) => data && data.length > 0))
    : false;

  const tarifsVides = tarifs.length === 0;

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#F5F0E8", padding: "32px 16px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>

        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 26, fontWeight: 700, color: MARINE, margin: "0 0 4px" }}>
            🏷️ Tarifs {annee}
          </h1>
          <p style={{ margin: 0, color: "rgba(27,43,94,0.6)", fontSize: 14 }}>
            Tarifs indicatifs — le montant définitif est confirmé par notre équipe lors de la validation de ta demande.
          </p>
        </div>

        {estMembre && (
          <div style={{ backgroundColor: "#DBEFEA", border: "1px solid #4AAEA0", borderRadius: 14, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>★</span>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#1F6E5B" }}>
              Tu es membre — les tarifs membres s'appliquent à tes réservations.
            </p>
          </div>
        )}

        {tarifsVides ? (
          <div style={sCarte}>
            <p style={{ color: "rgba(27,43,94,0.5)", fontSize: 14, margin: 0 }}>
              Les tarifs {annee} ne sont pas encore publiés. Contacte-nous pour plus d'informations.
            </p>
          </div>
        ) : (
          <>
            {/* GARDERIE */}
            <div style={sCarte}>
              <p style={sSecTitre}>☀️ Garderie (journée)</p>
              <p style={sSecSous}>Tarif par chien, pour une journée.</p>
              <EnTeteGrille />
              <LigneGrille label="1 chien" nm={getPrix(tarifs, "journee_partage_1", false)} mb={getPrix(tarifs, "journee_partage_1", true)} estMembre={estMembre} />
              <LigneGrille label="2 chiens" nm={getPrix(tarifs, "journee_partage_2", false)} mb={getPrix(tarifs, "journee_partage_2", true)} estMembre={estMembre} />
              <LigneGrille label="3 chiens ou +" nm={getPrix(tarifs, "journee_partage_3", false)} mb={getPrix(tarifs, "journee_partage_3", true)} estMembre={estMembre} />
            </div>

            {/* PENSION */}
            <div style={sCarte}>
              <p style={sSecTitre}>🏠 Pension (par nuit)</p>
              <p style={sSecSous}>Tarif par chien et par nuit.</p>
              <EnTeteGrille />
              <LigneGrille label="1 chien" nm={getPrix(tarifs, "sejour_partage_1", false)} mb={getPrix(tarifs, "sejour_partage_1", true)} estMembre={estMembre} />
              <LigneGrille label="2 chiens" nm={getPrix(tarifs, "sejour_partage_2", false)} mb={getPrix(tarifs, "sejour_partage_2", true)} estMembre={estMembre} />
              <LigneGrille label="3 chiens ou +" nm={getPrix(tarifs, "sejour_partage_3", false)} mb={getPrix(tarifs, "sejour_partage_3", true)} estMembre={estMembre} />
            </div>

            {/* JOURNÉE D'ESSAI */}
            <div style={sCarte}>
              <p style={sSecTitre}>🧪 Journée d'essai</p>
              <p style={sSecSous}>Obligatoire pour tout nouveau chien avant la première réservation.</p>
              <div style={{ backgroundColor: "#F5F0E8", borderRadius: 12, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14, color: MARINE }}>Tarif journée (1 chien)</span>
                <span style={{ fontSize: 17, fontWeight: 700, color: MARINE }}>
                  {getPrix(tarifs, "journee_partage_1", true)}
                </span>
              </div>
            </div>

            {/* PRIVATIF */}
            {(getPrix(tarifs, "journee_privatif", false) !== "—" || getPrix(tarifs, "sejour_privatif", false) !== "—") && (
              <div style={sCarte}>
                <p style={sSecTitre}>🚪 Hébergement privatif</p>
                <p style={sSecSous}>Box réservé exclusivement à ton chien (sur demande).</p>
                <EnTeteGrille />
                {getPrix(tarifs, "journee_privatif", false) !== "—" && (
                  <LigneGrille label="Garderie privatif" nm={getPrix(tarifs, "journee_privatif", false)} mb={getPrix(tarifs, "journee_privatif", true)} estMembre={estMembre} />
                )}
                {getPrix(tarifs, "sejour_privatif", false) !== "—" && (
                  <LigneGrille label="Pension privatif / nuit" nm={getPrix(tarifs, "sejour_privatif", false)} mb={getPrix(tarifs, "sejour_privatif", true)} estMembre={estMembre} />
                )}
              </div>
            )}
          </>
        )}

        {/* ADHÉSION MEMBRE */}
        {cotisation > 0 && (
          <div style={{ ...sCarte, backgroundColor: "#F4EAC9", border: "1px solid rgba(201,168,76,0.3)" }}>
            <p style={{ ...sSecTitre, margin: "0 0 6px" }}>★ Adhésion membre</p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ margin: 0, fontSize: 14, color: "rgba(27,43,94,0.7)", maxWidth: 380 }}>
                L'adhésion annuelle donne accès aux tarifs membres sur toutes les formules.
              </p>
              <span style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 20, fontWeight: 700, color: "#6E5410", whiteSpace: "nowrap", marginLeft: 12 }}>
                CHF {cotisation.toFixed(2)} / an
              </span>
            </div>
          </div>
        )}

        <p style={{ fontSize: 12, color: "rgba(27,43,94,0.4)", textAlign: "center", marginTop: 8 }}>
          Tarifs en CHF TTC · Année {annee}
        </p>

      </div>
    </main>
  );
}
