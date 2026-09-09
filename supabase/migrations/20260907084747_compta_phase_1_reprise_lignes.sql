-- Compta phase 1 — reprise : chaque facture existante reçoit ses lignes.
--
-- Source : facture_reservations (montant figé de la ligne), reservation_extras
-- et l'adhésion éventuellement embarquée sur la réservation. Le séjour est le
-- reste : montant de la ligne − extras − adhésion. Une ligne de régularisation
-- rattrape un éventuel écart d'arrondi, pour que la somme des lignes soit
-- TOUJOURS égale au total de la facture. Rejouable : ne fait rien deux fois.

do $$
declare
  f          record;
  lr         record;
  ex         record;
  v_ordre    int;
  v_extras   numeric;
  v_adhesion numeric;
  v_sejour   numeric;
  v_compte   text;
  v_libelle  text;
  v_nb       int;
  v_total    numeric;
  v_ecart    numeric;
begin
  for f in select id, montant_total from public.factures loop
    -- Déjà reprise ?
    if exists (select 1 from public.facture_lignes l where l.facture_id = f.id) then
      continue;
    end if;

    v_ordre := 0;

    for lr in
      select fr.reservation_id, fr.montant, r.type_reservation, r.date_debut, r.date_fin
        from public.facture_reservations fr
        join public.reservations r on r.id = fr.reservation_id
       where fr.facture_id = f.id
       order by r.date_debut, fr.reservation_id
    loop
      select coalesce(sum(e.montant), 0) into v_extras
        from public.reservation_extras e where e.reservation_id = lr.reservation_id;

      select coalesce(sum(c.montant), 0) into v_adhesion
        from public.cotisations_membres c
       where c.reservation_id = lr.reservation_id and c.statut = 'payee';

      select count(*) into v_nb
        from public.reservation_chiens rc where rc.reservation_id = lr.reservation_id;

      v_sejour := round(coalesce(lr.montant, 0) - v_extras - v_adhesion, 2);

      if lr.type_reservation = 'sejour' then
        v_compte  := '3000';
        v_libelle := 'Séjour du ' || to_char(lr.date_debut, 'DD.MM.YYYY')
                     || ' au ' || to_char(lr.date_fin, 'DD.MM.YYYY')
                     || ' — ' || greatest(v_nb, 1) || ' chien'
                     || case when v_nb > 1 then 's' else '' end;
      else
        v_compte  := '3001';
        v_libelle := 'Garderie du ' || to_char(lr.date_debut, 'DD.MM.YYYY')
                     || ' — ' || greatest(v_nb, 1) || ' chien'
                     || case when v_nb > 1 then 's' else '' end;
      end if;

      if v_sejour <> 0 then
        v_ordre := v_ordre + 1;
        insert into public.facture_lignes
          (facture_id, ordre, libelle, quantite, prix_unitaire, compte_produit, reservation_id)
        values (f.id, v_ordre, v_libelle, 1, v_sejour, v_compte, lr.reservation_id);
      end if;

      for ex in
        select e.libelle, e.montant from public.reservation_extras e
         where e.reservation_id = lr.reservation_id order by e.created_at, e.id
      loop
        if ex.montant <> 0 then
          v_ordre := v_ordre + 1;
          insert into public.facture_lignes
            (facture_id, ordre, libelle, quantite, prix_unitaire, compte_produit, reservation_id)
          values (f.id, v_ordre, ex.libelle, 1, ex.montant, '3010', lr.reservation_id);
        end if;
      end loop;

      if v_adhesion <> 0 then
        v_ordre := v_ordre + 1;
        insert into public.facture_lignes
          (facture_id, ordre, libelle, quantite, prix_unitaire, compte_produit, reservation_id, cotisation_id)
        select f.id, v_ordre, 'Adhésion membre', 1, v_adhesion, '3005', lr.reservation_id, c.id
          from public.cotisations_membres c
         where c.reservation_id = lr.reservation_id and c.statut = 'payee'
         limit 1;
      end if;
    end loop;

    -- Facture sans ligne de réservation (facture montée à la main autrefois).
    select coalesce(sum(l.montant), 0) into v_total
      from public.facture_lignes l where l.facture_id = f.id;
    v_ecart := round(coalesce(f.montant_total, 0) - v_total, 2);

    if v_ordre = 0 and v_ecart <> 0 then
      insert into public.facture_lignes
        (facture_id, ordre, libelle, quantite, prix_unitaire, compte_produit)
      values (f.id, 1, 'Prestation', 1, v_ecart, '3000');
    elsif v_ecart <> 0 then
      insert into public.facture_lignes
        (facture_id, ordre, libelle, quantite, prix_unitaire, compte_produit)
      values (f.id, v_ordre + 1, 'Régularisation de reprise', 1, v_ecart, '3010');
    end if;
  end loop;
end $$;

-- Contrôle : la somme des lignes doit égaler le total de chaque facture.
do $$
declare
  v_mauvaises int;
begin
  select count(*) into v_mauvaises
    from public.factures f
   where round(coalesce(f.montant_total, 0), 2)
      <> round((select coalesce(sum(l.montant), 0) from public.facture_lignes l where l.facture_id = f.id), 2);

  if v_mauvaises > 0 then
    raise exception 'Reprise des lignes : % facture(s) dont la somme des lignes ne correspond pas au total.', v_mauvaises;
  end if;
end $$;

-- Les factures reprises portent aussi leurs montants TTC/HT (TVA = 0, phase 2).
update public.factures
   set montant_ttc = montant_total,
       montant_ht  = montant_total
 where montant_ttc is distinct from montant_total;
