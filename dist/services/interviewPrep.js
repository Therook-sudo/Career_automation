"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateInterviewPrep = generateInterviewPrep;
const generative_ai_1 = require("@google/generative-ai");
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_1 = require("../lib/supabase");
const aiTailor_1 = require("./aiTailor");
dotenv_1.default.config();
const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new generative_ai_1.GoogleGenerativeAI(apiKey) : null;
/**
 * Generates STAR Method Interview Stories & Technical Preparation Guide
 */
async function generateInterviewPrep(jobId) {
    const { data: job, error } = await supabase_1.supabase.from('jobs').select('*').eq('id', jobId).single();
    if (error || !job) {
        throw new Error(`Job ${jobId} not found.`);
    }
    const userProfile = await (0, aiTailor_1.getBaseProfile)();
    const candidateName = userProfile?.full_name || 'DevOps Candidate';
    const rawProfile = userProfile?.raw_resume_text || 'DevOps & Cloud Engineer experienced in Kubernetes, Docker, Terraform, AWS, and CI/CD.';
    if (!genAI) {
        // Fallback STAR stories
        return {
            role_title: job.title,
            company: job.company,
            star_stories: [
                {
                    situation: `High deployment downtime and manual infrastructure provisioning at scale.`,
                    task: `Automate cloud infrastructure and reduce deployment pipeline failures for ${job.company}.`,
                    action: `Designed Terraform IaC modules and built automated GitHub Actions / GitLab CI/CD containerized pipelines with Kubernetes.`,
                    result: `Reduced deployment time by 45% and eliminated 90% of manual deployment errors.`
                },
                {
                    situation: `Unidentified security vulnerabilities in Docker images reaching production.`,
                    task: `Enforce DevSecOps vulnerability scanning across microservice containers.`,
                    action: `Integrated Trivy / Aqua Security automated image scanning into active CI/CD loops with automated threshold blockers.`,
                    result: `Achieved 100% vulnerability compliance prior to staging releases.`
                }
            ],
            technical_questions: [
                `How do you handle zero-downtime rolling updates in Kubernetes?`,
                `Describe your approach to state management in Terraform when working in a team.`,
                `How do you secure containerized microservices and manage secrets in AWS/GCP?`
            ]
        };
    }
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `
You are an executive DevOps Interview Coach.
Generate a structured STAR (Situation, Task, Action, Result) interview preparation guide tailored specifically for this candidate applying to this role.

Target Role: ${job.title}
Target Company: ${job.company}
Tech Stack Required: ${job.tech_stack_tags ? job.tech_stack_tags.join(', ') : 'DevOps, Kubernetes, Cloud'}
Job Description:
${job.description || job.title}

Candidate Profile:
${rawProfile}

Respond ONLY with valid JSON matching:
{
  "role_title": "${job.title}",
  "company": "${job.company}",
  "star_stories": [
    {
      "situation": "Context & problem faced in past DevOps work",
      "task": "Target objective",
      "action": "Cloud tools & implementation steps taken",
      "result": "Quantifiable outcome (e.g. 40% speedup, 99.9% uptime)"
    }
  ],
  "technical_questions": [
    "3 specific high-probability technical interview questions for this role"
  ]
}
`;
    try {
        const response = await model.generateContent(prompt);
        const text = response.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(text);
    }
    catch (err) {
        console.error('⚠️ Interview prep generation error:', err.message);
        throw err;
    }
}
