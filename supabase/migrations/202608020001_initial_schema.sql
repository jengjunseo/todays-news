create extension if not exists pgcrypto;

create table source_articles (
  id text primary key,
  provider text not null,
  category text not null check (category in ('politics', 'society', 'science', 'technology', 'economy')),
  query text not null,
  title text not null,
  normalized_title text not null,
  description text not null,
  canonical_url text not null unique,
  provider_url text not null,
  source_domain text not null,
  published_at timestamptz not null,
  target_date date not null,
  created_at timestamptz not null default now()
);

create table story_clusters (
  id text primary key,
  category text not null check (category in ('politics', 'society', 'science', 'technology', 'economy')),
  target_date date not null,
  representative_title text not null,
  deterministic_score numeric(5,2) not null check (deterministic_score between 0 and 100),
  article_count integer not null check (article_count > 0),
  source_count integer not null check (source_count > 0),
  created_at timestamptz not null default now()
);

create table cluster_articles (
  cluster_id text not null references story_clusters(id) on delete cascade,
  article_id text not null references source_articles(id) on delete cascade,
  primary key (cluster_id, article_id)
);

create table daily_digests (
  id uuid primary key default gen_random_uuid(),
  source_date date not null unique,
  status text not null check (status in ('generating', 'published', 'failed')),
  item_count integer not null default 0 check (item_count between 0 and 10),
  reading_minutes integer not null default 0 check (reading_minutes >= 0),
  generated_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table digest_items (
  id text primary key,
  digest_id uuid not null references daily_digests(id) on delete cascade,
  cluster_id text not null references story_clusters(id),
  category text not null check (category in ('politics', 'society', 'science', 'technology', 'economy')),
  rank integer not null check (rank in (1, 2)),
  headline text not null,
  one_line text not null,
  overview text not null,
  key_points_json jsonb not null,
  analogy text not null,
  why_it_matters text not null,
  socratic_question text not null,
  fact_status text not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  source_ids_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (digest_id, cluster_id),
  unique (digest_id, category, rank)
);

create table daily_nudges (
  id text primary key,
  digest_id uuid not null references daily_digests(id) on delete cascade,
  type text not null check (type in ('morning', 'perspective', 'evening')),
  title text not null,
  notification_body text not null,
  insight_body text not null,
  question text not null,
  primary_item_id text not null references digest_items(id),
  secondary_item_id text references digest_items(id),
  perspective_type text,
  scheduled_for timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (digest_id, type)
);

create table reflections (
  id uuid primary key default gen_random_uuid(),
  digest_item_id text not null unique references digest_items(id) on delete cascade,
  content varchar(5000) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table read_states (
  digest_item_id text primary key references digest_items(id) on delete cascade,
  read_at timestamptz not null default now()
);

create table notification_settings (
  singleton boolean primary key default true check (singleton),
  morning_enabled boolean not null default true,
  morning_time time not null default '07:30',
  perspective_enabled boolean not null default true,
  perspective_time time not null default '12:40',
  evening_enabled boolean not null default true,
  evening_time time not null default '18:30',
  timezone text not null default 'Asia/Seoul' check (timezone = 'Asia/Seoul'),
  updated_at timestamptz not null default now()
);

insert into notification_settings (singleton) values (true) on conflict do nothing;

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table push_deliveries (
  id uuid primary key default gen_random_uuid(),
  nudge_id text not null references daily_nudges(id) on delete cascade,
  subscription_id uuid not null references push_subscriptions(id) on delete cascade,
  idempotency_key text not null unique,
  status text not null check (status in ('pending', 'sent', 'failed', 'revoked')),
  sent_at timestamptz,
  error_message text
);

create table pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  source_date date not null,
  status text not null check (status in ('running', 'published', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metrics_json jsonb not null default '{}'::jsonb,
  error_message text
);

create index source_articles_target_category_idx on source_articles (target_date, category);
create index story_clusters_target_category_score_idx on story_clusters (target_date, category, deterministic_score desc);
create index daily_nudges_due_idx on daily_nudges (status, scheduled_for);
create index push_subscriptions_active_idx on push_subscriptions (revoked_at) where revoked_at is null;
