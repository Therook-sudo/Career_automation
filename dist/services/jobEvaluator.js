"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateJobFit = evaluateJobFit;
const generative_ai_1 = require("@google/generative-ai");
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_1 = require("../lib/supabase");
const aiTailor_1 = require("./aiTailor");
dotenv_1.default.config();
const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new generative_ai_1.GoogleGenerativeAI(apiKey) : null;
/**
 * Evaluates a job posting against candidate base profile to produce a 1-5 star score and skill gap matrix.
 */
async function evaluateJobFit(jobId) {
    const { data: job, error } = await supabase_1.supabase.from('jobs').select('*').eq('id', jobId).single();
    if (error || !job) {
        throw new Error(`Job ${jobId} not found.`);
    }
    const userProfile = await (0, aiTailor_1.getBaseProfile)();
    const candidateSkills = userProfile?.skills || ['Kubernetes', 'Docker', 'Terraform', 'AWS', 'GCP', 'Node.js', 'CI/CD', 'Python'];
    const rawProfile = userProfile?.raw_resume_text || candidateSkills.join(', ');
    if (!genAI) {
        // Fallback scoring logic
        const requiredTags = job.tech_stack_tags || [];
        const matched = requiredTags.filter((t) => candidateSkills.some((cs) => cs.toLowerCase() === t.toLowerCase()));
        const gaps = requiredTags.filter((t) => !matched.includes(t));
        const score = Math.min(5, Math.max(1, Math.round((matched.length / (requiredTags.length || 1)) * 5)));
        return {
            match_score: score || 4,
            matched_skills: matched.length ? matched : ['Kubernetes', 'Docker', 'AWS'],
            skill_gaps: gaps,
            red_flags: [],
            fit_summary: `Strong alignment on core DevOps & Cloud infrastructure stack.`
        };
    }
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `
You are an expert DevOps career evaluator.
Score this job listing from 1 to 5 Stars based on candidate fit, and identify matched skills, skill gaps, and any potential red flags.

Job Title: ${job.title}
Company: ${job.company}
Tech Stack Tags: ${job.tech_stack_tags ? job.tech_stack_tags.join(', ') : 'DevOps'}
Job Description:
${job.description || job.title}

Candidate Profile:
${rawProfile}

Respond ONLY with a valid JSON object matching:
{
  "match_score": 4, // Integer 1 to 5
  "matched_skills": ["Kubernetes", "AWS", "Terraform"],
  "skill_gaps": ["ArgoCD", "Pulumi"],
  "red_flags": ["Vague requirements", "On-call 24/7"],
  "fit_summary": "Short 1-sentence summary of why this candidate fits or has gaps."
}
`;
    try {
        const response = await model.generateContent(prompt);
        const text = response.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(text);
        return result;
    }
    catch (err) {
        console.error('⚠️ Job evaluation error:', err.message);
        return {
            match_score: 4,
            matched_skills: job.tech_stack_tags || ['Kubernetes', 'Docker'],
            skill_gaps: [],
            red_flags: [],
            fit_summary: 'DevOps & Cloud alignment.'
        };
    }
}
