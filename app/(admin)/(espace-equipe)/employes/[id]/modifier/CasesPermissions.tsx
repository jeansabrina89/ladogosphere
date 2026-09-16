import { DOMAINES } from "@/src/lib/permissionsCatalogue";

/**
 * Les cases de permissions d'un employé, tirées du catalogue.
 *
 * Ce formulaire avait sa propre liste, écrite à la main. Elle avait fini par
 * oublier deux permissions : « Prestations locataires », qu'on ne pouvait
 * donc pas donner, et « Planning », que l'action écrivait quand même — chaque
 * enregistrement la remettait à zéro sans rien afficher. Une case par entrée
 * du catalogue, groupées par domaine : il n'y a plus de seconde liste à tenir.
 */
export default function CasesPermissions({
  valeurs,
}: {
  /** Le profil de l'employé : une colonne `perm_*` vraie coche sa case. */
  valeurs: Record<string, unknown>;
}) {
  return (
    <>
      {DOMAINES.map((domaine) => (
        <fieldset key={domaine.nom} className="border-0 p-0 m-0">
          <legend className="text-xs font-semibold uppercase tracking-wide text-[rgba(27,43,94,0.5)] mb-2">
            {domaine.nom}
          </legend>
          <div className="space-y-2 pl-1">
            {domaine.entrees.map(({ cle, court, aide }) => (
              <label key={cle} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name={cle}
                  defaultChecked={valeurs[cle] === true}
                  className="mt-1"
                />
                <span className="text-sm">
                  {court}
                  {aide && (
                    <span className="block text-xs text-[rgba(27,43,94,0.55)]">{aide}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </>
  );
}
