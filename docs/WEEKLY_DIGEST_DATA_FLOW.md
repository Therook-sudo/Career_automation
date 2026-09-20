# 📊 Path Pilot — Weekly Digest & Funnel Velocity Data Flow Walkthrough
## Performance Metrics, Response Latency, Ghosting Rates, and AI Synthesis (CA-004)

## 1. Overview & Architectural Scope
This document provides an end-to-end trace of the **Weekly Digest & Funnel Velocity Engine** within Path Pilot.

Unlike the single-entity lifecycle journeys (Career Sourcing in CA-002 and Scholarship Tracking in CA-003), the weekly digest is the **cross-cutting analytical journey** that bridges operational tables across the system (`jobs`, `job_applications`, `email_outreach`, `metrics`). It transforms rolling time-window operational events into structured velocity metrics, ghosting risk calculations, strategic AI synthesis, and historical table rollups.

All components, database schemas, and service contracts align strictly with [`docs/COMPONENT_MAP.md`](./COMPONENT_MAP.md).

---

## 2. End-to-End Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant User as Candidate / User<br/>(Telegram Client)
    participant Bot as Telegraf Bot Worker<br/>(src/bot/index.ts)
    participant Engine as Metrics Engine<br/>(metricsEngine.ts)
    participant DB as Persistence Layer<br/>(Supabase PostgreSQL)
    participant LLM as Google Gemini API<br/>(gemini-1.5-flash)

    Note over User,Bot: Step 1: Digest Request Invocation
    User->>Bot: /report
    Bot->>User: "📊 Computing 7-Day Performance Metrics & Funnel Velocity..."
    Bot->>Engine: computeWeeklyMetrics()

    Note over Engine,DB: Step 2: Parallel Windowed & Snapshot Queries
    Engine->>Engine: Compute weekStart (now - 7d) & fourteenDaysAgo (now - 14d)
    
    par 7-Day Rolling Window Queries
        Engine->>DB: SELECT COUNT FROM jobs WHERE created_at >= weekStart
        DB-->>Engine: sourcedJobsCount
        Engine->>DB: SELECT COUNT FROM job_applications WHERE created_at >= weekStart
        DB-->>Engine: applicationsSentCount
        Engine->>DB: SELECT COUNT FROM job_applications WHERE status = 'interview' AND last_update >= weekStart
        DB-->>Engine: responsesReceivedCount
        Engine->>DB: SELECT COUNT FROM email_outreach WHERE status = 'sent' AND sent_at >= weekStart
        DB-->>Engine: outreachSentCount
        Engine->>DB: SELECT COUNT FROM email_outreach WHERE status = 'replied' AND created_at >= weekStart
        DB-->>Engine: outreachRepliedCount
    and Snapshot & Ghosting Queries
        Engine->>DB: SELECT COUNT FROM job_applications WHERE status = 'interview'
        DB-->>Engine: interviewsCount (All-time snapshot)
        Engine->>DB: SELECT COUNT FROM job_applications WHERE created_at <= fourteenDaysAgo
        DB-->>Engine: totalOlderApps (Baseline for ghosting)
        Engine->>DB: SELECT COUNT FROM job_applications WHERE status = 'applied' AND created_at <= fourteenDaysAgo
        DB-->>Engine: ghostedApps (Ghosting numerator)
    end

    Note over Engine,Engine: Step 3: Mathematical Metric Reductions
    Engine->>Engine: Compute emailReplyRate = (replied / sent) * 100
    Engine->>Engine: Compute ghostingRate = (ghosted / totalOlder) * 100
    Engine->>Engine: Assign avgResponseDays = 4.5 baseline

    Note over Engine,LLM: Step 4: AI Strategic Synthesis
    alt Gemini AI Available (genAI != null)
        Engine->>LLM: Prompt gemini-1.5-flash with weekly stats & funnel rates
        LLM-->>Engine: 3-paragraph executive summary insights
    else Non-AI Fallback (Missing API Key)
        Engine->>Engine: Format deterministic template summary
    else AI Runtime Error (Catch block)
        Engine->>Engine: Format concise activity fallback string
    end

    Note over Engine,DB: Step 5: Historical Metrics Rollup Persistence
    Engine->>DB: UPSERT into metrics (category: 'job', week_start: weekStart, onConflict: category,week_start)
    DB-->>Engine: Rollup persisted

    Note over Engine,User: Step 6: Response Delivery to Candidate
    Engine-->>Bot: WeeklyMetricsReport object
    Bot->>User: Render formatted Markdown report with counts, rates, latency, and AI synthesis
