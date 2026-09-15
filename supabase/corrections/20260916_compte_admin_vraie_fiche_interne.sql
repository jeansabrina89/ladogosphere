-- Le compte admin retrouve sa vraie fiche interne.
--
-- Constat du 16 septembre 2026 : le compte Auth de Sabrina
-- (09058120-fcde-4af0-979b-9811e52d1ebe, ladogosphere@gmail.com) était rattaché
-- à la fiche de recette a4825987-a3af-4d1f-a869-7758d3ebaf7f « Recette ZZ
-- Contrôle recette boutique », créée le 7 septembre pendant la recette d'APP 13.
-- Cette fiche porte 4 factures, 5 ventes, 3 commandes et 1 adhésion de recette,
-- plus le chien Pixel (258cc292-174d-465d-963d-8d1629ff50bb) saisi le
-- 15 septembre en croyant être sur sa propre fiche.
--
-- Rien n'est supprimé : les pièces de recette restent sur la fiche de recette,
-- qui devient une archive comme les autres. Seuls le chien et le rattachement
-- du compte bougent.
--
-- L'ORDRE compte. L'index unique partiel sur clients.auth_user_id refuse deux
-- fiches pour un même compte : la fiche de recette est débranchée AVANT que la
-- nouvelle soit rattachée. C'est pour cela que tout tient dans un bloc
-- procédural et non dans un enchaînement de CTE, dont l'ordre d'exécution n'est
-- pas garanti.
--
-- profiles.role n'est jamais touché : Sabrina reste admin.
-- Aucune écriture comptable n'est créée, modifiée ni supprimée.

begin;

do $$
declare
  c_fiche_recette constant uuid := 'a4825987-a3af-4d1f-a869-7758d3ebaf7f';
  c_compte_admin  constant uuid := '09058120-fcde-4af0-979b-9811e52d1ebe';
  c_pixel         constant uuid := '258cc292-174d-465d-963d-8d1629ff50bb';
  c_employe_rh    constant uuid := '316521ea-62e8-49e5-b0be-425a73b48c6d';
  c_motif         constant text :=
    'Correction du 16 septembre 2026 : le compte admin était rattaché à une fiche de recette';

  v_fiche_interne uuid;
  v_telephone     text;
  v_adresse       text;
  v_nom_avant     text;
  v_client_avant  uuid;
begin
  -- Garde-fou : le script ne vaut que pour l'état constaté. Si la base a
  -- changé entre le constat et l'exécution, on préfère ne rien faire.
  if not exists (
    select 1 from public.clients
    where id = c_fiche_recette and auth_user_id = c_compte_admin
  ) then
    raise exception 'La fiche de recette % n''est plus rattachée au compte %', c_fiche_recette, c_compte_admin;
  end if;

  if exists (select 1 from public.clients where lower(email) = 'ladogosphere@gmail.com') then
    raise exception 'Une fiche porte déjà ladogosphere@gmail.com : rien à créer';
  end if;

  -- Coordonnées reprises de la fiche d'employée, si elles y sont.
  select telephone, adresse into v_telephone, v_adresse
  from public.employes_rh where id = c_employe_rh;

  -- a. La fiche interne de Sabrina. Ni membre, ni locataire de box.
  --    Elle est créée SANS rattachement : celui-ci vient en d, après le
  --    débranchement de la fiche de recette.
  insert into public.clients (prenom, nom, email, telephone, adresse, interne, locataire_box, membre, actif)
  values ('Sabrina', 'Jean', 'ladogosphere@gmail.com', v_telephone, v_adresse, true, false, false, true)
  returning id into v_fiche_interne;

  -- b. Pixel suit. Ses lignes liées portent chien_id et non client_id : elles
  --    le suivent d'elles-mêmes. Au 16 septembre il n'a ni réservation ni
  --    journée d'essai, seulement une ligne d'entente sur lui-même.
  select client_id into v_client_avant from public.chiens where id = c_pixel;
  update public.chiens set client_id = v_fiche_interne where id = c_pixel;

  -- c. La fiche de recette est débranchée et devient une archive. Factures,
  --    ventes, commandes et adhésion de recette restent en place.
  select nom into v_nom_avant from public.clients where id = c_fiche_recette;
  update public.clients
  set auth_user_id = null,
      nom = 'ZZ Contrôle recette boutique (archive)'
  where id = c_fiche_recette;

  -- d. Le compte admin rejoint sa vraie fiche. L'index unique passe : plus
  --    aucune autre fiche ne le porte.
  update public.clients set auth_user_id = c_compte_admin where id = v_fiche_interne;

  -- e. Trace, sur chacun des trois objets déplacés.
  insert into public.journal_evenements (entite, entite_id, evenement, avant, apres, motif, user_id)
  values
    ('clients', v_fiche_interne, 'fiche_interne_creee',
     null,
     jsonb_build_object(
       'prenom', 'Sabrina', 'nom', 'Jean', 'email', 'ladogosphere@gmail.com',
       'interne', true, 'membre', false, 'locataire_box', false,
       'auth_user_id', c_compte_admin),
     c_motif, c_compte_admin),

    ('clients', c_fiche_recette, 'compte_auth_detache',
     jsonb_build_object('auth_user_id', c_compte_admin, 'nom', v_nom_avant),
     jsonb_build_object('auth_user_id', null, 'nom', 'ZZ Contrôle recette boutique (archive)'),
     c_motif, c_compte_admin),

    ('chiens', c_pixel, 'chien_change_de_fiche',
     jsonb_build_object('client_id', v_client_avant),
     jsonb_build_object('client_id', v_fiche_interne),
     c_motif, c_compte_admin);

  raise notice 'Fiche interne créée : %', v_fiche_interne;
end
$$;

commit;
