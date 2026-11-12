-- Carnet d'annonces immo : schéma Supabase (à coller dans SQL Editor > New query > Run)
-- Bruxelles et Tanger restent dans des tables séparées.
-- Chaque ligne garde le même format que l'appli : id = ID Excel (BXL-001, TNG-001), data = fiche JSON.

create table if not exists public.membres (
  email text primary key
);
-- >>> Remplacez par votre adresse avant d'exécuter <<<
insert into public.membres(email) values ('VOTRE_EMAIL_ICI') on conflict do nothing;

create or replace function public.est_membre() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membres m where lower(m.email) = lower(auth.jwt() ->> 'email'));
$$;

do $$
declare t text;
begin
  foreach t in array array['bxl_annonces','tng_annonces','bxl_suivi','tng_suivi'] loop
    execute format('create table if not exists public.%I (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists lecture on public.%I', t);
    execute format('create policy lecture on public.%I for select to authenticated using (public.est_membre())', t);
  end loop;
  -- Le suivi (statut, note, commentaires, calculs) est modifiable par les membres.
  foreach t in array array['bxl_suivi','tng_suivi'] loop
    execute format('drop policy if exists ecriture on public.%I', t);
    execute format('create policy ecriture on public.%I for all to authenticated using (public.est_membre()) with check (public.est_membre())', t);
  end loop;
  -- Les annonces ne sont écrites que par la synchro (clé service_role, qui contourne la sécurité).
end $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
do $$
declare t text;
begin
  foreach t in array array['bxl_annonces','tng_annonces','bxl_suivi','tng_suivi'] loop
    execute format('drop trigger if exists trg_touch on public.%I', t);
    execute format('create trigger trg_touch before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- Mises à jour en direct entre téléphone et laptop
alter publication supabase_realtime add table public.bxl_suivi, public.tng_suivi, public.bxl_annonces, public.tng_annonces;
