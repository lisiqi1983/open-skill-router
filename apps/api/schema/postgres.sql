-- Optional Open Skill Router PostgreSQL schema.
-- The M5 HTTP API is file/static-source backed by default; this schema defines
-- a migration target for teams that want a shared database.

create extension if not exists pgcrypto;

create table if not exists skill_sources (
  id bigserial primary key,
  name text not null unique,
  primary_url text not null,
  mirrors jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists skill_snapshots (
  id bigserial primary key,
  source_id bigint references skill_sources(id) on delete cascade,
  generated_at timestamptz not null,
  skills_sha256 text not null,
  skill_count integer not null,
  manifest jsonb not null,
  created_at timestamptz not null default now(),
  unique (source_id, skills_sha256)
);

create table if not exists skills (
  id text primary key,
  source_id bigint references skill_sources(id) on delete set null,
  snapshot_id bigint references skill_snapshots(id) on delete set null,
  locator text not null,
  name text not null,
  display_name text,
  description text not null,
  tags text[] not null default '{}',
  capabilities text[] not null default '{}',
  input_formats text[] not null default '{}',
  output_formats text[] not null default '{}',
  risk_level text not null,
  content_hash text,
  metadata jsonb not null,
  body_excerpt text,
  indexed_at timestamptz not null
);

create table if not exists recommendation_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  privacy_mode text not null default 'balanced',
  task_language text,
  task_domain text,
  task_keywords text[] not null default '{}',
  source_name text,
  selected_skill_id text references skills(id) on delete set null,
  recommendation jsonb not null
);

create table if not exists recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid references recommendation_events(id) on delete set null,
  skill_id text references skills(id) on delete set null,
  accepted boolean,
  task_completed boolean,
  rating integer check (rating between 1 and 5),
  comment text,
  anonymous_tags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Optional vector-search extension point. Enable pgvector before using:
-- create extension if not exists vector;
-- alter table skills add column embedding vector(1536);
