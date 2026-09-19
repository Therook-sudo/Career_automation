# 🗺️ Path Pilot — System Component Map & Ownership Specification

## 1. Executive Summary
This document defines the formal component ownership contracts, data flow boundaries, integration interfaces, and failure mode specifications for **Path Pilot** (Career Automation & MSc Scholarship Tracker).

---

## 2. Component Ownership Contracts & Failure Mode Matrix

### 2.1 Ingestion & Sourcing Layer

#### A. Job Sourcing Engine (`src/services/jobFetcher.ts`)
* **Owns**: 
  * Ingestion logic for RemoteOK API, WeWorkRemotely RSS, and 14 Google Alerts RSS feeds (`config/google_alerts.txt`).
  * Title & tech keyword relevance filtering (`isRelevantJob`, `extractTechTags`).
  * Deduplication and writing records into the `jobs` table (`UPSERT` on `job_url`).
* **Talks to**:
  * External HTTP endpoints (RemoteOK API, WWR RSS, Google Alerts RSS).
  * Supabase Client (`supabase.from('jobs')`).
* **Does NOT own**:
  * AI match evaluation (owned by `jobEvaluator.ts`).
  * Job application records (owned by `job_applications` table / `aiTailor.ts`).
  * Scheduling execution (invoked via `setInterval` in `src/bot/index.ts` or `/fetch_jobs` command).
* **Failure Modes & Degradation**:
  * *Feed Unreachable / Timeout*: Catches error per feed via `Promise.allSettled`, logs warning, and continues remaining feeds without crashing the process.
  * *Database Write Failure*: Logs error per URL; un-inserted jobs are retried on next scheduled sweep. User sees partial or 0 counts in `/fetch_jobs` response message.

#### B. Scholarship & MSc Sourcing Engine (`src/services/scholarshipFetcher.ts`)
* **Owns**:
  * Sourcing and seeding European and international MSc programmes and linked scholarships.
  * Writing programme and scholarship metadata into `programmes` (`UPSERT` on `main_link`) and `scholarships` (`UPSERT` on `application_link`).
* **Talks to**:
  * Supabase Client (`supabase.from('programmes')`, `supabase.from('scholarships')`).
* **Does NOT own**:
  * Scholarship application records or SOP generation (owned by `scholarship_applications` / `sopGenerator.ts`).
  * Task checklist extraction (owned by `checklistGenerator.ts`).
* **Failure Modes & Degradation**:
  * *Database Failure*: Returns caught error; user sees `"⚠️ Failed to query programmes table"` in Telegram bot.

#### C. Job Liveness & Dead Board Prober (`src/services/livenessChecker.ts`)
* **Owns**:
  * Automated HTTP `HEAD`/`GET` status probing on open job listings.
  * Updating expired / 404 job postings to `status = 'closed'` in the `jobs` table.
* **Talks to**:
  * Target job URLs via Axios with 5000ms timeout and browser User-Agent headers.
  * Supabase Client (`supabase.from('jobs')`).
* **Does NOT own**:
  * Deleting job records (only mutates `status` column to preserve historical analytics).
* **Failure Modes & Degradation**:
  * *Network Timeout / Anti-Bot Block on Probe*: Treats non-200 responses conservatively (only marks `closed` on explicit 404/410 status or definitive "closed" string in HTML), preserving open status for transient connection timeouts.

---

### 2.2 AI Orchestration Engine (`gemini-1.5-flash`)

All AI services instantiate `GoogleGenerativeAI({ model: 'gemini-1.5-flash' })` with structured prompt boundaries.

