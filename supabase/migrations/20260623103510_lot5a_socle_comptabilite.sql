-- ============ TABLES ============
create table if not exists public.comptes (
  numero text primary key,
  libelle text not null,
  type text not null check (type in ('actif','passif','produit','charge')),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ecritures (
  id uuid primary key default gen_random_uuid(),
  date_ecriture date not null,
  libelle text not null,
  piece_type text,
  piece_id uuid,
  exercice integer not null,
  contre_passe_id uuid references public.ecritures(id),
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.ecritures_lignes (
  id uuid primary key default gen_random_uuid(),
  ecriture_id uuid not null references public.ecritures(id) on delete restrict,
  compte_numero text not null references public.comptes(numero),
  debit numeric(12,2) not null default 0 check (debit >= 0),
  credit numeric(12,2) not null default 0 check (credit >= 0),
  created_at timestamptz not null default now(),
  constraint ligne_debit_xor_credit check (not (debit > 0 and credit > 0))
);
create index if not exists idx_ecr_lignes_ecriture on public.ecritures_lignes(ecriture_id);
create index if not exists idx_ecr_lignes_compte on public.ecritures_lignes(compte_numero);
create index if not exists idx_ecr_exercice on public.ecritures(exercice);

-- ============ PLAN COMPTABLE (seed) ============
insert into public.comptes (numero, libelle, type) values
  ('1000','Caisse','actif'),
  ('1020','Banque - compte courant','actif'),
  ('1021','Compte de passage Stripe','actif'),
  ('1100','Debiteurs clients','actif'),
  ('1170','TVA - impot prealable','actif'),
  ('2000','Creanciers (fournisseurs)','passif'),
  ('2030','Acomptes clients','passif'),
  ('2035','Avoirs clients','passif'),
  ('2200','TVA due','passif'),
  ('2800','Capital social','passif'),
  ('2979','Resultat de l exercice','passif'),
  ('3000','Sejours (pension)','produit'),
  ('3001','Garderie journee','produit'),
  ('3005','Cotisations et adhesions','produit'),
  ('3200','Ventes de marchandises','produit'),
  ('4200','Achats de marchandises','charge'),
  ('5000','Salaires','charge'),
  ('5700','Charges sociales','charge'),
  ('6000','Loyer','charge'),
  ('6300','Assurances','charge'),
  ('6400','Energie','charge'),
  ('6500','Frais administratifs','charge'),
  ('6570','Informatique et logiciels','charge'),
  ('6600','Marketing','charge'),
  ('6700','Autres charges','charge'),
  ('6940','Frais bancaires et commissions','charge')
on conflict (numero) do nothing;

-- ============ MOTEUR : passer une ecriture equilibree ============
create or replace function public.passer_ecriture(
  p_date date,
  p_libelle text,
  p_piece_type text,
  p_piece_id uuid,
  p_lignes jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ecriture_id uuid;
  v_total_debit numeric(12,2) := 0;
  v_total_credit numeric(12,2) := 0;
  v_ligne jsonb;
begin
  for v_ligne in select * from jsonb_array_elements(p_lignes) loop
    v_total_debit := v_total_debit + coalesce((v_ligne->>'debit')::numeric, 0);
    v_total_credit := v_total_credit + coalesce((v_ligne->>'credit')::numeric, 0);
  end loop;

  if round(v_total_debit, 2) <> round(v_total_credit, 2) then
    raise exception 'Ecriture desequilibree : total debit % <> total credit %', v_total_debit, v_total_credit;
  end if;
  if round(v_total_debit, 2) = 0 then
    raise exception 'Ecriture vide (montant nul)';
  end if;

  insert into public.ecritures (date_ecriture, libelle, piece_type, piece_id, exercice)
  values (p_date, p_libelle, p_piece_type, p_piece_id, extract(year from p_date)::int)
  returning id into v_ecriture_id;

  insert into public.ecritures_lignes (ecriture_id, compte_numero, debit, credit)
  select v_ecriture_id,
         (l->>'compte')::text,
         coalesce((l->>'debit')::numeric, 0),
         coalesce((l->>'credit')::numeric, 0)
  from jsonb_array_elements(p_lignes) as l;

  return v_ecriture_id;
end;
$$;

revoke all on function public.passer_ecriture(date, text, text, uuid, jsonb) from anon, authenticated;

-- ============ INALTERABILITE (append-only) ============
create or replace function public.ecritures_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'Les ecritures comptables sont inalterables : ni modification ni suppression (corriger par contre-passation).';
end;
$$;

drop trigger if exists trg_ecritures_append_only on public.ecritures;
create trigger trg_ecritures_append_only
before update or delete on public.ecritures
for each row execute function public.ecritures_append_only();

drop trigger if exists trg_ecritures_lignes_append_only on public.ecritures_lignes;
create trigger trg_ecritures_lignes_append_only
before update or delete on public.ecritures_lignes
for each row execute function public.ecritures_append_only();

-- ============ RLS (acces service_role uniquement ; lecture via supabaseAdmin cote serveur) ============
alter table public.comptes enable row level security;
alter table public.ecritures enable row level security;
alter table public.ecritures_lignes enable row level security;
