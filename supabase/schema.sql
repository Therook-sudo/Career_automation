-- =========================================================================
-- Autonomous Career Pipeline & Scholarship Tracker Schema (Supabase / Postgres)
-- =========================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------------------------
-- 1. Jobs Table
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    company VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    is_remote BOOLEAN DEFAULT false,
    tech_stack_tags TEXT[] DEFAULT '{}',
    source VARCHAR(100) NOT NULL, -- e.g., 'LinkedIn', 'RemoteOK', 'Indeed'
    job_url TEXT UNIQUE NOT NULL,
    description TEXT,
    posted_date TIMESTAMP WITH TIME ZONE,
    application_deadline TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'open', -- 'open', 'closed', 'applied', 'archived'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 2. Job Applications Table
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    application_channel VARCHAR(100) DEFAULT 'portal', -- 'portal', 'email', 'referral', 'linkedin_dm'
    date_applied TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'planning', -- 'planning', 'applied', 'interview', 'offer', 'rejected', 'no_response'
    tailored_summary TEXT,
    tailored_keywords TEXT[],
    custom_bullets TEXT[],
    cv_version_path VARCHAR(500),
    last_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    next_follow_up_date TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 3. Contacts Table (Recruiters & Hiring Managers)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    role_title VARCHAR(255),
    company VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    linkedin_url TEXT,
    confidence_score NUMERIC(3,2) DEFAULT 0.00, -- 0.00 to 1.00
    source VARCHAR(100), -- 'Hunter.io', 'Apollo', 'Manual'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 4. Email & DM Outreach Table
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_outreach (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    job_application_id UUID REFERENCES job_applications(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    channel VARCHAR(50) DEFAULT 'email', -- 'email', 'linkedin_dm'
    subject VARCHAR(255),
    body TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'scheduled', -- 'scheduled', 'sent', 'replied', 'bounced', 'cancelled'
    send_at TIMESTAMP WITH TIME ZONE NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    follow_up_sequence_id INTEGER DEFAULT 1, -- 1: initial, 2: reminder, 3: value-add, 4: breakup
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 5. Programmes Table (Universities & Masters)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS programmes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    university VARCHAR(255) NOT NULL,
    country VARCHAR(100) NOT NULL,
    field VARCHAR(150) NOT NULL, -- e.g., 'Cloud Engineering', 'Information Security'
    degree_level VARCHAR(50) DEFAULT 'MSc',
    tuition_fee VARCHAR(100), -- e.g., '€18,000 / year' or 'Waived'
    is_fully_funded BOOLEAN DEFAULT false,
    duration VARCHAR(50), -- e.g., '2 Years'
    main_link TEXT UNIQUE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 6. Scholarships Table
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scholarships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    programme_id UUID REFERENCES programmes(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    provider VARCHAR(255) NOT NULL,
    country VARCHAR(100),
    coverage TEXT NOT NULL, -- 'Tuition + €1400/mo stipend + Travel'
    eligibility_summary TEXT,
    deadline TIMESTAMP WITH TIME ZONE,
    application_link TEXT UNIQUE NOT NULL,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 7. Scholarship & School Applications Table
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scholarship_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scholarship_id UUID REFERENCES scholarships(id) ON DELETE SET NULL,
    programme_id UUID REFERENCES programmes(id) ON DELETE CASCADE,
    date_started TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_submitted TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'planning', -- 'planning', 'in_progress', 'submitted', 'result_pending', 'accepted', 'rejected'
    decision_date TIMESTAMP WITH TIME ZONE,
    sop_draft TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 8. Unified Tasks Table
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL, -- 'job' or 'scholarship'
    entity_id UUID NOT NULL, -- references job_applications(id) or scholarship_applications(id)
    description TEXT NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'overdue'
    priority VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- 9. Metrics Table
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category VARCHAR(50) NOT NULL DEFAULT 'job', -- 'job' or 'scholarship'
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    applications_count INTEGER DEFAULT 0,
    responses_count INTEGER DEFAULT 0,
    interviews_count INTEGER DEFAULT 0,
    offers_count INTEGER DEFAULT 0,
    email_reply_rate NUMERIC(5,2) DEFAULT 0.00,
    dm_reply_rate NUMERIC(5,2) DEFAULT 0.00,
    acceptance_rate NUMERIC(5,2) DEFAULT 0.00,
    ai_insights_summary TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(category, week_start)
);

-- -------------------------------------------------------------------------
-- 10. User Base Profile Table (For Resume & SOP Grounding)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profile (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) NOT NULL,
    headline VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    raw_resume_text TEXT,
    skills TEXT[] DEFAULT '{}',
    parsed_json JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- Indexes for Fast Querying
-- -------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_date ON jobs(posted_date DESC);
CREATE INDEX IF NOT EXISTS idx_job_apps_status ON job_applications(status);
CREATE INDEX IF NOT EXISTS idx_scholarships_deadline ON scholarships(deadline ASC);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date ASC);
CREATE INDEX IF NOT EXISTS idx_email_outreach_status ON email_outreach(status, send_at);

-- Automatic updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_jobs_updated_at
BEFORE UPDATE ON jobs
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
