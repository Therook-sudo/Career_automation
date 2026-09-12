# 🚀 Autonomous DevOps Career & Scholarship Pipeline — System Pitch & Architecture

> **A comprehensive guide to explaining Path Pilot to recruiters, engineering managers, interviewers, mentors, and peers.**

---

## 🎤 1. The 30-Second Elevator Pitch

> *"I built an autonomous, dual-pipeline AI system for candidate career acceleration and international Masters scholarship tracking.*
>
> *Instead of manually scrolling job boards, copy-pasting CVs, and writing cold emails, my system automatically sources global DevOps & Cloud roles from multiple boards and Google Alerts RSS feeds, scores match fit from 1 to 5 Stars, tailors my resume with zero hallucination, discovers technical recruiters, sends automated cold email sequences via Resend, and drafts Statements of Purpose for fully-funded European Masters programmes—all controlled directly from my phone via Telegram, a self-hosted Web Dashboard, and a live 4-tab Google Sheet."*

---

## 🛠️ 2. How It Works: The 6-Step End-to-End Pipeline

```
[1. Auto-Sourcing] ➔ [2. AI Scoring & Skill Gaps] ➔ [3. AI Resume & SOP Tailoring]
                                                               ↓
[6. Unified UI: Telegram / Web / Sheets] ⬅ [5. Dead Board Health Check] ⬅ [4. Recruiter Cold Emails]
```

### Step 1: Multi-Source Automated Sourcing & Sifting
* **What happens**: Background workers automatically scrape job boards (RemoteOK, WeWorkRemotely, JSearch) and ingest **14 custom Google Alerts RSS feeds** every 6 hours, while sweeping university catalogues (Erasmus Mundus, SECCLO, DAAD Germany, KTH Sweden) bi-weekly.
* **Filtering Engine**: Only roles matching target titles (`DevOps`, `Cloud Engineer`, `SRE`, `Platform Engineer`, `DevSecOps`) and stack tags (`Kubernetes`, `Docker`, `Terraform`, `AWS`, `CI/CD`) are stored in Supabase PostgreSQL with duplicate URL prevention.

---

### Step 2: AI Job Match Scoring (1–5⭐) & Skill Gap Matrix
* **What happens**: As soon as a job is detected, Google Gemini AI evaluates the job description against your candidate profile.
* **Output**:
  * **Match Score**: Rates the job from **1 to 5 Stars** (e.g. ⭐⭐⭐⭐⭐ 5/5).
  * **Skill Gap Analysis**: Categorizes what you already have (`✅ Kubernetes, Terraform, AWS`) vs what is missing (`⚠️ ArgoCD`).
  * **Benefit**: You immediately focus your energy on high-probability opportunities.

---

### Step 3: AI Resume Tailoring & Document Generation (0% Hallucination)
* **What happens**: When applying, the engine reads your baseline CV from Supabase and the target job description.
* **Outputs**:
  * **Tailored Resume Summary & Bullets**: Re-orders and re-words your real achievements to emphasize the exact keywords requested in the JD. Strict prompt guardrails prevent the AI from inventing fake experience or fake dates.
  * **Statement of Purpose (SOP)**: For Masters programs, drafts a 600-word academic SOP linking your real DevOps projects to the university's research curriculum.
  * **Application Form Answer Assistant (`/answer`)**: Generates 80-word grounded responses for portal form questions (e.g., *"Why Canva?"*, *"Describe a complex cloud problem you solved"*).

---

### Step 4: Recruiter Discovery & Cold Email Automation
* **What happens**: Once you apply, the system discovers hiring managers and technical recruiters for that company.
* **Execution**:
  * Drafts a personalized 100-word cold email linking one of your specific DevOps projects to their tech stack.
  * Schedules a **4-stage outreach sequence** via the **Resend Email API** (Day 0 initial, Day 2 reminder, Day 5 value-add project link, Day 10 breakup).
  * **Auto-Stop Trigger**: If the recruiter replies to your email, webhooks automatically cancel all pending follow-up emails!

---

### Step 5: Automated Link Health & Dead Board Checker
* **What happens**: A daily background cron job pings all open job links.
* **Action**: If a job posting returns a `404` or reads *"Position Filled"*, the system automatically marks it `closed`, preventing wasted applications on expired postings.

---

