-- L'entité de départ est une raison individuelle, pas une Sàrl.
--
-- La reprise d'APP 16b avait posé 'sarl' et recopié la raison sociale depuis
-- les anciens paramètres — donc « La Dogosphère Sàrl ». C'était une déduction,
-- pas un fait : personne n'avait encore tranché. Sabrina l'a fait le
-- 11 septembre 2026, et la première année se passe en raison individuelle.
--
-- On CORRIGE la ligne de départ, on n'en crée pas une seconde. Ce n'est pas un
-- changement d'entité : il n'y a jamais eu de Sàrl. Une seconde ligne aurait
-- raconté une histoire fausse, avec une Sàrl qui aurait existé deux ans.
--
-- La raison sociale est VIDÉE, pas remplacée. Elle doit contenir le nom de
-- famille de la titulaire (art. 945 CO), et sa forme exacte — « La Dogosphère,
-- Sabrina Jean » ou autre — est un choix qui lui appartient. La deviner, c'est
-- la retrouver un jour sur une facture sans savoir qui l'a écrite. Tant qu'elle
-- est vide, les documents portent le nom commercial seul et l'écran des
-- Réglages réclame le reste.
--
-- La Sàrl, elle, est PRÉPARÉE pour le 1er janvier 2027 : le premier exercice
-- réel est 2026 — la première écriture date du 11 juin 2026 — et le 1er janvier
-- qui suit sa fin est donc celui de 2027. Elle ne s'applique pas avant, et
-- Sabrina peut la modifier ou la supprimer d'ici là.

begin;

-- ── 1. La ligne de départ : raison individuelle, raison sociale à choisir ──

update public.entites_juridiques
set forme = 'raison_individuelle',
    raison_sociale = ''
where date_debut = (select min(date_debut) from public.entites_juridiques);

-- ── 2. La trace ───────────────────────────────────────────────────────────
--
-- Une forme juridique qui change décide de ce qui s'imprime sur chaque pièce :
-- elle ne se corrige pas sans que le journal en garde le motif.

insert into public.journal_evenements (entite, entite_id, evenement, avant, apres, motif)
select
  'entite_juridique',
  e.id,
  'identite_corrigee',
  jsonb_build_object('forme', 'sarl', 'raison_sociale', 'La Dogosphère Sàrl'),
  jsonb_build_object('forme', 'raison_individuelle', 'raison_sociale', ''),
  'Décision de Sabrina du 11 septembre 2026 : première année en raison individuelle'
from public.entites_juridiques e
where e.date_debut = (select min(date_debut) from public.entites_juridiques);

-- ── 3. La Sàrl, préparée et pas encore en vigueur ─────────────────────────
--
-- Tout est à null sauf ce qui est décidé : la forme, la date et le nom. L'IDE,
-- l'IBAN et l'adresse de la future société ne sont pas connus aujourd'hui, et
-- les inventer reviendrait à les imprimer un jour sur une vraie facture.

update public.entites_juridiques
set date_fin = date '2027-01-01'
where date_debut = (select min(date_debut) from public.entites_juridiques);

insert into public.entites_juridiques (date_debut, forme, raison_sociale, adresse_pays)
values (date '2027-01-01', 'sarl', 'La Dogosphère Sàrl', 'CH')
on conflict (date_debut) do nothing;

commit;