```

---

## 3. Detailed Step-by-Step Data Flow

### Step 1: User Request Invocation
* **Trigger Type**: User-initiated on-demand.
* **Executing Component**: `Telegraf Telegram Bot Worker` (`src/bot/index.ts:468-493`).
* **User Input**: Slash command `/report`.
* **Immediate Acknowledgement**:
  The bot sends an initial status message:
  `"📊 *Computing 7-Day Performance Metrics & Funnel Velocity...*"`

---

### Step 2: Window Calculations & Multi-Table Query Aggregation
* **Executing Component**: `Weekly Metrics & Velocity Engine` (`src/services/metricsEngine.ts`).
* **Time Windows Established**:
  * $\text{now} = \text{new Date()}$
  * $\text{weekStart} = \text{now} - 7\text{ days}$ ($\text{toISOString()}$)
  * $\text{fourteenDaysAgo} = \text{now} - 14\text{ days}$ ($\text{toISOString()}$)

#### Exact Query Tracing & Windows:

| Metric Name | Table Sourced | SQL Filter / Criteria | Time Window Covered | Metric Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **`sourcedJobsCount`** | `jobs` | `.gte('created_at', weekStartStr)` | Past 7 Days (`[now-7d, now]`) | Sourcing volume & feed throughput |
| **`applicationsSentCount`** | `job_applications` | `.gte('created_at', weekStartStr)` | Past 7 Days (`[now-7d, now]`) | Tailoring & submission activity |
| **`responsesReceivedCount`** | `job_applications` | `.eq('status', 'interview').gte('last_update', weekStartStr)` | Past 7 Days (`[now-7d, now]`) | Fresh positive interviewer transitions |
| **`interviewsCount`** | `job_applications` | `.eq('status', 'interview')` | **All-Time Active Snapshot** | Current active interview pipeline load |
| **`outreachSentCount`** | `email_outreach` | `.eq('status', 'sent').gte('sent_at', weekStartStr)` | Past 7 Days (`[now-7d, now]`) | Outbound recruiter outreach volume |
| **`outreachRepliedCount`** | `email_outreach` | `.eq('status', 'replied').gte('created_at', weekStartStr)` | Past 7 Days (`[now-7d, now]`) | Positive recruiter engagement count |
| **`totalOlderApps`** | `job_applications` | `.lte('created_at', fourteenDaysAgo.toISOString())` | Created $\ge 14$ days ago | Denominator for ghosting rate |
| **`ghostedApps`** | `job_applications` | `.eq('status', 'applied').lte('created_at', fourteenDaysAgo.toISOString())` | Created $\ge 14$ days ago | Unresponsive applications numerator |

---

### Step 3: Mathematical Metric Reductions & Safe Zero Divisions

1. **Cold Email Reply Rate (`emailReplyRate`)**:
   $$\text{emailReplyRate} = \begin{cases} \left(\frac{\text{outreachRepliedCount}}{\text{outreachSentCount}} \times 100\right) & \text{if } \text{outreachSentCount} > 0 \\ 0 & \text{if } \text{outreachSentCount} = 0 \end{cases}$$
   *Formatted to 1 decimal place (`toFixed(1)`).*

2. **Ghosting Rate (`ghostingRate`)**:
   Calculates the percentage of applications older than 14 days that have received no status progression beyond `'applied'`:
   $$\text{ghostingRate} = \begin{cases} \left(\frac{\text{ghostedApps}}{\text{totalOlderApps}} \times 100\right) & \text{if } \text{totalOlderApps} > 0 \\ 0 & \text{if } \text{totalOlderApps} = 0 \end{cases}$$
   *Formatted to 1 decimal place (`toFixed(1)`).*

3. **Average Response Latency Baseline (`avgResponseDays`)**:
   * Assigned constant baseline: `const avgResponseDays = 4.5;` representing the average historical days between application submission and first recruiter contact.

---

### Step 4: AI Strategic Synthesis & Graceful Fallbacks

* **Executing Component**: `metricsEngine.ts` calling `gemini-1.5-flash`.

#### Path A: Gemini AI Available (`genAI != null`)
* Passes structured prompt containing the computed 7-day numerical metrics.
* **Prompt Instructions**: Formulates a concise 3-paragraph executive summary (150 words max) highlighting patterns (e.g. strong traction on Kubernetes roles, funnel velocity recommendations).
* **Output**: Detailed qualitative strategic narrative.

#### Path B: Non-AI Fallback (`!genAI`, Missing API Key)
* Formats a deterministic template string directly injecting the computed numbers:
  ```text
  This week you sourced <sourcedJobsCount> jobs, submitted <applicationsSentCount> applications, and sent <outreachSentCount> cold emails with a <emailReplyRate>% reply rate. Average time to response: 4.5 days. Ghosting rate: <ghostingRate>%. Keep building momentum!
  ```

#### Path C: AI Runtime Error (API Rate Limit, Network Drop, Timeout)
* The catch block logs `console.error('⚠️ Gemini Metrics digest error:', err.message)` and assigns a concise activity fallback string:
  ```text
  Sourced <sourcedJobsCount> jobs and submitted <applicationsSentCount> applications this week with <interviewsCount> active interviews.
  ```
* The function does not throw or crash; it proceeds directly to the persistence step.

---

### Step 5: Historical Metrics Rollup vs. Live Recomputed Figures

The system explicitly distinguishes between live recomputed metrics and persisted historical records:

#### Figures Recomputed Live on Each `/report` Request:
* All raw query counts (`sourcedJobsCount`, `applicationsSentCount`, `responsesReceivedCount`, `interviewsCount`, `outreachSentCount`, `outreachRepliedCount`).
* Dynamic ratios (`emailReplyRate`, `ghostingRate`).
* Generated `aiInsightsSummary`.

#### Figures Persisted into Historical Storage (`metrics` table):
* At the conclusion of the calculation, `metricsEngine.ts` writes a weekly rollup record into PostgreSQL:
  ```typescript
  await supabase.from('metrics').upsert(
    {
      category: 'job',
      week_start: weekStart.toISOString().split('T')[0],
      week_end: now.toISOString().split('T')[0],
      applications_count: applicationsSentCount || 0,
      responses_count: responsesReceivedCount || 0,
      interviews_count: interviewsCount || 0,
      email_reply_rate: emailReplyRate,
      ai_insights_summary: aiInsights
    },
    { onConflict: 'category,week_start' }
  );
  ```
* **Conflict Resolution**: The table constraint `UNIQUE(category, week_start)` ensures that repeated requests within the same 7-day period update the existing record rather than generating duplicate weekly rows.

---

### Step 6: User-Facing Report Presentation

The bot renders the finalized Markdown message to Telegram:

```text
🤖 Weekly Performance & Funnel Velocity Synthesis
📅 Period: 2026-09-13 to 2026-09-20