#### A. Job Fit Evaluator (`src/services/jobEvaluator.ts`)
* **Owns**:
  * Evaluating 1–5 Star match scores, matched skills array, and missing skill gaps between `user_profile` and target `jobs` listing.
  * Writing evaluation metadata back into `jobs.tech_stack_tags` and application notes.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`).
  * Supabase Client (`user_profile`, `jobs`).
* **Does NOT own**:
  * Modifying baseline candidate resume text (owned by `user_profile` updater).
* **Failure Modes & Degradation**:
  * *Missing API Key / Gemini Rate Limit*: Falls back to heuristic keyword matching against `TECH_STACK_TAGS` with default ⭐⭐⭐⭐ rating so user interaction never hangs.

#### B. Resume Tailoring Engine (`src/services/aiTailor.ts`)
* **Owns**:
  * Generating tailored 3-sentence executive summaries, aligned keywords, and custom accomplishment bullets.
  * Creating `job_applications` record with status `applied` and tailored content.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`).
  * Supabase Client (`user_profile`, `jobs`, `job_applications`).
* **Does NOT own**:
  * Physical PDF/DOCX rendering or direct file export.
  * Recruiter outreach dispatch (owned by `emailOutreach.ts`).
* **Failure Modes & Degradation**:
  * *Gemini API Failure*: Returns deterministic rule-based bullet points derived directly from baseline profile with a warning message to user.

#### C. STAR Interview Prep Generator (`src/services/interviewPrep.ts`)
* **Owns**:
  * Synthesizing 3 structured Situation-Task-Action-Result narratives and technical questions for target role.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Supabase Client (`jobs`, `user_profile`).
* **Does NOT own**:
  * Application tracking or state mutation.
* **Failure Modes & Degradation**:
  * *Gemini API Error*: Returns fallback generic STAR DevOps scenarios (CI/CD pipeline outage, Kubernetes migration, AWS IAM hardening).

#### D. Application Form Answer Assistant (`src/services/applicationAnswers.ts`)
* **Owns**:
  * Generating grounded 60–120 word portal form answers matching candidate cloud experience.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Supabase Client (`jobs`, `user_profile`).
* **Does NOT own**:
  * Automated form submission into third-party applicant portals (Workday, Greenhouse, Lever).
* **Failure Modes & Degradation**:
  * *API Error*: Surfaces descriptive error message on Telegram: `"⚠️ Error generating answer: <error_message>"`.

#### E. Document Checklist Generator (`src/services/checklistGenerator.ts`)
* **Owns**:
  * Extracting required admission items (transcripts, IELTS/TOEFL, reference letters, apostilles) from programme notes.
  * Creating structured task records in `tasks` table with calculated due dates.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Supabase Client (`programmes`, `tasks`).
* **Does NOT own**:
  * University application submission.
* **Failure Modes & Degradation**:
  * *Gemini API Error*: Inserts default standard 4-tier MSc task checklist (Transcripts, SOP, English Test, 2 Reference Letters).

#### F. Statement of Purpose (SOP) Generator (`src/services/sopGenerator.ts`)
* **Owns**:
  * Drafting 500–700 word academic Statements of Purpose connecting DevOps experience to university research curriculum.
  * Ingesting user writing style guides from `user_profile.parsed_json.sop_sample`.
  * Storing drafted SOP in `scholarship_applications.sop_draft`.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Supabase Client (`programmes`, `user_profile`, `scholarship_applications`).
* **Does NOT own**:
  * Final submission to university admissions portals.
* **Failure Modes & Degradation**:
  * *API Error*: Logs error and notifies user: `"⚠️ Error generating SOP: <error_message>"`.

#### G. Weekly Metrics & Velocity Engine (`src/services/metricsEngine.ts`)
* **Owns**:
  * Aggregating 7-day funnel metrics: applications count, interviews, response latency (average days to interview), and ghosting rate (>14 days without status update).
  * Calling Gemini AI to produce strategic synthesis and insights summary.
  * Persisting weekly rollups into `metrics` table (`UNIQUE(category, week_start)`).
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Supabase Client (`jobs`, `job_applications`, `email_outreach`, `metrics`).
* **Does NOT own**:
  * Daily scheduled task alerts (owned by `tasks` query).
