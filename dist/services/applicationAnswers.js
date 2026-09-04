"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePortalAnswer = generatePortalAnswer;
const generative_ai_1 = require("@google/generative-ai");
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_1 = require("../lib/supabase");
const aiTailor_1 = require("./aiTailor");
dotenv_1.default.config();
const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new generative_ai_1.GoogleGenerativeAI(apiKey) : null;
/**
 * Generates custom answers for job portal form questions (e.g. "Why this company?", "Salary expectations", etc.)
 */
async function generatePortalAnswer(jobId, questionText) {
    const { data: job } = await supabase_1.supabase.from('jobs').select('*').eq('id', jobId).single();
    const company = job?.company || 'Target Company';
    const role = job?.title || 'DevOps Engineer';
    const userProfile = await (0, aiTailor_1.getBaseProfile)();
    const candidateName = userProfile?.full_name || 'Candidate';
    const rawProfile = userProfile?.raw_resume_text || 'DevOps Engineer experienced in Kubernetes, Docker, Terraform, AWS, GCP, and CI/CD.';
    if (!genAI) {
        return `I am excited to apply for the ${role} position at ${company}. My hands-on experience in Kubernetes, Terraform, and cloud infrastructure aligns directly with ${company}'s technical focus on scale and resilience. I welcome the opportunity to bring my DevOps background to your team.`;
    }
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `
You are an executive career advisor helping a candidate answer a job portal application question.

Candidate Name: ${candidateName}
Target Role: ${role}
Target Company: ${company}
Tech Stack Required: ${job?.tech_stack_tags ? job.tech_stack_tags.join(', ') : 'DevOps'}

Question to Answer: "${questionText}"

Candidate Profile & Experience:
${rawProfile}

CONSTRAINTS:
- Keep the response between 60 to 120 words.
- Natural, confident, professional tone.
- Do NOT invent fake companies or false credentials.
- Directly answer the question while highlighting candidate's DevOps/Cloud strengths.

Write the answer text below:
`;
    try {
        const response = await model.generateContent(prompt);
        return response.response.text().trim();
    }
    catch (err) {
        console.error('⚠️ Application answer error:', err.message);
        return `I am enthusiastic about the ${role} role at ${company}. My technical background in Cloud Architecture, Kubernetes, and automated CI/CD enables me to add immediate value to your infrastructure team.`;
    }
}
