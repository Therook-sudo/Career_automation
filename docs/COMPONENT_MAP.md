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
  * Sourcing and seeding European and international MSc programmes (`SEED_PROGRAMMES`) and linked fully-funded scholarships.
  * Writing programme metadata into `programmes` (`UPSERT` on `main_link`) and scholarship metadata into `scholarships` (`UPSERT` on `application_link`) with dynamic deadlines (`now + 4 months`).
* **Talks to**:
  * Supabase Client (`supabase.from('programmes')`, `supabase.from('scholarships')`).
* **Does NOT own**:
  * Recurring 6-hour interval execution (this sweep executes **only once at startup** via `setTimeout` and is referenced in `/help` via `/fetch_schools`).
  * Checklist generation (owned by `checklistGenerator.ts`) or SOP drafting (owned by `sopGenerator.ts`).
* **Failure Modes & Degradation**:
  * *Database Upsert Failure / Startup Rejection*: If a database upsert fails on a programme or scholarship record, the loop suppresses the error and skips incrementing `progInserted`/`scholInserted`; the function completes and returns `{ programmesCount, scholarshipsCount }` with a console log summary. Any unhandled rejection during the startup sweep is caught by `.catch()` in `src/bot/index.ts:560` and logged to console (`console.error('Initial school fetch error:', err)`). No user-facing Telegram notification or bot alert is dispatched.

#### C. Job Liveness & Dead Board Prober (`src/services/livenessChecker.ts`)
* **Owns**:
  * Performing HTTP `GET` requests against up to 20 listings in `jobs` with `status = 'open'` (`limit(20)`).
  * Checking response status and body markers (`404`, `410`, `'job is no longer available'`, `'position has been filled'`, `'this job has expired'`) to detect dead listings.
  * Updating dead listings to `status = 'closed'` in the `jobs` table.
* **Talks to**:
  * Target job URLs via Axios (**6000ms timeout**, browser User-Agent, `validateStatus: (status) => status < 500`).
  * Supabase Client (`supabase.from('jobs')`).
* **Does NOT own**:
  * Deleting job records (only updates `status = 'closed'` to preserve historical tracking).
  * Continuous crawling (invoked once at startup with 5s delay, every 24 hours via `setInterval` in `src/bot/index.ts`, or on demand via `/check_liveness`).
* **Failure Modes & Degradation**:
  * *Network Timeout / Connection Refused / 5xx Server Errors*: Non-404 network failures and timeouts are caught and ignored without marking the job closed, preserving the `open` status to avoid false-positive closures on temporary network blips.

---

### 2.3 AI Orchestration Engine (`gemini-1.5-flash`)

All AI services instantiate `GoogleGenerativeAI({ model: 'gemini-1.5-flash' })` with deterministic prompt guardrails.

#### A. Job Fit Evaluator (`src/services/jobEvaluator.ts`)
* **Owns**:
  * Computing 1–5 Star match scores, matched skills, skill gaps, red flags, and fit summaries between `user_profile` candidate skills and target `jobs` listing.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Supabase Client (`user_profile`, `jobs`).
* **Does NOT own**:
  * Updating baseline candidate resume text (owned by `user_profile`).
* **Failure Modes & Degradation**:
  * *Missing `GEMINI_API_KEY` (`!genAI`)*: Evaluates candidate skills against `job.tech_stack_tags`, computing rule-based score `score = Math.min(5, Math.max(1, Math.round((matched.length / (requiredTags.length || 1)) * 5)))`, returning `{ match_score: score || 4, matched_skills: matched.length ? matched : ['Kubernetes', 'Docker', 'AWS'], skill_gaps: gaps, red_flags: [], fit_summary: 'Strong alignment on core DevOps & Cloud infrastructure stack.' }`.
  * *Gemini Runtime Error / JSON Parse Error*: Catches error, logs `console.error('⚠️ Job evaluation error:', err.message)`, and returns fallback object `{ match_score: 4, matched_skills: job.tech_stack_tags || ['Kubernetes', 'Docker'], skill_gaps: [], red_flags: [], fit_summary: 'DevOps & Cloud alignment.' }`.

