import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { aujourdhuiISO, formatDateFR } from "@/src/lib/dates";
import { calculerDecompteHeures } from "@/src/lib/decompteHeures";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import { Tuile, Raccourci, GrilleTuiles } from "@/app/components/ui/TuileChiffre";

export const dynamic = "force-dynamic";

const MARINE = "#1B2B5E";

/** Les statuts de planning qui veulent dire « elle est là aujourd'hui ». */
const STATUTS_PRESENTS = ["travail", "ferie_travaille"];

const heures = (n: number) => `${n.toFixed(1).replace(".", ",")} h`;

/**
 * Accueil de l'espace Équipe. Le décompte des heures réutilise
 * `calculerDecompteHeures` — celui des fiches individuelles, pas un second
 * calcul écrit à côté qui finirait par dire autre chose.
 */
export default async function EquipePage() {
  await exigerAdminPage();

  const jour = aujourdhuiISO();
  const debutMois = `${jour.slice(0, 7)}-01`;

  const [
    { data: employes },
    { data: planningDuJour },
    { count: congesEnAttente },
    { data: planningMois },
    { data: timbragesMois },
  ] = await Promise.all([
    supabaseAdmin.from("employes_rh").select("id, prenom, nom").eq("actif", true).order("prenom"),
    supabaseAdmin.from("planning_employes").select("employe_id, statut").eq("date", jour),
    supabaseAdmin.from("demandes_vacances").select("id", { count: "exact", head: true })
      .eq("statut", "en_attente"),
    supabaseAdmin.from("planning_employes").select("employe_id, date, statut")
      .gte("date", debutMois).lte("date", jour),
    supabaseAdmin.from("timbrage")
      .select("employe_id, date, type_absence, heure_debut_matin, heure_fin_matin, heure_debut_aprem, heure_fin_aprem, valide_admin")
      .gte("date", debutMois).lte("date", jour),
  ]);

  const actifs = (employes ?? []) as { id: string; prenom: string; nom: string }[];
  const nomsPresents = (planningDuJour ?? [])
    .filter((p) => STATUTS_PRESENTS.includes(p.statut as string))
    .map((p) => actifs.find((e) => e.id === p.employe_id)?.prenom)
    .filter((n): n is string => !!n)
    .sort((a, b) => a.localeCompare(b, "fr"));

  // Le mois en cours, employée par employée, puis additionné : la même
  // fonction que la fiche individuelle, appliquée à toute l'équipe.
  let faites = 0;
  let dues = 0;
  for (const e of actifs) {
    const d = calculerDecompteHeures({
      planning: (planningMois ?? [])
        .filter((p) => p.employe_id === e.id)
        .map((p) => ({ date: p.date as string, statut: p.statut as string })),
      timbrages: (timbragesMois ?? [])
        .filter((t) => t.employe_id === e.id)
        .map((t) => ({
          date: t.date as string,
          type_absence: (t.type_absence as string) ?? null,
          heure_debut_matin: (t.heure_debut_matin as string) ?? null,
          heure_fin_matin: (t.heure_fin_matin as string) ?? null,
          heure_debut_aprem: (t.heure_debut_aprem as string) ?? null,
          heure_fin_aprem: (t.heure_fin_aprem as string) ?? null,
          valide_admin: (t.valide_admin as boolean) ?? null,
        })),
      dateDebut: debutMois,
      dateFin: jour,
      asOf: jour,
    });
    faites += d.heuresFaites;
    dues += d.heuresDues;
  }
  const solde = faites - dues;

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto" style={{ minWidth: 0 }}>
        <EnTete
          titre="👥 Équipe"
          sousTitre={`L'équipe au ${formatDateFR(jour)}`}
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href="/employes/planning" variante="principal">🗓️ Planning</Bouton>
              <Bouton href="/employes" variante="secondaire">👥 Fiches</Bouton>
            </div>
          }
        />

        <GrilleTuiles etiquette="Les chiffres de l'équipe">
          <Tuile
            href="/employes/planning"
            titre="Qui travaille aujourd'hui"
            valeur={String(nomsPresents.length)}
            detail={nomsPresents.length > 0 ? nomsPresents.join(", ") : "Personne au planning"}
          />

          <Tuile
            href="/employes/vacances"
            titre="Demandes de congé en attente"
            valeur={String(congesEnAttente ?? 0)}
            detail={(congesEnAttente ?? 0) > 0 ? "À accepter ou à refuser" : "Rien à traiter"}
            couleur={(congesEnAttente ?? 0) > 0 ? "#A8453A" : "#1F6E5B"}
            alerte={(congesEnAttente ?? 0) > 0}
          />

          <Tuile
            href="/employes/timbrage"
            titre="Heures du mois en cours"
            valeur={heures(faites)}
            detail={`${heures(dues)} dues · solde ${solde >= 0 ? "+" : ""}${heures(solde)}`}
            couleur={solde < 0 ? "#A8453A" : MARINE}
          />

          <Tuile
            href="/employes"
            titre="Employées actives"
            valeur={String(actifs.length)}
            detail="Fiches RH ouvertes"
          />
        </GrilleTuiles>

        <section style={{ marginTop: 28, minWidth: 0 }}>
          <h2 style={{
            fontFamily: "Georgia, 'Times New Roman', serif", color: MARINE,
            fontSize: 18, fontWeight: 700, margin: "0 0 12px",
          }}>
            Le reste de l&apos;équipe
          </h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", minWidth: 0 }}>
            <Raccourci href="/employes/fiches-salaire" titre="📄 Fiches de salaire" note="Établir, imprimer, certificats" />
            <Raccourci href="/employes/planning-equipe" titre="🗓️ Planning affiché" note="La vue que voit l'équipe" />
            <Raccourci href="/employes/nouveau-rh" titre="➕ Nouvelle fiche RH" note="Engager quelqu'un" />
          </div>
        </section>
      </div>
    </main>
  );
}
