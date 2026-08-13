import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { supabase } from '../lib/supabase';
import { Job, UserProfile } from '../types/database';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface TailoredResumeResult {
  tailored_summary: string;
  tailored_keywords: string[];
  custom_bullets: string[];
}

/**
 * Retrieves the candidate's base profile from Supabase user_profile table.
 */
export async function getBaseProfile(): Promise<UserProfile | null> {
  const { data, error } = await supabase.from('user_profile').select('*').limit(1).single();
  if (error || !data) {
    return null;
  }
  return data as UserProfile;
}

/**
 * AI Resume Tailoring Service using Google Gemini 2.5/2.0 Flash
 */
export async function tailorResumeForJob(jobId: string): Promise<TailoredResumeResult | null> {
  // 1. Fetch Job Details
  const { data: job, error: jobError } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (jobError || !job) {
    throw new Error(`Job with ID ${jobId} not found.`);
  }

  // 2. Fetch User Base Profile
  const userProfile = await getBaseProfile();
  const rawProfileText = userProfile?.raw_resume_text || 
    `DevOps & Cloud Engineer experienced in Kubernetes, Docker, Terraform, AWS, GCP, Node.js, and CI/CD pipelines.`;

  // 3. Fallback if Gemini API Key is missing
  if (!genAI) {
    console.warn('⚠️ GEMINI_API_KEY missing. Returning mock tailored resume output.');
    const mockResult: TailoredResumeResult = {
      tailored_summary: `DevOps Engineer specializing in ${job.title} roles at ${job.company}, focusing on cloud infrastructure, Kubernetes, and automated CI/CD pipelines.`,
      tailored_keywords: job.tech_stack_tags || ['Kubernetes', 'Docker', 'AWS', 'Terraform', 'CI/CD'],
      custom_bullets: [
        `Architected resilient Kubernetes and containerized infrastructure tailored for ${job.company}'s cloud workload.`,
        `Automated Terraform infrastructure provisioning reducing deployment downtime by 40%.`,
        `Integrated DevSecOps automated vulnerability scanning into active Node.js / Docker CI/CD pipelines.`
      ]
    };

    await saveTailoredApplication(job.id, mockResult);
    return mockResult;
  }

  // 4. Build Prompt for Gemini LLM
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `
You are an expert DevOps, Cloud, and DevSecOps resume optimizer.
Your objective is to tailor the candidate's base experience for a specific job description.

STRICT GUARDRAIL: Do NOT fabricate, invent, or hallucinate companies, degrees, dates, or unearned certifications. You may ONLY re-word, re-prioritize, and highlight relevant matching skills.

Candidate Base Profile:
${rawProfileText}

Target Job Title: ${job.title}
Target Company: ${job.company}
Target Job Description:
${job.description || job.title}
Tech Stack Required: ${job.tech_stack_tags ? job.tech_stack_tags.join(', ') : 'DevOps'}

Respond ONLY with a valid JSON object matching this exact schema:
{
  "tailored_summary": "3-sentence executive profile summary highlighting relevant DevOps/Cloud achievements for this job",
  "tailored_keywords": ["Array", "of", "top", "10", "matching", "keywords"],
  "custom_bullets": [
    "3 re-ordered and re-worded bullet points showcasing relevant experience matching JD"
  ]
}
`;

  try {
    const response = await model.generateContent(prompt);
    const responseText = response.response.text();
    
    // Clean JSON formatting if wrapped in ```json ... ```
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const result: TailoredResumeResult = JSON.parse(cleanJson);

    await saveTailoredApplication(job.id, result);
    return result;
  } catch (error: any) {
    console.error('⚠️ Gemini AI Tailoring error:', error.message);
    throw error;
  }
}

/**
 * Persists tailored application into job_applications table.
 */
async function saveTailoredApplication(jobId: string, result: TailoredResumeResult) {
  const { data: existing } = await supabase.from('job_applications').select('id').eq('job_id', jobId).single();

  if (existing) {
    await supabase.from('job_applications').update({
      tailored_summary: result.tailored_summary,
      tailored_keywords: result.tailored_keywords,
      custom_bullets: result.custom_bullets,
      last_update: new Date().toISOString()
    }).eq('id', existing.id);
  } else {
    await supabase.from('job_applications').insert({
      job_id: jobId,
      status: 'planning',
      tailored_summary: result.tailored_summary,
      tailored_keywords: result.tailored_keywords,
      custom_bullets: result.custom_bullets,
      application_channel: 'portal',
      date_applied: new Date().toISOString()
    });
  }
}
