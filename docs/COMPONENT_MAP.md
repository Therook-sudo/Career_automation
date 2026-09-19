# 🗺️ Path Pilot — System Component Map & Architecture Specification

## 1. Executive Summary
This document defines the formal component ownership contracts, runtime topologies, data models, integration interfaces, and failure mode specifications for **Path Pilot** (Autonomous Career Pipeline & MSc Scholarship Tracker).

---

## 2. Component Ownership Contracts & Failure Mode Matrix

### 2.1 Persistence & Data Storage Layer (`supabase/schema.sql`)

#### A. Relational Database & State Store
* **Owns**:
  * 10 relational tables: `jobs`, `job_applications`, `contacts`, `email_outreach`, `programmes`, `scholarships`, `scholarship_applications`, `tasks`, `metrics`, and `user_profile`.
  * Primary key generation via `uuid_generate_v4()`, foreign-key constraints with `ON DELETE CASCADE` / `SET NULL`.
  * Performance indexes: `idx_jobs_status`, `idx_jobs_posted_date`, `idx_job_apps_status`, `idx_scholarships_deadline`, `idx_tasks_due_date`, and `idx_email_outreach_status`.
  * PL/pgSQL trigger function `update_updated_at_column()` on `jobs`.
* **Talks to**:
  * Hosted Supabase PostgreSQL engine.
  * Node.js microservices via `@supabase/supabase-js` HTTPS REST client.
  * n8n automation engine via PostgreSQL protocol connection.
* **Does NOT own**:
  * Application-level data filtering, AI prompt generation, or scraping execution.
* **Failure Modes & Degradation**:
  * *Database Unreachable / Invalid Credentials*: Supabase client returns an `error` object on query calls. Service functions log the error and return safe fallbacks (empty arrays or default objects); Telegram bot outputs descriptive user-facing warnings (e.g. `"⚠️ Failed to query jobs table"`).

---

### 2.2 Ingestion & Sourcing Layer

#### A. Job Sourcing Engine (`src/services/jobFetcher.ts`)
* **Owns**:
  * Ingestion logic for RemoteOK API, WeWorkRemotely RSS, and 14 Google Alerts RSS feeds (`config/google_alerts.txt`).
  * Keyword relevance filtering (`TITLE_KEYWORDS`) and tag extraction (`TECH_STACK_TAGS`).
  * Deduplicating and writing records into the `jobs` table (`UPSERT` with `onConflict: 'job_url'`).
* **Talks to**:
  * RemoteOK API (`https://remoteok.com/api`).
  * WeWorkRemotely RSS feed (`https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss`).
  * Google Alerts RSS feeds listed in `config/google_alerts.txt` (or `GOOGLE_ALERTS_RSS_URLS` env).
  * Supabase Client (`supabase.from('jobs')`).
* **Does NOT own**:
  * Match scoring or skill gap analysis (owned by `jobEvaluator.ts`).
  * Job application creation (owned by `aiTailor.ts`).
  * Background interval invocation (invoked at startup, on a 6-hour `setInterval` in `src/bot/index.ts`, or via `/fetch_jobs`).
* **Failure Modes & Degradation**:
  * *Feed Unreachable / Network Timeout*: Wrapped in `Promise.allSettled`; failed feeds log warnings to console while healthy feeds proceed without crashing the process.
  * *Database Write Failure*: Errors logged per URL; unwritten jobs are retried on the next sweep. The `/fetch_jobs` command reports actual counts of fetched vs upserted records.

#### B. Scholarship & Programme Sourcing Engine (`src/services/scholarshipFetcher.ts`)
* **Owns**:
  * Sourcing and seeding European and international MSc programmes and linked fully-funded scholarships.
  * Writing programme metadata into `programmes` (`UPSERT` on `main_link`) and scholarship metadata into `scholarships` (`UPSERT` on `application_link`).
* **Talks to**:
  * Supabase Client (`supabase.from('programmes')`, `supabase.from('scholarships')`).
* **Does NOT own**:
  * Recurring 6-hour interval execution (this sweep executes **only once at startup** and on-demand via the `/fetch_schools` command).
  * Checklist generation (owned by `checklistGenerator.ts`) or SOP drafting (owned by `sopGenerator.ts`).
* **Failure Modes & Degradation**:
  * *Database Upsert Failure*: Logs error; Telegram bot alerts user: `"⚠️ Failed to query programmes table"`.

#### C. Job Liveness & Dead Board Prober (`src/services/livenessChecker.ts`)
* **Owns**:
  * Performing HTTP `HEAD`/`GET` requests against all `status = 'open'` listings in `jobs`.
  * Updating dead (404, 410, or page containing closed markers) listings to `status = 'closed'`.
