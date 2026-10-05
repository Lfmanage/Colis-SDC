-- Colis SDC : à coller dans Supabase → SQL Editor → Run (une seule fois).
-- Déjà lancé une ancienne version ? Relance celle-ci une fois : elle ajoute la règle qui permet d'effacer vraiment un colis (rien n'est perdu).

create table if not exists public.colis (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  numero       text,                       -- n° d'étiquette, ex. 203-458-1
  commande     text,                       -- n° de commande, ou STOCK pour un colis du stock
  lieu         text,
  epaisseur    numeric,
  largeur      numeric,
  longueur     numeric,
  pieces       integer,
  autres       jsonb not null default '[]',  -- longueurs en plus dans le même colis : [{"pieces":20,"longueur":4.5}]
  choix        text,
  essence      text,
  nature       text,
  options      text[] not null default '{}',
  ref_client   text,
  observation  text,
  statut       text not null default 'a_etiqueter'
               check (statut in ('a_etiqueter','a_sortir')),   -- a_etiqueter = en attente de pointage ; a_sortir = pointé
  cree_le      timestamptz not null default now(),
  etiquete_le  timestamptz,                -- date et heure du pointage
  maj_le       timestamptz not null default now(),
  supprime     boolean not null default false
);

-- Déjà créé avec une ancienne version ? Cette ligne ajoute les longueurs multiples (sans rien perdre) :
alter table public.colis add column if not exists autres jsonb not null default '[]';

-- Un même n° d'étiquette ne peut exister qu'une fois
create unique index if not exists colis_numero_unique
  on public.colis (user_id, numero) where numero is not null and supprime = false;
create index if not exists colis_maj on public.colis (user_id, maj_le);

-- Réglages d'apparence (couleurs)
create table if not exists public.reglages (
  user_id  uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  valeurs  jsonb not null default '{}',
  maj_le   timestamptz not null default now()
);

-- Sécurité : chacun ne voit et ne modifie que ses propres données
alter table public.colis    enable row level security;
alter table public.reglages enable row level security;
drop policy if exists colis_lire on public.colis;      drop policy if exists colis_creer on public.colis;      drop policy if exists colis_modifier on public.colis;      drop policy if exists colis_supprimer on public.colis;
drop policy if exists reglages_lire on public.reglages; drop policy if exists reglages_creer on public.reglages; drop policy if exists reglages_modifier on public.reglages;
create policy colis_lire        on public.colis    for select using (auth.uid() = user_id);
create policy colis_creer       on public.colis    for insert with check (auth.uid() = user_id);
create policy colis_modifier    on public.colis    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy colis_supprimer   on public.colis    for delete using (auth.uid() = user_id);   -- permet d'effacer vraiment un colis supprimé dans l'appli
create policy reglages_lire     on public.reglages for select using (auth.uid() = user_id);
create policy reglages_creer    on public.reglages for insert with check (auth.uid() = user_id);
create policy reglages_modifier on public.reglages for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
