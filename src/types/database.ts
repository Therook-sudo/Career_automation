export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  is_remote: boolean;
  tech_stack_tags: string[];
  source: string;
  job_url: string;
  description?: string;
  posted_date?: string;
  application_deadline?: string;
  status: 'open' | 'closed' | 'applied' | 'archived';
  created_at?: string;
  updated_at?: string;
}

export interface JobApplication {
  id: string;
  job_id: string;
  application_channel: 'portal' | 'email' | 'referral' | 'linkedin_dm';
  date_applied?: string;
  status: 'planning' | 'applied' | 'interview' | 'offer' | 'rejected' | 'no_response';
  tailored_summary?: string;
  tailored_keywords?: string[];
  custom_bullets?: string[];
  cv_version_path?: string;
  last_update?: string;
  next_follow_up_date?: string;
  notes?: string;
  created_at?: string;
}

export interface Contact {
  id: string;
  name: string;
  role_title?: string;
  company: string;
  email?: string;
  linkedin_url?: string;
  confidence_score?: number;
  source?: string;
  created_at?: string;
}

export interface EmailOutreach {
  id: string;
  job_id?: string;
  job_application_id?: string;
  contact_id: string;
  channel: 'email' | 'linkedin_dm';
  subject?: string;
  body: string;
  status: 'scheduled' | 'sent' | 'replied' | 'bounced' | 'cancelled';
  send_at: string;
  sent_at?: string;
  follow_up_sequence_id: number;
  created_at?: string;
}

export interface Programme {
  id: string;
  name: string;
  university: string;
  country: string;
  field: string;
  degree_level?: string;
  tuition_fee?: string;
  is_fully_funded?: boolean;
  duration?: string;
  main_link: string;
  notes?: string;
  created_at?: string;
}

export interface Scholarship {
  id: string;
  programme_id?: string;
  name: string;
  provider: string;
  country?: string;
  coverage: string;
  eligibility_summary?: string;
  deadline?: string;
  application_link: string;
  tags?: string[];
  created_at?: string;
}

export interface ScholarshipApplication {
  id: string;
  scholarship_id?: string;
  programme_id: string;
  date_started?: string;
  date_submitted?: string;
  status: 'planning' | 'in_progress' | 'submitted' | 'result_pending' | 'accepted' | 'rejected';
  decision_date?: string;
  sop_draft?: string;
  notes?: string;
  created_at?: string;
}

export interface Task {
  id: string;
  entity_type: 'job' | 'scholarship';
  entity_id: string;
  description: string;
  due_date: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  created_at?: string;
}

export interface Metric {
  id: string;
  category: 'job' | 'scholarship';
  week_start: string;
  week_end: string;
  applications_count: number;
  responses_count: number;
  interviews_count: number;
  offers_count: number;
  email_reply_rate: number;
  dm_reply_rate: number;
  acceptance_rate: number;
  ai_insights_summary?: string;
  notes?: string;
  created_at?: string;
}

export interface UserProfile {
  id?: string;
  full_name: string;
  headline?: string;
  email?: string;
  phone?: string;
  raw_resume_text?: string;
  skills?: string[];
  parsed_json?: Record<string, any>;
  updated_at?: string;
}
