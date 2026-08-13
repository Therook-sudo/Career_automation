"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBaseProfile = getBaseProfile;
exports.tailorResumeForJob = tailorResumeForJob;
const generative_ai_1 = require("@google/generative-ai");
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_1 = require("../lib/supabase");
dotenv_1.default.config();
const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new generative_ai_1.GoogleGenerativeAI(apiKey) : null;
/**
 * Retrieves the candidate's base profile from Supabase user_profile table.
 */
async function getBaseProfile() {
    const { data, error } = await supabase_1.supabase.from('user_profile').select('*').limit(1).single();
    if (error || !data) {
        return null;
    }
    return data;
}
/**
 * AI Resume Tailoring Service using Google Gemini 2.5/2.0 Flash
 */
async function tailorResumeForJob(jobId) {
    // 1. Fetch Job Details
    const { data: job, error: jobError } = await supabase_1.supabase.from('jobs').select('*').eq('id', jobId).single();
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
        const mockResult = {
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
        const result = JSON.parse(cleanJson);
        await saveTailoredApplication(job.id, result);
        return result;
    }
    catch (error) {
        console.error('⚠️ Gemini AI Tailoring error:', error.message);
        throw error;
    }
}
/**
 * Persists tailored application into job_applications table.
 */
async function saveTailoredApplication(jobId, result) {
    const { data: existing } = await supabase_1.supabase.from('job_applications').select('id').eq('job_id', jobId).single();
    if (existing) {
        await supabase_1.supabase.from('job_applications').update({
            tailored_summary: result.tailored_summary,
            tailored_keywords: result.tailored_keywords,
            custom_bullets: result.custom_bullets,
            last_update: new Date().toISOString()
        }).eq('id', existing.id);
    }
    else {
        await supabase_1.supabase.from('job_applications').insert({
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
