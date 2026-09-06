import Link from "next/link";
import { exigerPersonnelPage } from "@/src/lib/exigerPersonnelPage";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { getProfilePerms } from "@/src/lib/getProfilePerms";
import BoutonArchiver from "./BoutonArchiver";
import BoutonSupprimer from "./BoutonSupprimer";
import Ententes from "./Ententes";
import BoutonsJourneeEssai from "./BoutonsJourneeEssai";
import EnTete from "@/app/components/ui/EnTete";
import Carte from "@/app/components/ui/Carte";
import Bouton from "@/app/components/ui/Bouton";
import EtatVide from "@/app/components/ui/EtatVide";
import ContactTelephone from "@/app/components/ContactTelephone";
import BadgePhotos from "@/app/components/BadgePhotos";
import { statutEssaiDe, type StatutEssai } from "@/src/lib/journeeEssai";
import { formatDateFR } from "@/src/lib/dates";

export default async function ChienPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerPersonnelPage();
  const perms = await getProfilePerms();
  const supabase = supabaseAdmin;
  const { id } = await params;

  const { data: chien } = await supabase
    .from("chiens")
    .select(`*, clients (id, prenom, nom, photos_ok, photos_ok_modifie_le), profil_resultat:profiles!chiens_journee_essai_resultat_par_fkey (prenom, nom)`)
    .eq("id", id)
    .single();

  const { data: tousChiens } = await supabase
    .from("chiens")
    .select("id, nom, race")
    .eq("actif", true)
    .order("nom");

  if (!chien) {
    return (
      <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
        <div className="max-w-4xl mx-auto">
          <Carte>
            <EtatVide
              icone="🐶"
              titre="Chien introuvable"
              message="Ce chien n'existe pas ou a été supprimé."
              action={<Bouton variante="secondaire" href="/chiens">← Retour à la liste</Bouton>}
            />
          </Carte>
        </div>
      </main>
    );
  }

  function calculerAge(dateNaissance: string) {
    if (!dateNaissance) return "-";
    const naissance = new Date(dateNaissance);
    const aujourdHui = new Date();
    let age = aujourdHui.getFullYear() - naissance.getFullYear();
    const mois = aujourdHui.getMonth() - naissance.getMonth();
    if (mois < 0 || (mois === 0 && aujourdHui.getDate() < naissance.getDate())) age--;
    return age;
  }

  const muted: React.CSSProperties = { color: "rgba(27,43,94,0.6)", fontSize: 14, margin: 0 };
  const pill = (bg: string, color: string): React.CSSProperties => ({
    display: "inline-block", backgroundColor: bg, color, borderRadius: 999,
    padding: "2px 10px", fontSize: 13, fontWeight: 500, lineHeight: "20px", whiteSpace: "nowrap",
  });
  const titreSection: React.CSSProperties = {
    fontFamily: "Georgia, 'Times New Roman', serif",
    color: "#1B2B5E", fontSize: 18, fontWeight: 700, margin: "0 0 16px",
  };
  const ligne = (label: string, valeur: React.ReactNode) => (
    <div style={{ display: "flex", gap: 12, fontSize: 15, lineHeight: 1.6, alignItems: "baseline" }}>
      <span style={{ color: "rgba(27,43,94,0.6)", width: 150, flexShrink: 0 }}>{label}</span>
      <span style={{ color: "#1B2B5E", fontWeight: 500, minWidth: 0 }}>{valeur ?? "—"}</span>
    </div>
  );

  const statutEssai = statutEssaiDe(chien);
  const BADGE_ESSAI: Record<StatutEssai, { label: string; style: React.CSSProperties }> = {
    non_programme:   { label: "⏳ À réserver",            style: pill("#EDE8DF", "rgba(27,43,94,0.6)") },
    programme:       { label: "📅 Journée d'essai réservée", style: pill("#E4E7F1", "#2A3B6B") },
    seconde_journee: { label: "🔁 Seconde journée à prévoir", style: pill("#F4EAC9", "#6E5410") },
    valide:          { label: "✅ Validé",                 style: pill("#DBEFEA", "#1F6E5B") },
    refuse:          { label: "❌ Refusé",                 style: pill("#FBE2DE", "#A8453A") },
  };
  const saisiPar = [chien.profil_resultat?.prenom, chien.profil_resultat?.nom]
    .filter(Boolean).join(" ") || null;

  const sterilisationTxt =
    chien.sterilisation === "oui" ? "Stérilisé" :
    chien.sterilisation === "chimique" ? "Castré chimiquement" : "Non stérilisé";
  const categorieTxt =
    chien.categorie_poids === "moins_15kg" ? "🟢 Petit (< 15 kg)" :
    chien.categorie_poids === "15_30kg" ? "🟡 Moyen (15–30 kg)" :
    chien.categorie_poids === "30_40kg" ? "🔴 Grand (> 30 kg)" : "—";

  const compat = [
    { ok: chien.compatible_males_castres, label: "Mâles castrés" },
    { ok: chien.compatible_males_entiers, label: "Mâles entiers" },
    { ok: chien.compatible_femelles_sterilisees, label: "Femelles stérilisées" },
    { ok: chien.compatible_femelles_entieres, label: "Femelles entières" },
    { ok: chien.compatible_moins_15kg, label: "Moins de 15 kg" },
    { ok: chien.compatible_15_30kg, label: "15 à 30 kg" },
    { ok: chien.compatible_30_40kg, label: "Plus de 30 kg" },
  ];

  return (
    <main className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor: "#F5F0E8" }}>
      <div className="max-w-4xl mx-auto">

        {!chien.actif && (
          <div style={{ backgroundColor: "#EDE8DF", color: "rgba(27,43,94,0.7)", padding: "12px 16px", borderRadius: 14, marginBottom: 16, fontWeight: 600 }}>
            🗄️ Ce chien est archivé
          </div>
        )}

        {statutEssai === "refuse" && (
          <div style={{ backgroundColor: "#FBE2DE", color: "#A8453A", padding: "12px 16px", borderRadius: 14, marginBottom: 16, fontWeight: 600 }}>
            ❌ Journée d'essai non concluante — ce chien ne peut pas être réservé
            {chien.journee_essai_note && (
              <p style={{ fontWeight: 400, fontSize: 14, margin: "4px 0 0" }}>{chien.journee_essai_note}</p>
            )}
          </div>
        )}

        <EnTete titre={`🐶 ${chien.nom}`} sousTitre={chien.race || undefined} />

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Identité */}
          <Carte>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ width: 96, height: 96, borderRadius: "50%", background: "#DBEFEA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, overflow: "hidden", flexShrink: 0, border: "3px solid #DBEFEA" }}>
                {chien.photo_principale ? (
                  <img src={chien.photo_principale} alt={chien.nom} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  "🐕"
                )}
              </div>
              <div style={{ flex: 1, minWidth: 240, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                  {chien.sterilisation === "oui" ? (
                    <span style={pill("#DBEFEA", "#1F6E5B")}>Stérilisé</span>
                  ) : chien.sterilisation === "chimique" ? (
                    <span style={pill("#F4EAC9", "#6E5410")}>Castré chim.</span>
                  ) : (
                    <span style={pill("#FBE2DE", "#A8453A")}>Entier</span>
                  )}
                  <span style={BADGE_ESSAI[statutEssai].style}>{BADGE_ESSAI[statutEssai].label}</span>
                </div>
                {ligne("Propriétaire", chien.clients?.id ? (
                  <Link href={`/clients/${chien.clients.id}`} style={{ color: "#1F6E5B", textDecoration: "underline" }}>
                    {chien.clients.prenom} {chien.clients.nom}
                  </Link>
                ) : chien.clients ? (
                  <>{chien.clients.prenom} {chien.clients.nom}</>
                ) : "—")}
                {ligne("Photos", (
                  <BadgePhotos
                    photos_ok={chien.clients?.photos_ok}
                    modifie_le={chien.clients?.photos_ok_modifie_le}
                  />
                ))}
                {ligne("Sexe", chien.sexe === "M" ? "♂️ Mâle" : "♀️ Femelle")}
                {ligne("Âge", `${calculerAge(chien.date_naissance)} an(s)`)}
                {ligne("Couleur", chien.couleur || "—")}
                {ligne("Stérilisation", sterilisationTxt)}
                {ligne("Poids", chien.poids ? `${chien.poids} kg` : "—")}
                {ligne("Catégorie", categorieTxt)}
                {ligne("Niveau d'énergie", chien.niveau_energie || "—")}
                {ligne("Numéro de puce", chien.numero_puce || "—")}
              </div>
            </div>
          </Carte>

          {/* Santé */}
          <Carte>
            <h2 style={titreSection}>🩺 Santé</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ligne("Allergies", chien.allergies || "Aucune")}
              {ligne("Traitements", chien.traitements || "Aucun")}
              {ligne("Vétérinaire", chien.veterinaire_nom || "—")}
              {ligne("Tél. vétérinaire", <ContactTelephone numero={chien.veterinaire_telephone} appelSeul />)}
            </div>
          </Carte>

          {/* Comportement */}
          <Carte>
            <h2 style={titreSection}>🐾 Comportement</h2>
            <p style={{ color: "#1B2B5E", fontSize: 15, margin: "0 0 12px", lineHeight: 1.6 }}>{chien.comportement || "—"}</p>
            {(chien.protection_ressources || chien.destructeur || chien.craintif) && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {chien.protection_ressources && <span style={pill("#FBE2DE", "#A8453A")}>⚠️ Protection de ressources</span>}
                {chien.destructeur && <span style={pill("#F4EAC9", "#6E5410")}>🔨 Destructeur</span>}
                {chien.craintif && <span style={pill("#F4EAC9", "#6E5410")}>😰 Craintif</span>}
              </div>
            )}
            {chien.comportement_autre && ligne("Autres", chien.comportement_autre)}
            <div style={{ marginTop: 8 }}>{ligne("Remarques", chien.remarques || "—")}</div>
          </Carte>

          {/* Journée d'essai */}
          <Carte>
            <h2 style={titreSection}>🧪 Journée d'essai</h2>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              <span style={BADGE_ESSAI[statutEssai].style}>{BADGE_ESSAI[statutEssai].label}</span>
            </div>
            {chien.journee_essai_resultat_le && (
              <p style={{ ...muted, marginBottom: 8 }}>
                Résultat saisi le {formatDateFR(chien.journee_essai_resultat_le)}
                {saisiPar ? ` par ${saisiPar}` : ""}
              </p>
            )}
            {chien.journee_essai_note && (
              <p style={{ ...muted, marginBottom: 16 }}><strong style={{ color: "#1B2B5E" }}>Note :</strong> {chien.journee_essai_note}</p>
            )}
            <BoutonsJourneeEssai
              chien_id={chien.id}
              statut_essai={chien.statut_essai}
              journee_essai_note={chien.journee_essai_note}
              perm_journee_essai={perms.perm_journee_essai}
            />
          </Carte>

          {/* Ententes individuelles */}
          <Carte>
            <Ententes
              chien_id={chien.id}
              tous_chiens={tousChiens ?? []}
              doit_etre_isole={chien.doit_etre_isole}
              perm_chiens_modifier={perms.perm_chiens_modifier}
            />
          </Carte>

          {/* Compatibilités générales */}
          <Carte>
            <h2 style={titreSection}>🤝 Compatibilités générales</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
              {compat.map((c, i) => (
                <div key={i} style={{ fontSize: 15, color: "#1B2B5E" }}>
                  {c.ok ? "✅" : "❌"} {c.label}
                </div>
              ))}
            </div>
            {chien.doit_etre_isole && (
              <div style={{ marginTop: 12 }}>
                <span style={pill("#FBE2DE", "#A8453A")}>🚫🐕 Doit être isolé (box seul, tarif privatif)</span>
              </div>
            )}
          </Carte>

        </div>

        {/* Barre d'actions */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
          {perms.perm_chiens_modifier && (
            <Bouton variante="principal" href={`/chiens/${chien.id}/modifier`}>✏️ Modifier le chien</Bouton>
          )}
          {perms.isAdmin && <BoutonArchiver id={chien.id} actif={chien.actif} />}
          {perms.isAdmin && <BoutonSupprimer id={chien.id} nom={chien.nom} />}
          <Bouton variante="secondaire" href="/chiens">← Retour à la liste</Bouton>
        </div>

      </div>
    </main>
  );
}