📈 Activity & Funnel Metrics:
• Sourced Jobs: 14
• Applications Submitted: 6
• Recruiter Cold Emails Sent: 4
• Cold Email Reply Rate: 25.0%
• Active Interviews: 2
• Avg Response Latency: 4.5 days
• Ghosting Rate (>14d): 16.7%

💡 AI Insights & Strategic Synthesis:
Your application velocity remained strong this week with 6 new submissions focused on Kubernetes and Cloud Platform roles. Outreach response conversion reached 25%, indicating high relevance in your tailored cold messages. 

With 2 active interviews in flight, prioritize interview preparation using /prep. Consider re-engaging the 16.7% ghosted applications with follow-up sequences.
```

---

## 4. Edge Case: Behavior in an All-Zero Week

When the system is run in a fresh deployment or during a week with zero activity (no jobs fetched, no applications sent, no outreach, no interviews):

1. **Query Counts**:
   * `sourcedJobsCount = 0`
   * `applicationsSentCount = 0`
   * `responsesReceivedCount = 0`
   * `interviewsCount = 0`
   * `outreachSentCount = 0`
   * `outreachRepliedCount = 0`
   * `totalOlderApps = 0`, `ghostedApps = 0`
2. **Safe Mathematical Reductions**:
   * `emailReplyRate = 0` (zero division prevented by `outreachSentCount > 0` check).
   * `ghostingRate = 0` (zero division prevented by `totalOlderApps > 0` check).
   * `avgResponseDays = 4.5` (static baseline constant).
3. **Persisted Record in `metrics` Table**:
   * `applications_count: 0`, `responses_count: 0`, `interviews_count: 0`, `email_reply_rate: 0.00`.
4. **Verbatim Output Delivered to User**:
   ```text
   🤖 Weekly Performance & Funnel Velocity Synthesis
   📅 Period: 2026-09-13 to 2026-09-20

   📈 Activity & Funnel Metrics:
   • Sourced Jobs: 0
   • Applications Submitted: 0
   • Recruiter Cold Emails Sent: 0
   • Cold Email Reply Rate: 0%
   • Active Interviews: 0
   • Avg Response Latency: 4.5 days
   • Ghosting Rate (>14d): 0%

   💡 AI Insights & Strategic Synthesis:
   This week you sourced 0 jobs, submitted 0 applications, and sent 0 cold emails with a 0% reply rate. Average time to response: 4.5 days. Ghosting rate: 0%. Keep building momentum!
   ```

---

## 5. Summary Data Contract Matrix

| Stage | Sourced Component / Table | Target Consumer | Input Contract | Output Contract |
| :--- | :--- | :--- | :--- | :--- |
| **1. Request** | Telegram Client | `bot/index.ts` | `/report` slash command | Calls `computeWeeklyMetrics()` |
| **2. Aggregation** | `jobs`, `job_applications`, `email_outreach` | `metricsEngine.ts` | Rolling 7-day timestamp filters & 14-day ghosting timestamps | Raw numerical counts array |
| **3. Metric Reduction** | In-Memory Calculations | `metricsEngine.ts` | Raw counts | `emailReplyRate: number`, `ghostingRate: number`, `avgResponseDays: 4.5` |
| **4. AI Synthesis** | `metricsEngine.ts` & `gemini-1.5-flash` | In-Memory Object | Calculated metrics payload | 3-paragraph executive narrative string |
| **5. Rollup Storage** | `metricsEngine.ts` | `metrics` PostgreSQL table | Category `'job'` and computed weekly stats | Upserted row in `metrics` table (`UNIQUE(category, week_start)`) |
| **6. Delivery** | `metricsEngine.ts` | Telegram Client | `WeeklyMetricsReport` object | Formatted Markdown summary with activity breakdown and strategic guidance |
