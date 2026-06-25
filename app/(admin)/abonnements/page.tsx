import Link from "next/link";
import { redirect } from "next/navigation";
import { exigerPersonnelPage } from "@/src/lib/exigerPersonnelPage";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import { formatDateFR } from "@/src/lib/dates";
import { labelAbonnement } from "@/src/lib/abonnementsTypes";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import EtatVide from "@/app/components/ui/EtatVide";
import ContactEmail from "@/app/components/ContactEmail";
import BoutonConfirmerAbonnement from "../clients/[id]/BoutonConfirmerAbonnement";

export default async function AbonnementsAdminPage() {
  await exigerPersonnelPage();
  const perms = await getProfilePerms();
  if (!perms.perm_encaissements) redirect("/");

  const { data: demandes } = await supabaseAdmin
    .from("abonnements")
    .select("id, client_id, categorie, prix_paye, date_commande, clients (id, prenom, nom, email)")
    .eq("statut", "en_attente_paiement")
    .order("date_commande", { ascending: true });

  const liste = demandes ?? [];

  return (
    <main className="min-h-screen p-6 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-3xl mx-auto">
        <EnTete
          titre="🎟️ Demandes d'abonnement"
          sousTitre="Abonnements en attente de confirmation de paiement."
        />

        {liste.length === 0 ? (
          <Carte>
            <EtatVide
              icone="🎟️"
              titre="Aucune demande en attente"
              message="Les demandes d'abonnement à confirmer apparaîtront ici."
            />
          </Carte>
        ) : (
          <div className="flex flex-col gap-3">
            {liste.map((abo: any) => {
              const c = abo.clients;
              return (
                <Carte key={abo.id}>
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <Link href={`/clients/${c?.id}`} style={{ fontWeight: 700, color: "#1B2B5E", textDecoration: "none" }}>
                        {c?.prenom} {c?.nom}
                      </Link>
                      <p style={{ fontSize: 13, color: "#8A8275", margin: "2px 0 0" }}>
                        <ContactEmail email={c?.email} />
                      </p>
                      <p style={{ fontSize: 13, color: "#1B2B5E", margin: "6px 0 0" }}>
                        {labelAbonnement(abo.categorie)} — <strong>CHF {Number(abo.prix_paye).toFixed(2)}</strong>
                      </p>
                      {abo.date_commande && (
                        <p style={{ fontSize: 12, color: "#8A8275", margin: "2px 0 0" }}>
                          Commandé le {formatDateFR(abo.date_commande)}
                        </p>
                      )}
                    </div>
                    {perms.perm_encaissements && (
                      <BoutonConfirmerAbonnement abonnementId={abo.id} />
                    )}
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
