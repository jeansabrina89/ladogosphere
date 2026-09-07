import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { listerCommandes } from "@/src/lib/personnalisation";
import { STATUTS_COMMANDE } from "@/src/lib/personnalisationLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import CarteCommande, { type CommandeCarte } from "./CarteCommande";

export const dynamic = "force-dynamic";

const sousTexte = "rgba(27,43,94,0.55)";

/**
 * Suivi de fabrication : une section par statut, du plus urgent au plus
 * ancien. Les commandes remises et annulées restent consultables, repliées
 * en bas — on ne supprime rien.
 */
export default async function CommandesPage({
  searchParams,
}: {
  searchParams: Promise<{ closes?: string }>;
}) {
  await exigerAccesAdmin("perm_boutique");
  const params = await searchParams;
  const avecCloses = params.closes === "1";

  const commandes = await listerCommandes();
  const ouvertes = ["a_faire", "en_cours", "prete"];
  const sections = STATUTS_COMMANDE.filter((s) =>
    avecCloses ? true : ouvertes.includes(s.valeur)
  );

  const nbOuvertes = commandes.filter((c) => ouvertes.includes(c.statut)).length;
  const nbRetard = commandes.filter((c) => c.enRetard).length;

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-6xl mx-auto">
        <EnTete
          titre="🎁 Commandes sur mesure"
          sousTitre={
            nbOuvertes === 0
              ? "Aucune commande en cours."
              : `${nbOuvertes} en cours${nbRetard > 0 ? ` · ${nbRetard} en retard` : ""}`
          }
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Bouton href="/boutique/caisse" variante="principal">💳 Caisse</Bouton>
              <Bouton href={avecCloses ? "/boutique/commandes" : "/boutique/commandes?closes=1"} variante="secondaire">
                {avecCloses ? "Masquer les closes" : "Voir les closes"}
              </Bouton>
              <Bouton href="/boutique/articles" variante="secondaire">← Boutique</Bouton>
            </div>
          }
        />

        {commandes.length === 0 ? (
          <Carte>
            <EtatVide
              icone="🎁"
              titre="Aucune commande sur mesure"
              message="Les commandes créées au comptoir apparaîtront ici, par étape de fabrication."
            />
          </Carte>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", alignItems: "start" }}>
            {sections.map((s) => {
              const liste = commandes.filter((c) => c.statut === s.valeur);
              return (
                <section key={s.valeur} style={{ display: "grid", gap: 10, alignContent: "start" }}>
                  <h2 style={{
                    color: s.couleur, backgroundColor: s.fond, borderRadius: 12,
                    padding: "8px 12px", fontSize: 15, fontWeight: 700, margin: 0,
                  }}>
                    {s.titre} ({liste.length})
                  </h2>

                  {liste.length === 0 ? (
                    <p style={{ color: sousTexte, fontSize: 14, margin: 0 }}>Rien ici.</p>
                  ) : (
                    liste.map((c) => (
                      <CarteCommande
                        key={c.id}
                        commande={{
                          id: c.id,
                          numero: c.numero,
                          client: c.client,
                          clientEmail: c.clientEmail,
                          article: c.article,
                          prix_total: c.prix_total,
                          date_promise: c.date_promise,
                          statut: c.statut,
                          notes: c.notes,
                          enRetard: c.enRetard,
                          vente_id: c.vente_id,
                          choix: c.choix.map((ch) => ({
                            id: ch.id,
                            groupe_nom: ch.groupe_nom,
                            valeur_libelle: ch.valeur_libelle,
                            valeur_texte: ch.valeur_texte,
                            code_couleur: ch.code_couleur,
                          })),
                        } satisfies CommandeCarte}
                      />
                    ))
                  )}
                </section>
              );
            })}
          </div>
        )}

        <p style={{ color: sousTexte, fontSize: 13, marginTop: 24 }}>
          Le passage en fabrication décompte les fournitures liées aux choix, une seule fois.
          Les articles sans fourniture liée ne décomptent rien — le suivi des fournitures se met
          en place article par article, quand vous voulez.
        </p>
      </div>
    </main>
  );
}
