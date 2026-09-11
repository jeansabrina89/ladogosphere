import { exigerAdminPage } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import EnTete from "@/app/components/ui/EnTete";
import GestionFormules, {
  type Formule,
  type PrestationBreve,
} from "./GestionFormules";

export const dynamic = "force-dynamic";

/**
 * Les formules, composées par Sabrina et par personne d'autre.
 *
 * Aucune n'est écrite en dur : ce qui est proposé ailleurs n'est qu'un point de
 * départ qu'elle saisira ou non. Le total indicatif des prestations incluses
 * s'affiche à côté du prix du forfait pour qu'elle voie ce qu'elle offre en le
 * composant — une aide à la décision, pas un calcul imposé.
 */
export default async function FormulesPage() {
  await exigerAdminPage();

  const [{ data: formules }, { data: lignes }, { data: prestations }, { data: abos }] =
    await Promise.all([
      supabaseAdmin
        .from("formules")
        .select("id, nom, description, prix_mensuel, actif, ordre")
        .order("ordre").order("nom"),
      supabaseAdmin
        .from("formules_lignes")
        .select("id, formule_id, prestation_id, quantite_par_semaine, jours, ordre, prestations (nom, prix)")
        .order("ordre"),
      supabaseAdmin
        .from("prestations")
        .select("id, nom, prix, actif")
        .order("ordre").order("nom"),
      supabaseAdmin
        .from("abonnements_prestations")
        .select("formule_id")
        .eq("statut", "actif"),
    ]);

  const comptes = new Map<string, number>();
  for (const a of (abos ?? []) as { formule_id: string }[]) {
    comptes.set(a.formule_id, (comptes.get(a.formule_id) ?? 0) + 1);
  }

  const parFormule = new Map<string, Formule["lignes"]>();
  for (const l of (lignes ?? []) as unknown as (Record<string, unknown> & {
    prestations?: { nom?: string; prix?: number | string } | null;
  })[]) {
    const liste = parFormule.get(String(l.formule_id)) ?? [];
    liste.push({
      id: String(l.id),
      prestation_id: String(l.prestation_id),
      quantite_par_semaine: Number(l.quantite_par_semaine ?? 0),
      jours: (l.jours as string[] | null) ?? null,
      prestation: l.prestations?.nom ?? "—",
      prix: Number(l.prestations?.prix ?? 0),
    });
    parFormule.set(String(l.formule_id), liste);
  }

  const liste: Formule[] = ((formules ?? []) as unknown as Record<string, unknown>[]).map((f) => ({
    id: String(f.id),
    nom: String(f.nom),
    description: (f.description as string | null) ?? null,
    prix_mensuel: Number(f.prix_mensuel ?? 0),
    actif: f.actif === true,
    ordre: Number(f.ordre ?? 0),
    lignes: parFormule.get(String(f.id)) ?? [],
    abonnementsActifs: comptes.get(String(f.id)) ?? 0,
  }));

  const catalogue: PrestationBreve[] = ((prestations ?? []) as unknown as Record<string, unknown>[])
    .map((p) => ({
      id: String(p.id),
      nom: String(p.nom),
      prix: Number(p.prix ?? 0),
      actif: p.actif === true,
    }));

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", minWidth: 0 }}>
        <EnTete
          titre="📋 Formules"
          sousTitre="Les forfaits mensuels, composés à la main. Rien n'est écrit en dur."
        />
        <GestionFormules formules={liste} prestations={catalogue} />
      </div>
    </main>
  );
}