#### B. Resume Tailoring Engine (`src/services/aiTailor.ts`)
* **Owns**:
  * Generating tailored 3-sentence summary, aligned keywords, and customized bullet points for target `job_id`.
  * Inserting/updating `job_applications` record with initial status `planning`, `application_channel: 'portal'`, and `date_applied: new Date().toISOString()`.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Supabase Client (`user_profile`, `jobs`, `job_applications`).
* **Does NOT own**:
  * Physical PDF/DOCX rendering or export.
* **Failure Modes & Degradation**:
  * *Missing `GEMINI_API_KEY` (`!genAI`)*: Generates mock tailored output with tailored summary, keywords from `job.tech_stack_tags` (or `['Kubernetes', 'Docker', 'AWS', 'Terraform', 'CI/CD']`), and 3 static bullets (Kubernetes infrastructure, Terraform automation reducing downtime by 40%, DevSecOps image scanning), saves record to `job_applications` with `status: 'planning'`, and returns mock result.
  * *Gemini API Runtime / Parse Failure*: Logs `console.error('⚠️ Gemini AI Tailoring error:', error.message)` and throws error; `/apply` bot command catches and alerts user: `"⚠️ Error tailoring resume: <error_message>"`.

#### C. STAR Interview Prep Generator (`src/services/interviewPrep.ts`)
* **Owns**:
  * Synthesizing structured Situation-Task-Action-Result stories and 3 high-probability technical interview questions for target role.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Supabase Client (`jobs`, `user_profile`).
* **Does NOT own**:
  * Application tracking or state mutation.
* **Failure Modes & Degradation**:
  * *Missing `GEMINI_API_KEY` (`!genAI`)*: Returns 2 hardcoded STAR stories (Downtime reduction via Terraform/K8s CI/CD, and Container DevSecOps scanning via Trivy) plus 3 core technical questions (zero-downtime K8s rollouts, Terraform team state management, microservice secrets security).
  * *Gemini API Runtime / Parse Failure*: Logs `console.error('⚠️ Interview prep generation error:', err.message)` and throws error; `/prep` bot command catches and alerts user: `"⚠️ Error generating interview prep: <error_message>"`.

#### D. Application Form Answer Assistant (`src/services/applicationAnswers.ts`)
* **Owns**:
  * Generating grounded 60–120 word portal form answers matching candidate cloud experience to custom questions.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Supabase Client (`jobs`, `user_profile`).
* **Does NOT own**:
  * Automated form submission into third-party applicant portals.
* **Failure Modes & Degradation**:
  * *Missing `GEMINI_API_KEY` (`!genAI`)*: Returns static template answer string referencing candidate's hands-on Kubernetes, Terraform, and cloud infrastructure experience.
  * *Gemini API Runtime / Generation Failure*: Internal catch block logs `console.error('⚠️ Application answer error:', err.message)` and returns fallback string: `"I am enthusiastic about the ${role} role at ${company}. My technical background in Cloud Architecture, Kubernetes, and automated CI/CD enables me to add immediate value to your infrastructure team."` without throwing or crashing the bot.

#### E. Document Checklist Generator (`src/services/checklistGenerator.ts`)
* **Owns**:
  * Extracting required admission items from programme notes, calculating due dates based on buffer days before deadline (`now + 3 months`), and inserting structured tasks into `tasks` table with `status: 'pending'`.
  * Creating/getting `scholarship_applications` record with initial status `planning`.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Supabase Client (`programmes`, `scholarship_applications`, `tasks`, `user_profile`).
* **Does NOT own**:
  * Proactive background push reminders (tasks are stored in the database and queried on-demand via `/tasks`).