* **Talks to**:
  * Target job URLs via Axios (5000ms timeout, browser User-Agent).
  * Supabase Client (`supabase.from('jobs')`).
* **Does NOT own**:
  * Deleting job records (only updates status to preserve historical tracking).
  * Recurring interval (invoked once at startup, every 24 hours via `setInterval` in `src/bot/index.ts`, or via `/check_liveness`).
* **Failure Modes & Degradation**:
  * *Network Timeout / Connection Refused*: Non-definitive network failures are ignored, preserving the open status to avoid false-positive closures on temporary network blips.

---

### 2.3 AI Orchestration Engine (`gemini-1.5-flash`)

All AI services instantiate `GoogleGenerativeAI({ model: 'gemini-1.5-flash' })` with deterministic prompt guardrails.

#### A. Job Fit Evaluator (`src/services/jobEvaluator.ts`)
* **Owns**:
  * Computing 1–5 Star match scores, matched skills, and missing skill gaps between `user_profile` and target `jobs` listing.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Supabase Client (`user_profile`, `jobs`).
* **Does NOT own**:
  * Updating baseline candidate resume text (owned by `user_profile`).
* **Failure Modes & Degradation**:
  * *Missing API Key / Gemini Rate Limit*: Falls back to keyword matching against `TECH_STACK_TAGS` with default ⭐⭐⭐⭐ rating.

#### B. Resume Tailoring Engine (`src/services/aiTailor.ts`)
* **Owns**:
  * Generating tailored 3-sentence summary, aligned keywords, and re-weighted accomplishment bullets.
  * Inserting `job_applications` record with status `applied`.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Supabase Client (`user_profile`, `jobs`, `job_applications`).
* **Does NOT own**:
  * Physical PDF/DOCX rendering or export.
* **Failure Modes & Degradation**:
  * *Gemini API Failure*: Returns deterministic rule-based bullet points derived directly from baseline profile.

#### C. STAR Interview Prep Generator (`src/services/interviewPrep.ts`)
* **Owns**:
  * Synthesizing 3 structured Situation-Task-Action-Result stories and technical interview questions for target role.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Supabase Client (`jobs`, `user_profile`).
* **Does NOT own**:
  * Application tracking or state mutation.
* **Failure Modes & Degradation**:
  * *API Error*: Returns fallback generic STAR DevOps scenarios (CI/CD outage, Kubernetes migration, AWS IAM hardening).

#### D. Application Form Answer Assistant (`src/services/applicationAnswers.ts`)
* **Owns**:
  * Generating grounded 60–120 word portal form answers matching candidate cloud experience.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Supabase Client (`jobs`, `user_profile`).
* **Does NOT own**:
  * Automated form submission into third-party applicant portals.
* **Failure Modes & Degradation**:
  * *API Error*: Surfaces error message on Telegram: `"⚠️ Error generating answer: <error_message>"`.

#### E. Document Checklist Generator (`src/services/checklistGenerator.ts`)
* **Owns**:
  * Extracting required admission items from programme notes and inserting structured tasks into `tasks` table.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Supabase Client (`programmes`, `tasks`).
* **Does NOT own**:
  * Proactive deadline push notifications (tasks are stored in the database and queried on-demand via `/tasks`).
* **Failure Modes & Degradation**:
  * *API Error*: Inserts default standard 4-tier MSc task checklist (Transcripts, SOP, English Test, Reference Letters).

#### F. Statement of Purpose (SOP) Generator (`src/services/sopGenerator.ts`)
* **Owns**:
  * Drafting 500–700 word academic SOPs connecting DevOps experience to university research curriculum.
  * Reading style guides from `user_profile.parsed_json.sop_sample`.
  * Storing drafted SOP in `scholarship_applications.sop_draft`.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Supabase Client (`programmes`, `user_profile`, `scholarship_applications`).
* **Does NOT own**:
  * University application submission.
* **Failure Modes & Degradation**:
  * *API Error*: Logs error and alerts user: `"⚠️ Error generating SOP: <error_message>"`.

#### G. Weekly Metrics & Velocity Engine (`src/services/metricsEngine.ts`)
* **Owns**:
  * Aggregating 7-day funnel metrics: applications count, interviews, response latency (average days to interview), and ghosting rate (>14 days without status update).
  * Calling Gemini AI to produce strategic synthesis and insights summary.
  * Persisting weekly rollups into `metrics` table (`UNIQUE(category, week_start)`).
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Supabase Client (`jobs`, `job_applications`, `email_outreach`, `metrics`).
* **Does NOT own**:
  * Daily scheduled task reminders.
* **Failure Modes & Degradation**:
  * *Gemini Synthesis Failure*: Returns raw numerical table without AI narrative block; database metrics record is still saved.