### Step 6: Unified Multi-Interface Control
The pipeline is accessible through **3 real-time synchronized interfaces**:
1. **Private Telegram Bot (`/jobs`, `/apply`, `/outreach`, `/prep`, `/sop`, `/report`)**: Real-time push alerts on your phone, AI tailoring triggers, STAR interview prep story generation, and 7-day funnel velocity reports.
2. **Self-Hosted Nginx Web Dashboard**: A visual Kanban board (`Planning` ➔ `Applied` ➔ `Interviewing` ➔ `Offers`) running on your Contabo VPS.
3. **Live 4-Tab Google Sheet (`Path pilot`)**: Automated n8n workflow syncing Jobs Pipeline, Cold Outreach, Scholarships, and Tasks every 15 minutes.

---

## 🧠 3. Technical Architecture Summary

| Layer | Technology Used | Purpose |
| :--- | :--- | :--- |
| **Language & Runtime** | Node.js (v22 LTS) / TypeScript | Type-safe backend application logic & scraping engine. |
| **Database** | Supabase (Managed PostgreSQL) | Relational storage for 9 core tables with Session connection pooling. |
| **AI Orchestration** | Google Gemini 2.5 Flash API | Match scoring, CV tailoring, SOP drafting, STAR interview prep. |
| **Email Delivery** | Resend API + Custom Domain (`therook.xyz`) | Cold email dispatch & reply auto-cancellation webhooks. |
| **Workflow Automation** | Self-Hosted n8n (Docker) | Automated 4-tab Google Sheets sync & background triggers. |
| **Bot Interface** | Telegraf (`telegraf.js`) | Private Telegram command center accessible on mobile. |
| **Web Server & SSL** | Nginx + Let's Encrypt (Certbot) | Reverse proxy & HTTPS termination for Dashboard & n8n. |
| **Containerization** | Docker Compose on Contabo VPS | Multi-container microservices running alongside existing workloads. |
| **CI/CD Pipeline** | GitHub Actions | Automated SSH build & zero-downtime deployment on push to `main`. |

---

## 💡 4. Top 3 Talking Points for Interviews

1. **Production-Grade Self-Hosting & Cost Efficiency**:
   > *"Instead of paying $50–$100/mo for fragmented SaaS tools, I architected a multi-container Docker stack on a VPS running n8n, Nginx, and Node.js connected to Supabase and Gemini AI for a $0 additional monthly operating cost."*

2. **Zero-Hallucination Prompt Engineering**:
   > *"I designed an AI prompt-engineering framework with strict factual grounding against my baseline database profile. The AI only re-prioritizes and reframes my actual verified accomplishments, guaranteeing zero hallucinated credentials."*

3. **Event-Driven Resilience & CI/CD**:
   > *"The outreach pipeline is event-driven—if a recruiter replies, webhooks instantly halt subsequent automated emails to preserve human authenticity. The whole system deploys automatically via GitHub Actions CI/CD to my Linux server on every git push."*

---

## 📱 5. Telegram Bot Command Cheat Sheet

| Command | Purpose |
| :--- | :--- |
| `/jobs` | View top scraped DevOps jobs with 1–5⭐ match score & skill gaps |
| `/jobs_remote` | Filter and show remote-only job postings |
| `/fetch_jobs` | Trigger an immediate manual scrape of all boards & Google Alerts RSS feeds |
| `/check_liveness` | Run immediate health check on open job links |
| `/apply <job_id>` | Tailor CV summary & bullet points for a job and track application |
| `/prep <job_id>` | Generate 3 customized STAR-method interview prep stories |
| `/answer <job_id> <q>` | Generate concise, grounded portal application question answers |
| `/outreach <job_id>` | Discover hiring lead & schedule 4-stage Resend email sequence |
| `/schools` | Browse upcoming MSc programmes in Europe & UK |
| `/scholarships` | View fully-funded scholarships with coverage & deadlines |
| `/checklist <school_id>` | Generate AI document checklist with deadline countdown |
| `/sop <school_id>` | Generate tailored 600-word Statement of Purpose draft |
| `/sop_sample <text>` | Teach Gemini your personal writing style for future SOPs |
| `/tasks` | View unified pending tasks across jobs & scholarship applications |
| `/report` | Generate 7-day pipeline velocity, ghosting rate, and conversion metrics |
| `/resume` | View your stored base resume text in Supabase |