* **Failure Modes & Degradation**:
  * *Missing `GEMINI_API_KEY` (`!genAI`)*: Generates a fixed 6-task checklist (SOP draft [45d, urgent], Academic Recommendation Letters [40d, high], Official Transcripts & Apostille [35d, high], IELTS/TOEFL English test [30d, medium], Europass CV format [20d, medium], Online portal submission [7d, urgent]).
  * *Gemini API Runtime / JSON Parse Failure*: Catches error, logs `console.error('⚠️ Gemini Checklist extraction error:', err.message)`, and falls back to a 2-task array (Draft SOP [30d, urgent], Recommendation letters [25d, high]), persisting tasks to `tasks` table.

#### F. Statement of Purpose (SOP) Generator (`src/services/sopGenerator.ts`)
* **Owns**:
  * Drafting 500–700 word academic SOPs connecting DevOps experience to university curriculum.
  * Saving drafted SOP in `scholarship_applications.sop_draft` (with `status: 'planning'`).
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Supabase Client (`programmes`, `user_profile`, `scholarship_applications`).
* **Does NOT own**:
  * University application submission.
* **Failure Modes & Degradation**:
  * *Missing `GEMINI_API_KEY` (`!genAI`)*: Generates structured template SOP referencing applicant name, target programme, university, and country; persists draft to `scholarship_applications`.
  * *Gemini API Runtime Error*: Logs `console.error('⚠️ Gemini SOP Generator error:', err.message)` and throws error; `/sop` bot command catches and alerts user: `"⚠️ Error generating SOP: <error_message>"`.

#### G. Weekly Metrics & Velocity Engine (`src/services/metricsEngine.ts`)
* **Owns**:
  * Aggregating 7-day funnel metrics: sourced jobs count (`gte('created_at', weekStart)`), applications count, responses count (`status = 'interview'`), active interviews count, outreach sent count (`status = 'sent'`), and email reply rate.
  * Calculating ghosting rate as the percentage of `job_applications` older than 14 days still marked `applied`.
  * Reporting baseline average response latency (constant `avgResponseDays = 4.5`).
  * Calling Gemini AI to produce strategic synthesis and insights summary.
  * Persisting weekly rollups into `metrics` table (`UNIQUE(category, week_start)`).
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Supabase Client (`jobs`, `job_applications`, `email_outreach`, `metrics`).
* **Does NOT own**:
  * Daily scheduled task reminders.
* **Failure Modes & Degradation**:
  * *Missing `GEMINI_API_KEY` (`!genAI`)*: Formats deterministic metrics template string with counts, reply rate, 4.5d response latency, and ghosting rate; upserts record to `metrics`.
  * *Gemini Synthesis Failure*: Catches error, logs `console.error('⚠️ Gemini Metrics digest error:', err.message)`, sets summary to concise numerical activity string, and completes upsert into `metrics` table.

---

### 2.4 Outreach & Lead Discovery Layer

#### A. Recruiter Lead Discovery (`src/services/leadFinder.ts`)
* **Owns**:
  * Proposing hiring manager / technical recruiter contact profiles based on target company.
  * Inserting or reusing records in `contacts` table (`name`, `role_title`, `company`, `email`, `confidence_score: 0.85`, `source: 'Automated Lead Finder'`).
* **Talks to**:
  * Supabase Client (`contacts`).
* **Does NOT own**:
  * Email sequence scheduling or dispatch.
* **Failure Modes & Degradation**:
  * *Database Error*: Throws `Error('Failed to create contact for company <company>')`, caught and reported by `/outreach` command handler.

#### B. Outreach Email Service (`src/services/emailOutreach.ts`)
* **Owns**:
  * `draftPersonalizedEmail`: Generates cold email draft via Gemini AI or 4-stage fallback templates (Stage 1: initial outreach, Stage 2: short reminder, Stage 3: value-add project link, Stage 4: breakup email).
  * `scheduleOutreachEmail`: Inserts an outreach record into `email_outreach` with `status: 'scheduled'`, `channel: 'email'`, and `follow_up_sequence_id: sequenceStage` (invoked by `/outreach` command).
  * `sendOutreachEmail`: Helper method to dispatch emails via Resend API using `OUTREACH_SENDER_EMAIL` (default `'onboarding@resend.dev'`), updating status to `'sent'` on success or `'bounced'` on error.
  * `cancelSequenceOnReply`: Helper method to update pending records for a contact to `status: 'cancelled'`.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Resend API, Supabase Client (`email_outreach`, `contacts`, `jobs`, `user_profile`).
