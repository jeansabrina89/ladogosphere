import Link from "next/link";
import { exigerPersonnelPage } from "@/src/lib/exigerPersonnelPage";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { BoutonCheckin, BoutonCheckout } from "./BoutonsCheckin";
import { formatBoxLabel } from "@/src/lib/boxes";
import { aujourdhuiISO } from "@/src/lib/dates";
import { getProfilePerms } from "@/src/lib/getProfilePerms";

const SERIF = "Georgia, 'Times New Roman', serif";

const CATS = {
  attendu: { accent: "#C9A84C", pastel: "#F4EAC9", texte: "#6E5410" },
  present: { accent: "#4AAEA0", pastel: "#DCEFE9", texte: "#1F6B5E" },
  depart:  { accent: "#E8847A", pastel: "#FBE2DE", texte: "#A8453A" },
  parti:   { accent: "#9A8F7E", pastel: "#EDE8DF", texte: "#6B6253" },
};

function decalerJour(dateISO: string, delta: number): string {
  const [a, m, j] = dateISO.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await exigerPersonnelPage();
  const perms = await getProfilePerms();
  const supabase = supabaseAdmin;

  const params = await searchParams;
  const aujourdhui = aujourdhuiISO();
  const dateActive = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : aujourdhui;
  const estAujourdhui = dateActive === aujourdhui;
  const jourPrec = decalerJour(dateActive, -1);
  const jourSuiv = decalerJour(dateActive, 1);

  const { data: checkins } = await supabase
    .from("checkin_checkout")
    .select(`
      *,
      chiens (id, nom, race, poids, categorie_poids, sexe, sterilisation),
      reservations (
        date_debut,
        date_fin,
        type_reservation,
        boxes (numero, nom),
        clients (prenom, nom)
      )
    `)
    .gte("date_arrivee_prevue", `${dateActive}T00:00:00`)
    .lte("date_arrivee_prevue", `${dateActive}T23:59:59`)
    .order("date_arrivee_prevue");

  const { data: departs } = await supabase
    .from("checkin_checkout")
    .select(`
      *,
      chiens (id, nom, race, poids, categorie_poids, sexe, sterilisation),
      reservations (
        date_debut,
        date_fin,
        type_reservation,
        boxes (numero, nom),
        clients (prenom, nom)
      )
    `)
    .gte("date_depart_prevu", `${dateActive}T00:00:00`)
    .lte("date_depart_prevu", `${dateActive}T23:59:59`)
    .order("date_depart_prevu");

  const arrivesAttendus = checkins?.filter(c => c.statut === "attendu") ?? [];
  const presents = checkins?.filter(c => c.statut === "arrive") ?? [];
  const departsAttendus = departs?.filter(c => c.statut === "arrive") ?? [];
  const partis = departs?.filter(c => c.statut === "parti") ?? [];

  const totalPresents = presents.length;

  const dateLisible = new Date(`${dateActive}T12:00:00`).toLocaleDateString("fr-CH", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  return (
    <main className="min-h-screen p-6 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-7xl mx-auto">

        <h1 className="text-3xl md:text-4xl font-bold mb-4" style={{ fontFamily: SERIF, color: "#1B2B5E" }}>
          ✅ Check-in / Check-out
        </h1>

        <div className="flex items-center gap-3 flex-wrap mb-6">
          <Link href={`/checkin?date=${jourPrec}`} aria-label="Jour précédent"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 12, backgroundColor: "#fff", border: "1px solid rgba(27,43,94,.15)", color: "#1B2B5E", fontSize: 18, fontWeight: 700, textDecoration: "none" }}>
            ←
          </Link>
          <span style={{ fontFamily: SERIF, color: "#1B2B5E", fontSize: 18, fontWeight: "bold", textAlign: "center", minWidth: 210 }}>
            {dateLisible}
          </span>
          <Link href={`/checkin?date=${jourSuiv}`} aria-label="Jour suivant"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 12, backgroundColor: "#fff", border: "1px solid rgba(27,43,94,.15)", color: "#1B2B5E", fontSize: 18, fontWeight: 700, textDecoration: "none" }}>
            →
          </Link>
          {!estAujourdhui && (
            <Link href="/checkin"
              style={{ backgroundColor: "#2E8B7E", color: "#fff", padding: "9px 16px", borderRadius: 12, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
              Aujourd'hui
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <CarteStat valeur={arrivesAttendus.length} label="Arrivées attendues" cat={CATS.attendu} />
          <CarteStat valeur={presents.length} label="Arrivées effectuées" cat={CATS.present} />
          <CarteStat valeur={departsAttendus.length} label="Départs prévus" cat={CATS.depart} />
          <CarteStat valeur={partis.length} label="Départs effectués" cat={CATS.parti} />
        </div>

        <div className="rounded-xl px-6 py-3 mb-8 font-bold text-lg"
          style={{ backgroundColor: "#DCEFE9", border: "1px solid #9FD9CB", color: "#1B2B5E" }}>
          🐶 {totalPresents} chien(s) {estAujourdhui ? "actuellement présent(s) dans la pension" : "présent(s) ce jour-là"}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

          <Colonne titre="⏳ Arrivées attendues" compteur={arrivesAttendus.length} cat={CATS.attendu} vide="Aucune arrivée prévue">
            {arrivesAttendus.map(c => (
              <CarteCheckin key={c.id} checkin={c} accent={CATS.attendu.accent}
                action={perms.perm_checkin ? <BoutonCheckin checkin_id={c.id} /> : undefined} />
            ))}
          </Colonne>

          <Colonne titre="🟢 Présents" compteur={presents.length} cat={CATS.present} vide="Aucun chien présent">
            {presents.map(c => (
              <CarteCheckin key={c.id} checkin={c} accent={CATS.present.accent} />
            ))}
          </Colonne>

          <Colonne titre="🏁 Départs prévus" compteur={departsAttendus.length} cat={CATS.depart} vide="Aucun départ prévu">
            {departsAttendus.map(c => (
              <CarteCheckin key={c.id} checkin={c} accent={CATS.depart.accent}
                action={perms.perm_checkin ? <BoutonCheckout checkin_id={c.id} /> : undefined} />
            ))}
          </Colonne>

          <Colonne titre="✔️ Partis" compteur={partis.length} cat={CATS.parti} vide="Aucun départ effectué">
            {partis.map(c => (
              <CarteCheckin key={c.id} checkin={c} accent={CATS.parti.accent} />
            ))}
          </Colonne>

        </div>
      </div>
    </main>
  );
}

function CarteStat({ valeur, label, cat }: { valeur: number; label: string; cat: { pastel: string; texte: string } }) {
  return (
    <div className="rounded-xl p-4 text-center" style={{ backgroundColor: cat.pastel }}>
      <p className="text-3xl font-bold" style={{ color: cat.texte, lineHeight: 1 }}>{valeur}</p>
      <p style={{ color: cat.texte, opacity: 0.8, fontSize: "12px", marginTop: "5px" }}>{label}</p>
    </div>
  );
}

function Colonne({ titre, compteur, cat, vide, children }: { titre: string; compteur: number; cat: { texte: string; accent: string }; vide: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-bold text-lg mb-3" style={{ fontFamily: SERIF, color: "#1B2B5E" }}>
        {titre} <span style={{ color: cat.accent }}>({compteur})</span>
      </h2>
      <div className="space-y-3">
        {compteur === 0 && <p style={{ color: "#A39A89", fontSize: "13px" }}>{vide}</p>}
        {children}
      </div>
    </div>
  );
}

function CarteCheckin({ checkin, action, accent }: { checkin: any; action?: React.ReactNode; accent: string }) {
  const chien = checkin.chiens;
  const res = checkin.reservations;
  const sexeF = chien?.sexe === "F";

  const ster = (chien?.sterilisation ?? "").toString().trim().toLowerCase();
  let sterLabel: string, sterBg: string, sterColor: string;
  if (ster === "oui") {
    sterLabel = sexeF ? "Stérilisée" : "Castré";
    sterBg = "#ECEEE9"; sterColor = "#5A6B5A";
  } else if (ster === "chimique") {
    sterLabel = sexeF ? "Stérilisation chimique" : "Castration chimique";
    sterBg = "#F4EAC9"; sterColor = "#6E5410";
  } else {
    sterLabel = sexeF ? "Non stérilisée" : "Non castré";
    sterBg = "#FBE2DE"; sterColor = "#A8453A";
  }

  return (
    <div style={{ backgroundColor: "#fff", borderRadius: "14px", borderLeft: `4px solid ${accent}`, padding: "13px 15px", boxShadow: "0 1px 4px rgba(27,43,94,.06)" }}>
      <div className="flex justify-between items-start mb-1">
        <div>
          <p className="font-bold" style={{ color: sexeF ? "#D9706A" : "#1B2B5E", margin: 0 }}>
            {chien?.nom || "—"}
          </p>
          <p style={{ fontSize: "13px", color: "#8A8275", margin: "1px 0 0" }}>{chien?.race || "—"}</p>
          <p style={{ fontSize: "12px", color: "#A39A89", margin: "2px 0 5px" }}>
            {chien?.poids ? `${chien.poids} kg` : "—"} ·{" "}
            {chien?.categorie_poids === "moins_15kg" ? "🟢" :
             chien?.categorie_poids === "15_30kg" ? "🟡" :
             chien?.categorie_poids === "30_40kg" ? "🔴" : "—"}
          </p>
          <span style={{ display: "inline-block", backgroundColor: sterBg, color: sterColor, fontSize: "11px", fontWeight: 600, padding: "2px 9px", borderRadius: "20px" }}>
            {sterLabel}
          </span>
        </div>
        <div className="text-right" style={{ fontSize: "12px", color: "#8A8275" }}>
          <p style={{ margin: 0 }}>{formatBoxLabel(res?.boxes)}</p>
          <p style={{ margin: "1px 0 0" }}>{res?.clients?.prenom} {res?.clients?.nom}</p>
        </div>
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
