import { createClient } from "@/src/utils/supabase/server";
import { modifierEmploye } from "./actions";
import BoutonSupprimerEmploye from "./BoutonSupprimerEmploye";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import ChampsRh from "./ChampsRh";

export default async function ModifierEmployePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const { id } = await params;

  const { data: emp } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const { data: rhParProfileId } = await supabase
    .from("employes_rh")
    .select("*")
    .eq("profile_id", id)
    .maybeSingle();

  const { data: rh } = !rhParProfileId ? await supabase
    .from("employes_rh")
    .select("*")
    .eq("id", id)
    .maybeSingle() : { data: null };

  const { data: rhParEmail } = !rhParProfileId && !rh && emp ? await supabase
    .from("employes_rh")
    .select("*")
    .eq("email", emp?.email || "")
    .maybeSingle() : { data: null };

  const rhData = rhParProfileId || rh || rhParEmail;

  const empResolu = emp ?? (rhData?.profile_id ? (
    await supabase.from("profiles").select("*").eq("id", rhData.profile_id).maybeSingle()
  ).data : null);

  if (!empResolu && !rhData) return <div>Employé introuvable</div>;

  const actionModifier = modifierEmploye.bind(null, id, rhData?.id || null);

  const inputClass = "w-full rounded-xl p-3 border border-[rgba(27,43,94,0.18)]";
  const titreSection = "font-bold mb-3 text-sm uppercase tracking-wide text-[rgba(27,43,94,0.5)]";

  return (
    <main className="min-h-screen p-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-2xl mx-auto">

        <EnTete
          titre="✏️ Modifier l'employé"
          sousTitre={`${rhData?.prenom || empResolu?.prenom || ""} ${rhData?.nom || empResolu?.nom || ""}`}
          action={<Bouton href="/employes" variante="secondaire">← Équipe</Bouton>}
        />

        <Carte>
          <form action={actionModifier} className="space-y-6">

            {/* Infos personnelles */}
            <div>
              <h2 className={titreSection}>Informations personnelles</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold mb-1 text-sm">Prénom</label>
                  <input name="prenom" type="text"
                    defaultValue={rhData?.prenom || empResolu?.prenom || ""}
                    className={inputClass} />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-sm">Nom</label>
                  <input name="nom" type="text"
                    defaultValue={rhData?.nom || empResolu?.nom || ""}
                    className={inputClass} />
                </div>
              </div>
              <div className="mt-4">
                <label className="block font-semibold mb-1 text-sm">Email</label>
                <input name="email" type="email"
                  defaultValue={rhData?.email || empResolu?.email || ""}
                  className={inputClass} />
              </div>
              <div className="mt-4">
                <label className="block font-semibold mb-1 text-sm">Téléphone</label>
                <input name="telephone" type="tel"
                  defaultValue={rhData?.telephone || empResolu?.telephone || ""}
                  placeholder="+41 79 000 00 00"
                  className={inputClass} />
              </div>
              <div className="mt-4">
                <label className="block font-semibold mb-1 text-sm">N° AVS</label>
                <input name="numero_avs" type="text"
                  defaultValue={rhData?.numero_avs || ""}
                  placeholder="756.XXXX.XXXX.XX"
                  className={inputClass} />
              </div>
              <div className="mt-4">
                <label className="block font-semibold mb-1 text-sm">Date de naissance</label>
                <input name="date_naissance" type="date"
                  defaultValue={rhData?.date_naissance || ""}
                  className={inputClass} />
              </div>
              <div className="mt-4">
                <label className="block font-semibold mb-1 text-sm">Adresse</label>
                <input name="adresse" type="text"
                  defaultValue={rhData?.adresse || ""}
                  placeholder="Rue de la Paix 1, 1950 Sion"
                  className={inputClass} />
              </div>
            </div>

            {/* Infos RH */}
            {rhData && (
              <div>
                <h2 className={titreSection}>Informations RH</h2>

                <ChampsRh
                  inputClass={inputClass}
                  initial={{
                    poste: rhData.poste || "Auxiliaire",
                    poste_autre: rhData.poste_autre || "",
                    taux_travail: rhData.taux_travail,
                    salaire_base: rhData.salaire_base ?? null,
                    jour_cours: rhData.jour_cours ?? null,
                    salaire_annee_1: rhData.salaire_annee_1 ?? null,
                    salaire_annee_2: rhData.salaire_annee_2 ?? null,
                    salaire_annee_3: rhData.salaire_annee_3 ?? null,
                    annee_apprentissage: rhData.annee_apprentissage ?? null,
                  }}
                />
                <div className="mt-4">
                  <label className="block font-semibold mb-1 text-sm">Date d'entrée</label>
                  <input name="date_entree" type="date"
                    defaultValue={rhData.date_entree}
                    className={inputClass} />
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <input type="checkbox" name="actif" id="actif"
                    defaultChecked={rhData.actif} />
                  <label htmlFor="actif" className="font-semibold text-sm">Employé actif</label>
                </div>
              </div>
            )}

            {/* Mot de passe */}
            {empResolu && (
              <div>
                <h2 className={titreSection}>Sécurité</h2>
                <div className="rounded-xl p-4 border border-[rgba(27,43,94,0.12)]" style={{ backgroundColor: "#FBF8F2" }}>
                  <label className="block font-semibold mb-1 text-sm">
                    Nouveau mot de passe
                    <span className="font-normal ml-2 text-[rgba(27,43,94,0.45)]">— laisser vide pour ne pas changer</span>
                  </label>
                  <input name="nouveau_mdp" type="password" minLength={6}
                    placeholder="minimum 6 caractères"
                    className="w-full rounded-xl p-3 border border-[rgba(27,43,94,0.18)]" style={{ backgroundColor: "#FFFFFF" }} />
                </div>
              </div>
            )}

            {/* Permissions */}
            {empResolu && empResolu.role === "employe" && (
              <div className="space-y-5">
                <h2 className="font-bold text-sm uppercase tracking-wide text-[rgba(27,43,94,0.5)]">
                  Permissions
                </h2>

                {[
                  {
                    titre: "Opérationnel — chiens & clients",
                    items: [
                      { key: "perm_chiens_creer", label: "Ajouter des chiens" },
                      { key: "perm_chiens_modifier", label: "Modifier les chiens" },
                      { key: "perm_clients_creer", label: "Créer des clients" },
                      { key: "perm_clients_modifier", label: "Modifier les clients" },
                    ],
                  },
                  {
                    titre: "Réservations & journées d'essai",
                    items: [
                      { key: "perm_reservations_creer", label: "Créer des réservations" },
                      { key: "perm_reservations_modifier", label: "Modifier des réservations" },
                      { key: "perm_reservations_annuler", label: "Annuler des réservations" },
                      { key: "perm_journee_essai", label: "Gérer les journées d'essai (valider / invalider)" },
                    ],
                  },
                  {
                    titre: "Encaissements",
                    items: [
                      { key: "perm_encaissements", label: "Encaissements (enregistrer un paiement, marquer payé, avoirs)" },
                      { key: "perm_tarifs_urgence", label: "Appliquer le tarif d'urgence" },
                    ],
                  },
                  {
                    titre: "Check-in & box",
                    items: [
                      { key: "perm_checkin", label: "Check-in / check-out" },
                      { key: "perm_box", label: "Attribuer / gérer les box" },
                    ],
                  },
                  {
                    titre: "Planning & équipe (responsable)",
                    items: [
                      { key: "perm_timbrage_equipe", label: "Gérer le timbrage de l'équipe" },
                      { key: "perm_vacances_equipe", label: "Approuver les vacances de l'équipe" },
                    ],
                  },
                ].map(({ titre, items }) => (
                  <div key={titre}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[rgba(27,43,94,0.5)] mb-2">{titre}</p>
                    <div className="space-y-1.5 pl-1">
                      {items.map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" name={key}
                            defaultChecked={(empResolu as any)[key] ?? false} />
                          <span className="text-sm">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                <p className="text-xs text-[rgba(27,43,94,0.5)] italic">
                  Acquis pour tout employé, sans réglage : son propre espace RH, la lecture des tarifs et la lecture du planning de toute l'équipe.
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t border-[rgba(27,43,94,0.12)]">
              <Bouton type="submit" variante="principal">💾 Enregistrer</Bouton>
              <Bouton href="/employes" variante="secondaire">✖ Annuler</Bouton>
            </div>
          </form>
        </Carte>

        {empResolu && (
          <div className="mt-6">
            <Carte accent="rose">
              <h2 className="font-bold mb-3" style={{ color: "#E8847A" }}>⚠️ Zone dangereuse</h2>
              <BoutonSupprimerEmploye id={id} nom={`${empResolu.prenom} ${empResolu.nom}`} />
            </Carte>
          </div>
        )}

      </div>
    </main>
  );
}