---

### 2.4 Outreach & Lead Discovery Layer

#### A. Recruiter Lead Discovery (`src/services/leadFinder.ts`)
* **Owns**:
  * Proposing hiring manager / technical recruiter contact profiles based on target company.
  * Inserting/reusing records in `contacts` table.
* **Talks to**:
  * Supabase Client (`contacts`).
* **Does NOT own**:
  * Email sequence scheduling or dispatch.
* **Failure Modes & Degradation**:
  * *Database Error*: Returns in-memory generic `Hiring Lead <hiring@company.com>` object.

#### B. Outreach Email Service (`src/services/emailOutreach.ts`)
* **Owns**:
  * `draftPersonalizedEmail`: Generates 100-word cold email body via Gemini AI (or fallback templates).
  * `scheduleOutreachEmail`: Inserts an outreach record into `email_outreach` with `status: 'scheduled'` and `follow_up_sequence_id: 1` (invoked by `/outreach` command).
  * `sendOutreachEmail`: Helper method to dispatch emails via Resend API using `OUTREACH_SENDER_EMAIL` (default `'onboarding@resend.dev'`), updating status to `'sent'` on success or `'bounced'` on error.
  * `cancelSequenceOnReply`: Helper method to update pending records for a contact to `status: 'cancelled'`.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Resend API, Supabase Client (`email_outreach`, `contacts`, `jobs`, `user_profile`).
* **Does NOT own (Explicit Boundary)**:
  * Automated background dispatch daemon or external inbound webhook receiver (the codebase schedules Stage 1 records upon `/outreach`; `sendOutreachEmail` and `cancelSequenceOnReply` are defined service functions with no active background scheduler or webhook daemon wired in runtime).
* **Failure Modes & Degradation**:
  * *Missing RESEND_API_KEY*: Simulates send and transitions status to `'sent'` with console warning.
  * *Resend API Error*: Transitions status to `'bounced'` in `email_outreach`.

---

### 2.5 Runtime, Interfaces & Deployment Layer

#### A. Telegraf Telegram Bot Worker (`src/bot/index.ts`)
* **Owns**:
  * Private user authentication (`TELEGRAM_ALLOWED_USER_ID`).
  * Startup sweeps (runs `runJobSourcingPipeline`, `runScholarshipSourcingPipeline`, `checkJobsLiveness` at startup).
  * Recurring schedulers: `setInterval` for job sourcing (every 6 hours) and `setInterval` for liveness checks (every 24 hours).
  * Registering all command handlers and text message listeners.
* **Talks to**:
  * Telegram Bot API (Long Polling via `bot.launch()`), Internal services in `src/services/`, Supabase Client.
* **Does NOT own**:
  * Web dashboard rendering or n8n workflow execution.
* **Failure Modes & Degradation**:
  * *Telegram 409 Conflict*: Process terminates; Docker daemon automatically restarts container.

#### B. Web Dashboard (`dashboard/index.html` on Nginx `:8080`)
* **Owns**:
  * Client-side visual Kanban board (`Planning`, `Applied`, `Interviewing`, `Offers`).
* **Talks to**:
  * Supabase REST API via JavaScript client.
* **Does NOT own**:
  * Backend AI dispatch or automated syncing.
* **Failure Modes & Degradation**:
  * *Supabase Connection Drop*: Renders empty cards with reload prompt.

#### C. n8n Automation Engine (`n8n/google_sheets_sync_workflow.json` on `:5678`)
* **Owns**:
  * 15-minute recurring cron schedule.
  * Executing 4 parallel database query branches and syncing rows to Google Sheets `Path pilot`:
    * Branch 1: `Jobs Pipeline` (matched on `Job URL`)
    * Branch 2: `Cold Outreach` (matched on `Email`)
    * Branch 3: `Schools & Scholarships` (matched on `Application Link`)
    * Branch 4: `Tasks` (matched on `Description`)
* **Talks to**:
  * Supabase PostgreSQL, Google Sheets API.
* **Does NOT own**:
  * Job scraping or AI prompt generation.
* **Failure Modes & Degradation**:
  * *Empty Tables*: Downstream append node is skipped when query returns 0 rows, preventing blank row writes.

---

## 3. Deployment & Container Topology

The system is deployed on a Contabo Linux VPS using Docker Compose alongside existing workloads:

| Container Name | Base Image | Port Mapping | Bound Host Interface | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `pipeline_bot` | `node:22-alpine` | None (Internal) | N/A | Telegram Bot Worker & Schedulers |
| `pipeline_dashboard`| `nginx:alpine` | `8080:80` | `127.0.0.1:8080` | Static Web Kanban Dashboard |
| `n8n_pipeline` | `docker.n8n.io/n8nio/n8n:latest` | `5678:5678` | `127.0.0.1:5678` | 4-Branch Google Sheets Sync Engine |

