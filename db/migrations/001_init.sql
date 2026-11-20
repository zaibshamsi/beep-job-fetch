-- BeepJobFetch initial schema (SQL Server)
-- JSON columns are NVARCHAR(MAX) holding JSON text (validated with ISJSON).

CREATE TABLE sources (
  name            NVARCHAR(60)  NOT NULL PRIMARY KEY,
  description     NVARCHAR(400) NULL,
  homepage        NVARCHAR(400) NULL,
  access_method   NVARCHAR(40)  NULL,           -- 'official_api' | 'public_ats_api' | 'html' | 'jsonld' | 'feed'
  terms_url       NVARCHAR(400) NULL,
  terms_status    NVARCHAR(40)  NOT NULL DEFAULT 'unchecked',  -- 'allowed' | 'allowed_with_limits' | 'forbidden' | 'unclear' | 'unchecked'
  terms_notes     NVARCHAR(MAX) NULL,
  robots_checked_at DATETIME2   NULL,
  enabled         BIT           NOT NULL DEFAULT 1,
  last_run_at     DATETIME2     NULL,
  last_status     NVARCHAR(20)  NULL
);

CREATE TABLE pipeline_runs (
  id           BIGINT IDENTITY(1,1) PRIMARY KEY,
  trigger_type NVARCHAR(20)  NOT NULL,          -- 'cron' | 'manual' | 'startup'
  status       NVARCHAR(20)  NOT NULL,          -- 'running' | 'success' | 'partial' | 'failed'
  stage        NVARCHAR(40)  NULL,              -- current stage while running
  started_at   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
  finished_at  DATETIME2     NULL,
  stats        NVARCHAR(MAX) NULL CHECK (stats IS NULL OR ISJSON(stats) = 1),
  error        NVARCHAR(MAX) NULL
);

