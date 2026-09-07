import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { lireCorpsFormulaire } from "@/src/lib/corpsRequete";
import { exigerPermissionApi } from "@/src/lib/apiAuth";
import { supabaseAdmin } from "@/src/lib/supabase-admin";
import { deposerPiece } from "@/src/lib/pieces";
import { validerDepense } from "@/src/lib/depenses";
import { entrerStockDepuisDepense, type LigneEntreeStock } from "@/src/lib/boutique";
import {
  COMPTES_DEPENSE,
  MODES_PAIEMENT,
  COMPTE_MARCHANDISES,
  type ModePaiementDepense,
} from "@/src/lib/depensesLogique";

/**
 * Saisie d'une dépense en un seul envoi : les champs, le justificatif et, si
 * on le demande, la validation. C'est un écran qu'on utilise debout avec le
 * ticket dans la main — on ne fait pas revenir l'utilisateur deux fois.
 *
 * Si la validation échoue, le brouillon reste : rien n'est perdu.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const garde = await exigerPermissionApi(supabase, "perm_depenses");
  if (garde) return garde;

  const lecture = await lireCorpsFormulaire(req);
  if (!lecture.ok) return lecture.reponse;
  const formData = lecture.corps;

  const date_depense = String(formData.get("date_depense") ?? "").trim();
  const libelle = String(formData.get("libelle") ?? "").trim();
  const compte_charge = String(formData.get("compte_charge") ?? "").trim();
  const mode_paiement = String(formData.get("mode_paiement") ?? "").trim() as ModePaiementDepense;
  const fournisseur_id = (formData.get("fournisseur_id") as string) || null;
  const valider = String(formData.get("action") ?? "") === "valider";

  const montantBrut = String(formData.get("montant") ?? "").replace(",", ".").trim();
  const montant = Math.round(Number(montantBrut) * 100) / 100;

  const refus =
    !/^\d{4}-\d{2}-\d{2}$/.test(date_depense) ? "Indiquez la date de la dépense." :
    !libelle ? "Indiquez ce que vous avez payé." :
    !Number.isFinite(montant) || montant <= 0 ? "Indiquez un montant supérieur à zéro." :
    !COMPTES_DEPENSE.includes(compte_charge) ? "Choisissez une catégorie." :
    !MODES_PAIEMENT.some((m) => m.valeur === mode_paiement) ? "Choisissez un mode de paiement." :
    null;
  if (refus) return NextResponse.json({ error: refus }, { status: 400 });

  const { data: { user } } = await supabase.auth.getUser();

  const { data: creee, error } = await supabaseAdmin
    .from("depenses")
    .insert({
      date_depense,
      libelle,
      montant,
      compte_charge,
      mode_paiement,
      fournisseur_id,
      statut: "brouillon",
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const id = creee.id as string;

  const fichier = formData.get("fichier");
  if (fichier instanceof File && fichier.size > 0) {
    const depot = await deposerPiece({
      entite: "depense",
      entite_id: id,
      fichier,
      uploaded_by: user?.id ?? null,
    });
    if (!depot.ok) {
      // Le brouillon reste, avec ses champs : seul le justificatif a manqué.
      return NextResponse.json({ id, error: depot.error }, { status: 400 });
    }
  }

  if (!valider) return NextResponse.json({ id, statut: "brouillon" });

  const res = await validerDepense(id, user?.id ?? null);
  if (res.error) return NextResponse.json({ id, error: res.error }, { status: 400 });

  // Entrées en stock d'un achat de marchandises. Aucune écriture comptable de
  // plus : l'achat vient d'être passé en charge sur 4200. Si une entrée est
  // refusée, la dépense reste validée — c'est le stock qu'on signale.
  let stock: { entrees: number; erreurs: string[] } | null = null;
  if (compte_charge === COMPTE_MARCHANDISES) {
    const lignes = lireEntrees(formData.get("entrees"));
    if (lignes.length > 0) {
      stock = await entrerStockDepuisDepense(id, lignes, user?.id ?? null);
    }
  }

  return NextResponse.json({
    id,
    numero: res.numero,
    statut: "validee",
    ...(stock ? { entrees: stock.entrees, erreurs_stock: stock.erreurs } : {}),
  });
}

/** Entrées en stock transmises par le formulaire, en JSON. Une saisie illisible n'entre rien. */
function lireEntrees(brut: FormDataEntryValue | null): LigneEntreeStock[] {
  if (typeof brut !== "string" || !brut.trim()) return [];
  try {
    const lu = JSON.parse(brut);
    if (!Array.isArray(lu)) return [];
    return lu
      .map((l) => ({
        article_id: String(l?.article_id ?? ""),
        quantite: Number(String(l?.quantite ?? "").replace(",", ".")),
        date_peremption: l?.date_peremption ? String(l.date_peremption) : null,
      }))
      .filter((l) => l.article_id && Number.isFinite(l.quantite) && l.quantite > 0);
  } catch {
    return [];
  }
}
