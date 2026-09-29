-- Appli Colis SDC : à coller dans Supabase → SQL Editor → Run (une seule fois)

create table if not exists public.colis (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  numero       text,
  commande     text,
  lieu         text,
  epaisseur    numeric,
  largeur      numeric,
  longueur     numeric,
  pieces       integer,
  choix        text,
  essence      text,
  nature       text,
  options      text[] not null default '{}',
  ref_client   text,
  observation  text,
  statut       text not null default 'a_etiqueter'
               check (statut in ('a_etiqueter','a_sortir','sorti')),
  cree_le      timestamptz not null default now(),
  etiquete_le  timestamptz,
  sorti_le     timestamptz,
  maj_le       timestamptz not null default now(),
  supprime     boolean not null default false
);

-- Un même n° d'étiquette ne peut exister qu'une fois
create unique index if not exists colis_numero_unique
  on public.colis (user_id, numero) where numero is not null and supprime = false;
create index if not exists colis_maj on public.colis (user_id, maj_le);

-- Sécurité : chacun ne voit que ses propres colis
alter table public.colis enable row level security;
drop policy if exists colis_lire on public.colis;
drop policy if exists colis_creer on public.colis;
drop policy if exists colis_modifier on public.colis;
create policy colis_lire     on public.colis for select using (auth.uid() = user_id);
create policy colis_creer    on public.colis for insert with check (auth.uid() = user_id);
create policy colis_modifier on public.colis for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Réglages d'apparence (couleurs) : gardés eux aussi dans Supabase
create table if not exists public.reglages (
  user_id  uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  valeurs  jsonb not null default '{}',
  maj_le   timestamptz not null default now()
);
alter table public.reglages enable row level security;
drop policy if exists reglages_lire on public.reglages;
drop policy if exists reglages_creer on public.reglages;
drop policy if exists reglages_modifier on public.reglages;
create policy reglages_lire     on public.reglages for select using (auth.uid() = user_id);
create policy reglages_creer    on public.reglages for insert with check (auth.uid() = user_id);
create policy reglages_modifier on public.reglages for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