CREATE TABLE raw_posts (
  id            BIGINT IDENTITY(1,1) PRIMARY KEY,
  run_id        BIGINT        NOT NULL REFERENCES pipeline_runs(id),
  source        NVARCHAR(60)  NOT NULL,
  source_job_id NVARCHAR(300) NOT NULL,
  payload       NVARCHAR(MAX) NOT NULL,
  content_hash  CHAR(64)      NOT NULL,
  fetched_at    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_raw_posts_source ON raw_posts(source, source_job_id);
CREATE INDEX ix_raw_posts_run ON raw_posts(run_id);

CREATE TABLE cities (
  id      INT IDENTITY(1,1) PRIMARY KEY,
  name    NVARCHAR(80)  NOT NULL UNIQUE,
  state   NVARCHAR(80)  NOT NULL,
  lat     FLOAT         NOT NULL,
  lng     FLOAT         NOT NULL,
  aliases NVARCHAR(MAX) NOT NULL DEFAULT '[]' CHECK (ISJSON(aliases) = 1),
  tier    TINYINT       NOT NULL DEFAULT 2
);

CREATE TABLE jobs (
  id                     BIGINT IDENTITY(1,1) PRIMARY KEY,
  title                  NVARCHAR(300)  NOT NULL,
  company                NVARCHAR(300)  NOT NULL,
  company_norm           NVARCHAR(300)  NOT NULL,
  title_norm             NVARCHAR(300)  NOT NULL,
  description            NVARCHAR(MAX)  NULL,
  apply_url              NVARCHAR(1000) NOT NULL,
  url_hash               CHAR(64)       NOT NULL,
  location_raw           NVARCHAR(500)  NULL,
  employment_type_raw    NVARCHAR(200)  NULL,
  compensation_raw       NVARCHAR(500)  NULL,
  posted_at              DATETIME2      NULL,
  primary_source         NVARCHAR(60)   NOT NULL,
  -- enrichment
  role_category          NVARCHAR(60)   NULL,
  job_type               NVARCHAR(20)   NULL,
  work_mode              NVARCHAR(10)   NULL,
  is_fresher             BIT            NOT NULL DEFAULT 1,
  exp_min_years          FLOAT          NULL,
  exp_max_years          FLOAT          NULL,
  stipend_min_monthly_inr INT           NULL,
  stipend_max_monthly_inr INT           NULL,
  skills                 NVARCHAR(MAX)  NULL CHECK (skills IS NULL OR ISJSON(skills) = 1),
  confidence             FLOAT          NULL,
  needs_review           BIT            NOT NULL DEFAULT 0,
  tagged_by              NVARCHAR(MAX)  NULL CHECK (tagged_by IS NULL OR ISJSON(tagged_by) = 1),  -- per-field provenance
  prompt_version         NVARCHAR(40)   NULL,
  content_hash           CHAR(64)       NULL,   -- hash of title+company+description+location, for tag cache
  -- lifecycle
  status                 NVARCHAR(10)   NOT NULL DEFAULT 'active',   -- 'active' | 'expired'
  first_seen_at          DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
  last_seen_at           DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
  missed_runs            INT            NOT NULL DEFAULT 0,
  search_text            NVARCHAR(MAX)  NULL,
  CONSTRAINT uq_jobs_url_hash UNIQUE (url_hash)
);
CREATE INDEX ix_jobs_status_seen ON jobs(status, last_seen_at);
CREATE INDEX ix_jobs_dedupe ON jobs(company_norm, status);
CREATE INDEX ix_jobs_role ON jobs(role_category, status);
CREATE INDEX ix_jobs_posted ON jobs(posted_at);

CREATE TABLE job_sources (
  id            BIGINT IDENTITY(1,1) PRIMARY KEY,
  job_id        BIGINT         NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  source        NVARCHAR(60)   NOT NULL,
  source_job_id NVARCHAR(300)  NOT NULL,
  apply_url     NVARCHAR(1000) NOT NULL,
  first_seen_at DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
  last_seen_at  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT uq_job_sources UNIQUE (source, source_job_id)
);
CREATE INDEX ix_job_sources_job ON job_sources(job_id);

CREATE TABLE job_cities (
  job_id  BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  city_id INT    NOT NULL REFERENCES cities(id),
  PRIMARY KEY (job_id, city_id)
);
CREATE INDEX ix_job_cities_city ON job_cities(city_id);
-- Remote-only posts carry job_cities rows with no city; they are found via jobs.work_mode = 'remote'.

CREATE TABLE llm_calls (
  id             BIGINT IDENTITY(1,1) PRIMARY KEY,
  run_id         BIGINT        NULL REFERENCES pipeline_runs(id),
  job_id         BIGINT        NULL,
  purpose        NVARCHAR(30)  NOT NULL,        -- 'tag_jev' | 'tag_llm' | 'search_parse' | 'test'
  provider       NVARCHAR(20)  NOT NULL,        -- 'jev' | 'azure_openai'
  model          NVARCHAR(100) NOT NULL,
  input_tokens   INT           NOT NULL DEFAULT 0,
  output_tokens  INT           NOT NULL DEFAULT 0,
  cached_tokens  INT           NOT NULL DEFAULT 0,
  cost_usd       DECIMAL(12,6) NOT NULL DEFAULT 0,
  latency_ms     INT           NULL,
  prompt_version NVARCHAR(40)  NULL,
  success        BIT           NOT NULL DEFAULT 1,
  error          NVARCHAR(MAX) NULL,
  created_at     DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_llm_calls_run ON llm_calls(run_id, purpose);

CREATE TABLE app_settings (
  [key]      NVARCHAR(100) NOT NULL PRIMARY KEY,
  value      NVARCHAR(MAX) NOT NULL,           -- encrypted for secrets (AES-256-GCM, base64)
  updated_at DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE search_cache (
  query_hash CHAR(64)      NOT NULL PRIMARY KEY,
  query_text NVARCHAR(500) NOT NULL,
  filters    NVARCHAR(MAX) NOT NULL CHECK (ISJSON(filters) = 1),
  created_at DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
  hits       INT           NOT NULL DEFAULT 0
);

-- Hand-check labels for the 50-post accuracy measurement.
CREATE TABLE accuracy_labels (
  job_id            BIGINT       NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  field_name        NVARCHAR(40) NOT NULL,      -- 'role_category' | 'cities' | 'job_type' | 'is_fresher'
  predicted         NVARCHAR(400) NULL,
  correct           BIT          NOT NULL,
  correct_value     NVARCHAR(400) NULL,
  labelled_at       DATETIME2    NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY (job_id, field_name)
);