* **Failure Modes & Degradation**:
  * *Gemini Synthesis Failure*: Returns raw numerical table without AI narrative block; database metrics record is still saved.

---

### 2.3 Outreach & Communication Layer

#### A. Recruiter Lead Discovery (`src/services/leadFinder.ts`)
* **Owns**:
  * Proposing hiring manager and technical recruiter contact profiles based on target company.
  * Creating/reusing records in `contacts` table.
* **Talks to**:
  * Supabase Client (`contacts`).
* **Does NOT own**:
  * Email sequence scheduling or dispatch.
* **Failure Modes & Degradation**:
  * *Database Error*: Returns generated generic `Hiring Lead <hiring@company.com>` in-memory object so outreach workflow is unblocked.

#### B. Outreach Email Scheduler & Dispatcher (`src/services/emailOutreach.ts`)
* **Owns**:
  * Drafting 100-word personalized cold email body with Gemini AI.
  * Scheduling 4-stage follow-up cadence records in `email_outreach` table (Day 0, Day 2, Day 5, Day 10).
  * Transactional email delivery via Resend API (`resend.emails.send`) with custom domain headers (`therook.xyz`).
  * Sequence cancellation method (`cancelSequenceOnReply`) updating database sequence status to `cancelled`.
* **Talks to**:
  * Google Gemini API (`gemini-1.5-flash`), Resend API, Supabase Client (`email_outreach`, `contacts`, `jobs`, `user_profile`).
* **Does NOT own (Explicit Boundary)**:
  * Inbound webhook HTTP listener server (inbound reply cancellation is implemented at database query level and callable service layer; no standalone external webhook HTTP daemon is currently deployed).
* **Failure Modes & Degradation**:
  * *Missing RESEND_API_KEY*: Logs draft to console and stores in database as `scheduled` without crashing.
  * *Resend API Error / Rate Limit*: Flags record status as `failed` in `email_outreach` for manual inspection.

---

### 2.4 Interface & Synchronization Layer

#### A. Telegraf Telegram Bot Worker (`src/bot/index.ts`)
* **Owns**:
  * Private Telegram user authentication middleware (`TELEGRAM_ALLOWED_USER_ID`).
  * Schedulers for background sourcing sweeps (every 6 hours) and daily liveness checks (every 24 hours).
  * Handling all user commands and text messages.
* **Talks to**:
  * Telegram Bot API (Long Polling via `bot.launch()`), All internal services in `src/services/`, Supabase Client.
* **Does NOT own**:
  * Direct web UI rendering.
* **Failure Modes & Degradation**:
  * *Telegram 409 Conflict*: Exits process on unhandled polling conflict; Docker daemon automatically restarts container.

#### B. Web Dashboard (`dashboard/index.html` on Nginx `:8080`)
* **Owns**:
  * Visual Kanban display of applications (`Planning`, `Applied`, `Interviewing`, `Offers`).
* **Talks to**:
  * Supabase REST API via JavaScript client.
* **Does NOT own**:
  * Authentication management or backend AI dispatch.
* **Failure Modes & Degradation**:
  * *Supabase Connection Drop*: Displays empty state cards with reload indicator.

#### C. n8n Automation Engine (`docker.n8n.io/n8nio/n8n:latest` on `:5678`)
* **Owns**:
  * 15-minute recurring cron schedule.
  * Executing 4 parallel database query branches and syncing to Google Sheets document `Path pilot`.
* **Talks to**:
  * Supabase PostgreSQL (via Supavisor Session Pooler `:5432`).
  * Google Sheets API (via Google OAuth 2.0).
* **Does NOT own**:
  * Scraper execution or AI resume tailoring logic.
* **Failure Modes & Degradation**:
  * *Empty Database Tables*: Skips Google Sheets append step when query returns 0 rows without writing empty rows.
  * *OAuth Token Expiry*: n8n surfaces error notification in workflow UI while continuing execution on next interval after token refresh.

