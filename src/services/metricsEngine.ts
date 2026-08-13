import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { supabase } from '../lib/supabase';
import { Metric } from '../types/database';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface WeeklyMetricsReport {
  weekStart: string;
  weekEnd: string;
  sourcedJobsCount: number;
  applicationsSentCount: number;
  responsesReceivedCount: number;
  interviewsCount: number;
  outreachSentCount: number;
  emailReplyRate: number;
  aiInsightsSummary: string;
}

/**
 * Computes 7-day metrics and generates an AI performance digest
 */
export async function computeWeeklyMetrics(): Promise<WeeklyMetricsReport> {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);

  const weekStartStr = weekStart.toISOString();
  const weekEndStr = now.toISOString();

  // Query stats from Supabase
  const { count: sourcedJobsCount } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).gte('created_at', weekStartStr);
  const { count: applicationsSentCount } = await supabase.from('job_applications').select('*', { count: 'exact', head: true }).gte('created_at', weekStartStr);
  const { count: responsesReceivedCount } = await supabase.from('job_applications').select('*', { count: 'exact', head: true }).eq('status', 'interview').gte('last_update', weekStartStr);
  const { count: interviewsCount } = await supabase.from('job_applications').select('*', { count: 'exact', head: true }).eq('status', 'interview');
  const { count: outreachSentCount } = await supabase.from('email_outreach').select('*', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', weekStartStr);
  const { count: outreachRepliedCount } = await supabase.from('email_outreach').select('*', { count: 'exact', head: true }).eq('status', 'replied').gte('created_at', weekStartStr);

  const emailReplyRate = outreachSentCount && outreachSentCount > 0 
    ? Number(((outreachRepliedCount || 0) / outreachSentCount * 100).toFixed(1)) 
    : 0;

  let aiInsights = '';

  if (!genAI) {
    aiInsights = `This week you sourced ${sourcedJobsCount || 0} jobs, submitted ${applicationsSentCount || 0} applications, and sent ${outreachSentCount || 0} cold emails with a ${emailReplyRate}% reply rate. You have ${interviewsCount || 0} active interviews. Keep building momentum!`;
  } else {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
You are a senior DevOps career strategist and executive coach.
Summarize the user's weekly job application & outreach metrics and provide 2-3 strategic insights.

Weekly Stats:
- Sourced DevOps/Cloud Jobs: ${sourcedJobsCount || 0}
- Applications Submitted: ${applicationsSentCount || 0}
- Recruiter Cold Emails Sent: ${outreachSentCount || 0}
- Cold Email Reply Rate: ${emailReplyRate}%
- Active Interviews: ${interviewsCount || 0}

INSTRUCTIONS:
Write a concise 3-paragraph executive summary (150 words max).
Highlight patterns (e.g. strong traction on Kubernetes/DevSecOps roles, recommendations for next week's target roles).
`;

    try {
      const response = await model.generateContent(prompt);
      aiInsights = response.response.text().trim();
    } catch (err: any) {
      console.error('⚠️ Gemini Metrics digest error:', err.message);
      aiInsights = `Sourced ${sourcedJobsCount || 0} jobs and submitted ${applicationsSentCount || 0} applications this week with ${interviewsCount || 0} active interviews.`;
    }
  }

  // Upsert metrics into Supabase metrics table
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

  return {
    weekStart: weekStart.toISOString().split('T')[0],
    weekEnd: now.toISOString().split('T')[0],
    sourcedJobsCount: sourcedJobsCount || 0,
    applicationsSentCount: applicationsSentCount || 0,
    responsesReceivedCount: responsesReceivedCount || 0,
    interviewsCount: interviewsCount || 0,
    outreachSentCount: outreachSentCount || 0,
    emailReplyRate,
    aiInsightsSummary: aiInsights
  };
}
