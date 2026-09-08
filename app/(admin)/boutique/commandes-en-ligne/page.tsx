import { exigerAccesAdmin } from "@/src/lib/accesAdmin";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { listerCommandesEnLigne } from "@/src/lib/venteEnLigne";
import { STATUTS_COMMANDE_LIGNE } from "@/src/lib/venteEnLigneLogique";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import CarteCommandeEnLigne, { type CommandeAffichee } from "./CarteCommandeEnLigne";

export const dynamic = "force-dynamic";

const SOUS = "rgba(27,43,94,0.55)";

/**
 * Les commandes en ligne, par statut.
 *
 * Écran SÉPARÉ de « Sur mesure », et non un onglet : ce sont deux métiers
 * différents. Une commande sur mesure se fabrique à l'atelier pendant des
 * jours ; une commande en ligne se prépare en dix minutes et part. Les
 * mélanger obligerait à filtrer en permanence pour retrouver son travail du
 * jour. Un article configuré commandé en ligne apparaît d'ailleurs aux deux
 * endroits, chacun pour ce qui le concerne.
 */
export default async function CommandesEnLignePage({
  searchParams,
}: {
  searchParams: Promise<{ closes?: string }>;
}) {
  await exigerAccesAdmin("perm_boutique_vente");
  const params = await searchParams;
  const avecCloses = params.closes === "1";

  const commandes = await listerCommandesEnLigne();

  const resaIds = commandes.map((c) => c.reservation_id).filter((id): id is string => !!id);
  const { data: resas } = resaIds.length
    ? await supabaseAdmin
        .from("reservations").select("id, numero, date_fin, chiens(nom)").in("id", resaIds)
    : { data: [] };

  const parResa = new Map(
    ((resas ?? []) as unknown as {
      id: string; numero: number | null; date_fin: string;
      chiens: { nom: string } | { nom: string }[] | null;
    }[]).map((r) => [
      r.id,
      {
        numero: r.numero,
        date_fin: r.date_fin,
        chien: Array.isArray(r.chiens) ? r.chiens[0]?.nom ?? null : r.chiens?.nom ?? null,
      },
    ])
  );

  const affichees: CommandeAffichee[] = commandes.map((c) => ({
    id: c.id,
    numero: c.numero,
    statut: c.statut,
    mode_remise: c.mode_remise,
    mode_paiement: c.mode_paiement,
    reservation_id: c.reservation_id,
    adresse_livraison: c.adresse_livraison,
    frais_port: Number(c.frais_port),
    remise_membre: Number(c.remise_membre),
    montant_total: Number(c.montant_total),
    facture_id: c.facture_id,
    vente_id: c.vente_id,
    numero_suivi: c.numero_suivi,
    motif_annulation: c.motif_annulation,
    confirmee_le: c.confirmee_le,
    client: c.client ? { id: c.client.id, prenom: c.client.prenom, nom: c.client.nom } : null,
    lignes: c.lignes.map((l) => ({
      id: l.id, libelle: l.libelle,
      quantite: Number(l.quantite), montant: Number(l.montant),
    })),
    reservation: c.reservation_id ? parResa.get(c.reservation_id) ?? null : null,
  }));

  const ouvertes = ["confirmee", "en_preparation", "prete"];
  const sections = STATUTS_COMMANDE_LIGNE.filter((s) =>
    s.valeur !== "panier" && (avecCloses ? true : ouvertes.includes(s.valeur))
  );

  const nbOuvertes = affichees.filter((c) => ouvertes.includes(c.statut)).length;

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">
        <EnTete
          titre="🌐 Commandes en ligne"
          sousTitre={
            nbOuvertes === 0
              ? "Rien à préparer."
              : `${nbOuvertes} commande${nbOuvertes > 1 ? "s" : ""} à préparer.`
          }
          action={
            <Bouton
              href={avecCloses ? "/boutique/commandes-en-ligne" : "/boutique/commandes-en-ligne?closes=1"}
              variante="secondaire"
            >
              {avecCloses ? "Masquer les closes" : "Voir les closes"}
            </Bouton>
          }
        />

        {affichees.length === 0 ? (
          <Carte>
            <EtatVide
              icone="🌐"
              titre="Aucune commande en ligne"
              message="Les commandes passées depuis l'espace client apparaîtront ici."
            />
          </Carte>
        ) : (
          <div style={{ display: "grid", gap: 22 }}>
            {sections.map((s) => {
              const dedans = affichees.filter((c) => c.statut === s.valeur);
              if (dedans.length === 0) return null;
              return (
                <section key={s.valeur} style={{ display: "grid", gap: 12 }}>
                  <h2 style={{ color: "#1B2B5E", fontSize: 18, fontWeight: 700, margin: 0 }}>
                    {s.libelle}{" "}
                    <span style={{ color: SOUS, fontSize: 15, fontWeight: 400 }}>
                      ({dedans.length})
                    </span>
                  </h2>
                  {dedans.map((c) => (
                    <CarteCommandeEnLigne key={c.id} commande={c} />
                  ))}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