---

## 3. Verbatim Telegram Command Registry

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
| `/outreach` | `bot.command('outreach')` | Discovers recruiter lead and schedules 4-stage Resend email cadence. |
| `/schools` | `bot.command('schools')` | Queries and lists tracked European & UK MSc programmes. |
| `/scholarships` | `bot.command('scholarships')` | Queries and lists fully-funded scholarships ordered by deadline. |
| `/checklist` | `bot.command('checklist')` | Generates AI document preparation checklist and saves items to `tasks`. |
| `/sop` | `bot.command('sop')` | Generates tailored 600-word academic Statement of Purpose for `school_id`. |
| `/sop_sample` | `bot.command('sop_sample')` | Stores user's authentic writing style sample in `user_profile.parsed_json`. |
| `/tasks` | `bot.command('tasks')` | Lists pending actionable checklist tasks ordered by upcoming due date. |
| `/report` | `bot.command('report')` | Computes 7-day velocity, response latency, ghosting rates, and AI synthesis. |
| *Direct CV Text*| `bot.on('text')` | Intercepts pasted CV text (>100 chars) and updates `user_profile.raw_resume_text`. |

---

## 4. Multi-Tab Google Sheets Synchronization Topology

The n8n workflow (`n8n/google_sheets_sync_workflow.json`) runs every 15 minutes across **4 parallel branches**:

```
Schedule Trigger (Every 15m)
├── Branch 1: SELECT jobs + job_applications       ➔ Sync Tab: 'Jobs Pipeline'          (Match on 'Job URL')
├── Branch 2: SELECT contacts + email_outreach     ➔ Sync Tab: 'Cold Outreach'          (Match on 'Email')
├── Branch 3: SELECT programmes + scholarships     ➔ Sync Tab: 'Schools & Scholarships' (Match on 'Application Link')
└── Branch 4: SELECT tasks                         ➔ Sync Tab: 'Tasks'                  (Match on 'Description')
```

---

## 5. Architectural Decisions & Trade-Offs (ADRs)

### ADR-001: Supavisor Session Connection Pooling for Prepared Statements
* **Context**: n8n and Node.js microservices execute recurring parameterized SQL queries over persistent connections.
* **Decision**: Connected services to Supabase Connection Pooler in **Session Mode (Port 5432)** rather than Transaction Mode (Port 6543).
* **Consequences**: Avoids prepared statement de-allocation errors while supporting connection multiplexing.

### ADR-002: Ingestion via Google Alerts RSS for Search-Indexed Postings
* **Context**: Direct automated scraping on major career portals (Indeed, Glassdoor, LinkedIn) triggers Cloudflare bot challenges and IP blocks.
* **Decision**: Ingested curated Google Alerts RSS feeds (`config/google_alerts.txt`), leveraging Google's indexing infrastructure to receive clean XML streams.
* **Consequences**: High-reliability ingestion without headless browser overhead or paid proxy infrastructure.

### ADR-003: Deterministic Profile Grounding for AI Resume Tailoring
* **Context**: Generative models frequently fabricate past employment titles, metrics, or technologies when tailoring resumes.
* **Decision**: Constrained Gemini prompts to the candidate's canonical `user_profile` in PostgreSQL, instructing the model to strictly re-order and contextualize verified facts without introducing unlisted technologies.
* **Consequences**: Substantially reduces hallucination risks while producing targeted, ATS-aligned resumes.

### ADR-004: Multi-Stage Node.js 22 Alpine Build for Native Realtime WebSockets
* **Context**: `@supabase/supabase-js` realtime client requires native global `WebSocket` support, which is experimental in Node 20 Alpine.
* **Decision**: Upgraded Dockerfile to **`node:22-alpine`** for both builder and runner stages.
* **Consequences**: Clean runtime execution without auxiliary WebSocket polyfill dependencies, maintaining a lightweight image size (~120MB).
