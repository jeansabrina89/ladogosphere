type Ton = "or-doux" | "marine-doux" | "teal-doux" | "rose-doux" | "bleu-doux" | "neutre";

const STYLES: Record<Ton, { bg: string; texte: string }> = {
  "or-doux":     { bg: "#F4EAC9", texte: "#6E5410" },
  "marine-doux": { bg: "#E4E7F1", texte: "#2A3B6B" },
  "teal-doux":   { bg: "#DBEFEA", texte: "#1F6E5B" },
  "rose-doux":   { bg: "#FBE2DE", texte: "#A8453A" },
  "bleu-doux":   { bg: "#E0F2FE", texte: "#0369A1" },
  "neutre":      { bg: "#EDE8DF", texte: "rgba(27,43,94,0.6)" },
};

const TABLE: Record<string, { libelle: string; ton: Ton }> = {
  // Réservations
  validee:          { libelle: "Validée",          ton: "or-doux" },
  en_attente:       { libelle: "En attente",        ton: "marine-doux" },
  annulee:          { libelle: "Annulée",           ton: "neutre" },
  terminee:         { libelle: "Terminée",          ton: "neutre" },
  refusee:          { libelle: "Refusée",           ton: "neutre" },
  // Paiement
  paye:             { libelle: "Payé",              ton: "or-doux" },
  payee:            { libelle: "Payée",             ton: "or-doux" },
  partiel:          { libelle: "Partiel",           ton: "marine-doux" },
  impaye:           { libelle: "Impayé",            ton: "rose-doux" },
  // Factures
  acquittee:        { libelle: "Réglée",            ton: "or-doux" },
  // Vacances / demandes RH
  acceptee:         { libelle: "Acceptée",          ton: "or-doux" },
  // Checkin
  attendu:          { libelle: "Attendu",           ton: "marine-doux" },
  arrive:           { libelle: "Présent",           ton: "teal-doux" },
  a_recuperer:      { libelle: "À récupérer",       ton: "marine-doux" },
  parti:            { libelle: "Parti",             ton: "neutre" },
  // Planning RH
  travail:          { libelle: "Travail",           ton: "teal-doux" },
  cours:            { libelle: "Cours",             ton: "bleu-doux" },
  repos:            { libelle: "Repos",             ton: "neutre" },
  repos_vacances:   { libelle: "Repos vacances",    ton: "marine-doux" },
  vacances:         { libelle: "Vacances",          ton: "marine-doux" },
  maladie:          { libelle: "Maladie",           ton: "rose-doux" },
  ferie_travaille:  { libelle: "Férié travaillé",   ton: "or-doux" },
  heures_sup:       { libelle: "H. sup.",           ton: "or-doux" },
  absent:           { libelle: "Absent",            ton: "rose-doux" },
};

export default function BadgeStatut({ statut }: { statut: string }) {
  const info = TABLE[statut] ?? { libelle: statut, ton: "neutre" as Ton };
  const couleurs = STYLES[info.ton];

  return (
    <span
      style={{
        display: "inline-block",
        backgroundColor: couleurs.bg,
        color: couleurs.texte,
        borderRadius: "999px",
        padding: "2px 10px",
        fontSize: "13px",
        fontWeight: 500,
        lineHeight: "20px",
        whiteSpace: "nowrap",
      }}
    >
      {info.libelle}
    </span>
  );
}
