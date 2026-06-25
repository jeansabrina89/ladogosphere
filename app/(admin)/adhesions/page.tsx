import { redirect } from "next/navigation";
import { exigerPersonnelPage } from "@/src/lib/exigerPersonnelPage";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import Link from "next/link";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import EtatVide from "@/app/components/ui/EtatVide";
import BoutonConfirmerCotisation from "../clients/[id]/BoutonConfirmerCotisation";
import ContactEmail from "@/app/components/ContactEmail";

const MODE_LABEL: Record<string, string> = {
  virement: "🏦 Virement bancaire",
  prochaine_resa: "🗓️ À ajouter à une réservation",
  cash: "💵 Espèces",
};

export default async function AdhesionsPage() {
  await exigerPersonnelPage();
  const perms = await getProfilePerms();
  if (!perms.perm_encaissements) redirect("/");

  const { data: demandes } = await supabaseAdmin
    .from("cotisations_membres")
    .select("id, annee, montant, mode_paiement, created_at, statut, clients (id, prenom, nom, email)")
    .eq("statut", "en_attente")
    .order("created_at", { ascending: true });

  const liste = demandes ?? [];

  return (
    <main className="min-h-screen p-6 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">
        <EnTete titre="🎫 Demandes d'adhésion" sousTitre="Cotisations en attente de confirmation de paiement." />

        {liste.length === 0 ? (
          <Carte>
            <EtatVide icone="🎫" titre="Aucune demande en attente" message="Les demandes d'adhésion à confirmer apparaîtront ici." />
          </Carte>
        ) : (
          <div className="flex flex-col gap-3">
            {liste.map((d: any) => {
              const c = d.clients;
              return (
                <Carte key={d.id}>
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <Link href={`/clients/${c?.id}`} style={{ fontWeight: 700, color: "#1B2B5E", textDecoration: "none" }}>
                        {c?.prenom} {c?.nom}
                      </Link>
                      <p style={{ fontSize: 13, color: "#8A8275", margin: "2px 0 0" }}><ContactEmail email={c?.email} /></p>
                      <p style={{ fontSize: 13, color: "#1B2B5E", margin: "6px 0 0" }}>
                        Cotisation {d.annee} — <strong>{Number(d.montant)} CHF</strong>
                      </p>
                      <p style={{ fontSize: 12, color: "#8A8275", margin: "2px 0 0" }}>
                        {MODE_LABEL[d.mode_paiement] ?? d.mode_paiement} · demandée le {new Date(d.created_at).toLocaleDateString("fr-CH")}
                      </p>
                    </div>
                    <BoutonConfirmerCotisation cotisation_id={d.id} statut={d.statut} perm_encaissements={perms.perm_encaissements} />
                  </div>
                </Carte>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