* **Does NOT own (Explicit Boundary)**:
  * Automated background dispatch daemon or external inbound webhook receiver (the codebase schedules Stage 1 records upon `/outreach`; `sendOutreachEmail` and `cancelSequenceOnReply` are defined service functions with no active background scheduler or webhook daemon wired in runtime).
* **Failure Modes & Degradation**:
  * *Missing `RESEND_API_KEY` (`!resend`)*: Simulates email send and transitions status to `'sent'` with console warning.
  * *Resend API Error*: Transitions status to `'bounced'` in `email_outreach`.

---

### 2.5 Runtime, Interfaces & Deployment Layer

#### A. Telegraf Telegram Bot Worker (`src/bot/index.ts`)
* **Owns**:
  * Private user authorization middleware (`TELEGRAM_ALLOWED_USER_ID`).
  * Startup sweeps (runs `runJobSourcingPipeline`, `runScholarshipSourcingPipeline`, `checkJobsLiveness` after 5-second initial delay).
  * Recurring schedulers: `setInterval` for job sourcing (every 6 hours) and `setInterval` for liveness checks (every 24 hours).
  * Command dispatch and text message listeners.
* **Talks to**:
  * Telegram Bot API (Long Polling via `bot.launch()`), Internal services in `src/services/`, Supabase Client.
* **Does NOT own**:
  * Web dashboard rendering or n8n workflow execution.
* **Failure Modes & Degradation**:
  * *Telegram 409 Conflict*: Process terminates; Docker daemon automatically restarts container.

#### B. Web Dashboard (`dashboard/index.html` on Nginx `:8080`)
* **Owns**:
  * Client-side visual Kanban board (`Planning`, `Applied`, `Interviewing`, `Offers`) and data tables for MSc programmes and outreach records.
* **Talks to**:
  * Supabase REST API via `@supabase/supabase-js` browser client.
* **Does NOT own**:
  * Backend AI dispatch or automated background syncing.
* **Failure Modes & Degradation**:
  * *Static Configuration & Connection State*: The frontend ships with static placeholder credentials (`SUPABASE_URL = "https://YOUR_SUPABASE_PROJECT_ID.supabase.co"` and `SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY"`). If `SUPABASE_URL` is not configured or `supabaseClient` is null, `refreshData()` silently aborts; the dashboard remains in its static initial state (all stat card counts display `'0'`, and tables retain initial static placeholder rows `"Loading programmes..."` and `"Loading outreach history..."`). If an active Supabase client fails or encounters a connection drop during `refreshData()`, rendering is skipped without displaying any error banner or reload prompt.

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

## 4. Verbatim Telegram Command & Interface Registry

The Telegram bot (`src/bot/index.ts`) registers command handlers, message listeners, and advertised help menu actions as follows:

### 4.1 Registered Command Handlers & Listeners

