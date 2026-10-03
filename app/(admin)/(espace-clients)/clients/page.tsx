import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import { clientsMembresAJour } from "@/src/lib/membre";
import BadgeMembre from "@/app/components/BadgeMembre";
import EnTete from "@/app/components/ui/EnTete";
import Bouton from "@/app/components/ui/Bouton";
import Carte from "@/app/components/ui/Carte";
import EtatVide from "@/app/components/ui/EtatVide";
import RechercheAZ, { type ElementRecherche } from "@/app/components/RechercheAZ";
import { lireEtat } from "@/src/lib/rechercheAZ";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigerAccesAdmin();
  const etat = lireEtat(await searchParams);
  const perms = await getProfilePerms();
  const supabase = supabaseAdmin;

  // APP 73 — le nom des chiens vient dans la MÊME lecture : taper « Max »
  // trouve le propriétaire de Max sans aucune requête de plus.
  const { data: clients } = await supabase
    .from("clients")
    .select(`*, chiens (id, nom)`)
    .order("nom");

  // Identifier les fiches liées à un compte employé/admin
  const authUserIds = (clients ?? [])
    .filter(c => c.auth_user_id)
    .map(c => c.auth_user_id as string);

  // Les deux lectures qui dépendent de la liste partent ENSEMBLE (APP 70).
  const personnelIds = new Set<string>();
  const [{ data: profiles }, idsAJour] = await Promise.all([
    authUserIds.length > 0
      ? supabase
          .from("profiles")
          .select("id, role")
          .in("id", authUserIds)
          .in("role", ["employe", "admin"])
      : Promise.resolve({ data: [] as { id: string; role: string }[] }),
    clientsMembresAJour(supabaseAdmin, (clients ?? []).map(c => c.id)),
  ]);
  (profiles ?? []).forEach(p => personnelIds.add(p.id));

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

        {clients?.length ? (
          <RechercheAZ
            base="/clients"
            initial={etat}
            singulier="client"
            pluriel="clients"
            placeholder="Nom, prénom, téléphone, e-mail ou nom d'un chien…"
            elements={clients.map((client): ElementRecherche => {
              const isPersonnel = client.auth_user_id && personnelIds.has(client.auth_user_id);
              const chiens = (client.chiens ?? []) as { id: string; nom: string | null }[];
              return {
                id: client.id as string,
                // La lettre : le NOM DE FAMILLE. Le tri : nom, puis prénom.
                cleLettre: client.nom as string,
                tri: `${client.nom ?? ""} ${client.prenom ?? ""}`,
                textes: [client.nom, client.prenom, client.email, ...chiens.map((c) => c.nom)],
                telephones: [client.telephone],
                carte: (
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
                ),
              };
            })}
          />
        ) : (
          <Carte>
            <EtatVide icone="👤" titre="Aucun client" message="Ajoute ton premier client pour commencer." />
          </Carte>
        )}

      </div>
    </main>
  );
}
