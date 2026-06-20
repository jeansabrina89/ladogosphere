import Link from "next/link";
import { exigerPersonnelPage } from "@/src/lib/exigerPersonnelPage";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import { clientsMembresAJour } from "@/src/lib/membre";
import BadgeMembre from "@/app/components/BadgeMembre";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import Carte from "@/app/components/ui/Carte";
import EtatVide from "@/app/components/ui/EtatVide";

export default async function ClientsPage() {
  await exigerPersonnelPage();
  const perms = await getProfilePerms();
  const supabase = supabaseAdmin;

  const { data: clients } = await supabase
    .from("clients")
    .select(`*, chiens (id)`)
    .order("nom");

  // Identifier les fiches liées à un compte employé/admin
  const authUserIds = (clients ?? [])
    .filter(c => c.auth_user_id)
    .map(c => c.auth_user_id as string);

  const personnelIds = new Set<string>();
  if (authUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, role")
      .in("id", authUserIds)
      .in("role", ["employe", "admin"]);
    (profiles ?? []).forEach(p => personnelIds.add(p.id));
  }

  const idsAJour = await clientsMembresAJour(supabaseAdmin, (clients ?? []).map(c => c.id));

  const muted: React.CSSProperties = { color: "rgba(27,43,94,0.6)", fontSize: 14, margin: 0 };
  const pill = (bg: string, color: string): React.CSSProperties => ({
    display: "inline-block", backgroundColor: bg, color, borderRadius: 999,
    padding: "2px 10px", fontSize: 13, fontWeight: 500, lineHeight: "20px", whiteSpace: "nowrap",
  });

  return (
    <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-5xl mx-auto">

        <EnTete
          titre="👤 Clients"
          sousTitre="Liste des clients enregistrés"
          action={
            perms.perm_clients_creer ? (
              <Bouton variante="principal" href="/clients/nouveau">Ajouter un client</Bouton>
            ) : undefined
          }
        />

        <p style={{ ...muted, fontWeight: 600, margin: "0 0 16px" }}>
          Total : {clients?.length ?? 0} client(s)
        </p>

        {clients?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {clients.map(client => {
              const isPersonnel = client.auth_user_id && personnelIds.has(client.auth_user_id);
              return (
                <Link key={client.id} href={`/clients/${client.id}`} style={{ textDecoration: "none" }}>
                  <Carte>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 18, fontWeight: 700, color: "#1B2B5E", margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {client.prenom} {client.nom}
                          {isPersonnel && <span style={pill("#DBEFEA", "#1F6E5B")}>Personnel</span>}
                        </p>
                        <p style={muted}>{client.email}</p>
                        <p style={muted}>{client.telephone || "—"}</p>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <BadgeMembre membre={!!client.membre} aJour={idsAJour.has(client.id)} montrerStandard />
                        <p style={{ ...muted, marginTop: 6 }}>{client.chiens?.length ?? 0} chien(s)</p>
                      </div>
                    </div>
                  </Carte>
                </Link>
              );
            })}
          </div>
        ) : (
          <Carte>
            <EtatVide icone="👤" titre="Aucun client" message="Ajoute ton premier client pour commencer." />
          </Carte>
        )}

      </div>
    </main>
  );
}
