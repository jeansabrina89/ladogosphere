-- APP 58 — LA SIGNATURE DES E-MAILS DEVIENT UN RÉGLAGE
--
-- ── CE QUI CHANGE, ET CE QUI NE CHANGE PAS ────────────────────────────────
--
-- La signature au pied de chaque e-mail — nom, fonction, adresse, e-mail,
-- téléphone, site — était écrite en dur dans `emailTemplate`. Changer une
-- ligne demandait une mise en ligne. Elle se règle désormais dans
-- Réglages → E-mails (décision de Sabrina, 29.09.2026).
--
-- Les six valeurs posées ici sont EXACTEMENT la signature d'avant ce lot, au
-- caractère près. Le jour du déploiement, aucun e-mail ne change, et un test
-- compare le HTML rendu à celui d'hier. C'est la seule façon de transformer du
-- code en réglage sans rien casser : on ne demande à personne de retaper ce
-- qui marchait.
--
-- `signature_telephone` naît VIDE, parce qu'il n'y en avait pas. Une ligne
-- vide ne s'affiche pas : le pied de page reste celui d'avant.
--
-- ── LA RAISON SOCIALE N'EST PAS ICI ───────────────────────────────────────
--
-- Elle vient de Réglages → Entreprise, et elle est datée : une pièce émise
-- garde l'identité de sa date. La recopier ici en ferait une seconde source,
-- qui finirait par dire autre chose que les factures.
--
-- ── AUCUN CHANGEMENT DE STRUCTURE ─────────────────────────────────────────
--
-- `parametres` n'a pas de contrainte sur `cle` : six clés de plus ne demandent
-- rien. Cette migration n'écrit que des données — mais elle est écrite ici, et
-- pas posée à la main, pour qu'une base reconstruite depuis le dépôt reparte
-- avec la même signature. Une clé absente se replie d'ailleurs sur sa valeur
-- de départ côté application : la base ne peut pas mutiler un pied de page.
--
-- `on conflict do nothing` : si quelqu'un a déjà réglé la signature depuis
-- l'écran, cette migration ne doit pas la lui reprendre.

insert into public.parametres (cle, valeur, description) values
  ('signature_nom', 'Sabrina Jean',
   'Signature des e-mails — nom affiché en gras, première ligne.'),
  ('signature_fonction', 'Responsable',
   'Signature des e-mails — fonction, affichée après la raison sociale (« {raison sociale} — {fonction} »). Vide : la raison sociale seule.'),
  ('signature_adresse', 'Sion, Valais, Suisse',
   'Signature des e-mails — adresse affichée avec 📍. Vide : la ligne n''apparaît pas.'),
  ('signature_email', 'ladogosphere@gmail.com',
   'Signature des e-mails — adresse affichée avec ✉️, en lien mailto. Les RÉPONSES arrivent sur info@ladogosphere.ch, quel que soit cet affichage.'),
  ('signature_telephone', '',
   'Signature des e-mails — téléphone affiché avec 📞, en lien tel:. Vide : la ligne n''apparaît pas.'),
  ('signature_site', 'https://ladogosphere.ch',
   'Signature des e-mails — site affiché avec 🌐, sans https:// ni barre finale. Vide : la ligne n''apparaît pas.')
on conflict (cle) do nothing;