* Host Nginx terminates SSL via Certbot (Let's Encrypt) and proxies `pipeline.therook.xyz` to `127.0.0.1:8080` and `n8n.therook.xyz` to `127.0.0.1:5678`.
* Environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `RESEND_API_KEY`) are injected via `.env` deployed by GitHub Actions (`.github/workflows/deploy.yml`).

---

## 4. Verbatim Telegram Command Registry

The Telegram bot (`src/bot/index.ts`) explicitly registers the following **17 command handlers and listeners**:

| Command Handler | Registration Type | Functional Purpose |
| :--- | :--- | :--- |
| `/start` | `bot.start` | Initializes user session and outputs welcome guidance. |
| `/help` | `bot.help` | Prints complete command reference manual across all pipelines. |
| `/fetch_jobs` | `bot.command('fetch_jobs')` | Executes immediate job sourcing sweep (RemoteOK, WWR, Google Alerts). |
| `/check_liveness`| `bot.command('check_liveness')` | Runs HTTP probe on open jobs, marking 404/expired postings as `closed`. |
| `/dashboard` | `bot.command('dashboard')` | Returns aggregated count metrics across jobs, applications, and tasks. |
| `/jobs` | `bot.command('jobs')` | Queries open jobs and dynamically computes 1–5⭐ Gemini match scores. |
| `/apply` | `bot.command('apply')` | Tailors CV summary & bullets for specific `job_id`, creating application record. |
| `/prep` | `bot.command('prep')` | Generates 3 STAR-method interview stories & technical questions for `job_id`. |
| `/answer` | `bot.command('answer')` | Drafts grounded 60–120 word response for custom portal form question. |
| `/outreach` | `bot.command('outreach')` | Discovers recruiter lead and schedules initial cold email draft in database. |
| `/schools` | `bot.command('schools')` | Queries and lists tracked European & UK MSc programmes. |
| `/scholarships` | `bot.command('scholarships')` | Queries and lists fully-funded scholarships ordered by deadline. |
| `/checklist` | `bot.command('checklist')` | Generates AI document preparation checklist and saves items to `tasks`. |
| `/sop` | `bot.command('sop')` | Generates tailored 600-word academic Statement of Purpose for `school_id`. |
| `/sop_sample` | `bot.command('sop_sample')` | Stores user's authentic writing style sample in `user_profile.parsed_json`. |
| `/tasks` | `bot.command('tasks')` | Queries and lists active checklist tasks from `tasks` table on demand. |
| `/report` | `bot.command('report')` | Computes 7-day velocity, response latency, ghosting rates, and AI synthesis. |
| *Direct CV Text*| `bot.on('text')` | Intercepts pasted CV text (>100 chars) and updates `user_profile.raw_resume_text`. |

---

## 5. Architectural Decisions & Trade-Offs (ADRs)

### ADR-001: Separation of API Client and Database Ingestion Protocols
* **Context**: Application microservices and n8n interact with Supabase with different connection lifecycle requirements.
* **Decision**: Node.js services utilize `@supabase/supabase-js` over HTTPS REST for stateless operations, while n8n uses PostgreSQL client connections for scheduled batch syncs.
* **Consequences**: Standardized API error handling in Node.js while supporting relational batch querying in n8n.

### ADR-002: Ingestion via Google Alerts RSS Feeds
* **Context**: Direct automated scraping on major career portals triggers Cloudflare bot challenges and IP blocks.
* **Decision**: Ingested curated Google Alerts RSS feeds (`config/google_alerts.txt`), leveraging Google's indexing infrastructure to receive clean XML streams.
* **Consequences**: Avoids headless browser overhead and paid proxy infrastructure.

### ADR-003: Grounded Prompting for AI Resume Tailoring
* **Context**: Generative models tend to fabricate past employment titles, metrics, or technologies when tailoring resumes.
* **Decision**: Constrained Gemini prompts to the candidate's canonical `user_profile` in PostgreSQL, instructing the model to strictly re-order and contextualize verified facts without introducing unlisted technologies.
* **Consequences**: Substantially reduces hallucination risks while producing targeted, ATS-aligned resumes.

### ADR-004: Multi-Stage Node.js 22 Alpine Build for Native Realtime WebSockets
* **Context**: `@supabase/supabase-js` realtime client requires native global `WebSocket` support, which is experimental in Node 20 Alpine.
* **Decision**: Upgraded Dockerfile to **`node:22-alpine`** for both builder and runner stages.
* **Consequences**: Clean runtime execution without auxiliary WebSocket polyfill dependencies, maintaining a lightweight image size (~120MB).