| Command / Handler | Registration Type | Functional Purpose |
| :--- | :--- | :--- |
| `/start` | `bot.start` | Initializes user session and outputs welcome guidance. |
| `/help` | `bot.help` | Prints complete command reference manual across all pipelines. |
| `/fetch_jobs` | `bot.command('fetch_jobs')` | Executes immediate job sourcing sweep (RemoteOK, WWR, Google Alerts). |
| `/check_liveness`| `bot.command('check_liveness')` | Runs HTTP probe on open jobs, marking 404/expired postings as `closed`. |
| `/dashboard` | `bot.command('dashboard')` | Returns aggregated count metrics across jobs, applications, and tasks. |
| `/jobs` | `bot.command('jobs')` | Queries open jobs and dynamically computes 1–5⭐ Gemini match scores. |
| `/apply <job_id>` | `bot.command('apply')` | Tailors CV summary & bullets for `job_id`, creating `job_applications` record with status `planning`. |
| `/prep <job_id>` | `bot.command('prep')` | Generates STAR-method interview stories & technical questions for `job_id`. |
| `/answer <job_id> <q>` | `bot.command('answer')` | Drafts grounded 60–120 word response for custom portal form question. |
| `/outreach <job_id>` | `bot.command('outreach')` | Discovers recruiter lead and schedules initial cold email draft in database. |
| `/schools` | `bot.command('schools')` | Queries and lists tracked European & UK MSc programmes. |
| `/scholarships` | `bot.command('scholarships')` | Queries and lists fully-funded scholarships ordered by deadline. |
| `/checklist <school_id>` | `bot.command('checklist')` | Generates AI document preparation checklist and saves items to `tasks`. |
| `/sop <school_id>` | `bot.command('sop')` | Generates tailored Statement of Purpose for `school_id` and saves to `scholarship_applications`. |
| `/tasks` | `bot.command('tasks')` | Queries and lists active checklist tasks from `tasks` table on demand. |
| `/report` | `bot.command('report')` | Computes 7-day velocity, response latency, ghosting rates, and AI synthesis. |
| `/sop_sample <text>` | `bot.command('sop_sample')` | Stores user's writing style sample in `user_profile.parsed_json`. |
| *Direct CV Text Paste*| `bot.on('text')` | Intercepts pasted CV text (>100 chars) and updates `user_profile.raw_resume_text`. |

### 4.2 Advertised `/help` Menu Actions & Resolution Mapping

The bot's `/help` text advertises 18 command entries to users. The table below maps each advertised command to its implementation resolution in the codebase:

| Advertised `/help` Command | Advertised Description | Code Implementation Resolution |
| :--- | :--- | :--- |
| `/jobs` | Show recent DevOps jobs with 1-5⭐ score & skill gaps | Handled by `bot.command('jobs')`. |
| `/jobs_remote` | Show remote-only job listings | Advertised in `/help`; listings sourced via `/jobs` are all remote-tagged (`is_remote: true`). |
| `/fetch_jobs` | Run automated job scrapers now | Handled by `bot.command('fetch_jobs')`. |
| `/check_liveness` | Verify open job links & mark expired as closed | Handled by `bot.command('check_liveness')`. |
| `/apply <job_id>` | Tailor CV & create application record | Handled by `bot.command('apply')`. |
| `/prep <job_id>` | STAR Method interview prep stories | Handled by `bot.command('prep')`. |
| `/answer <job_id> <q>` | Answer portal form questions | Handled by `bot.command('answer')`. |
| `/outreach <job_id>` | Discover recruiter & schedule email | Handled by `bot.command('outreach')`. |
| `/outreach_pending` | Show cold emails waiting to send | Advertised in `/help`; pending cold emails are stored with `status: 'scheduled'` in `email_outreach` table and viewed on the Web Dashboard `/tab-outreach`. |
| `/schools` | Show upcoming MSc programmes | Handled by `bot.command('schools')`. |
| `/scholarships` | Show fully-funded scholarships | Handled by `bot.command('scholarships')`. |
| `/fetch_schools` | Run school sourcing sweep | Advertised in `/help`; scholarship sourcing executes automatically once at startup via `runScholarshipSourcingPipeline()`. |
| `/checklist <school_id>` | Generate AI task checklist | Handled by `bot.command('checklist')`. |
| `/sop <school_id>` | Generate Statement of Purpose (SOP) | Handled by `bot.command('sop')`. |
| `/dashboard` | Live 7-day pipeline summary | Handled by `bot.command('dashboard')`. |
| `/tasks` | Daily tasks & deadline checklist | Handled by `bot.command('tasks')`. |
| `/report` | Weekly AI synthesis & funnel velocity digest | Handled by `bot.command('report')`. |
| `/resume` | View or update your base CV profile | Unimplemented as a slash command. There is no `bot.command('resume')` handler, and the `bot.on('text')` listener explicitly ignores slash commands via `if (text.startsWith('/')) return next()`. Profile text updates are instead performed exclusively by sending un-prefixed CV text (>100 characters containing 'experience', 'skills', or 'education') to the text message listener. |

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
