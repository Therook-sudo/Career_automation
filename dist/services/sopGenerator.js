"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSopForProgramme = generateSopForProgramme;
const generative_ai_1 = require("@google/generative-ai");
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_1 = require("../lib/supabase");
const aiTailor_1 = require("./aiTailor");
dotenv_1.default.config();
const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new generative_ai_1.GoogleGenerativeAI(apiKey) : null;
/**
 * AI Statement of Purpose (SOP) Generator for MSc University Applications
 */
async function generateSopForProgramme(programmeId) {
    const { data: programme, error } = await supabase_1.supabase.from('programmes').select('*').eq('id', programmeId).single();
    if (error || !programme) {
        throw new Error(`Programme with ID ${programmeId} not found.`);
    }
    const userProfile = await (0, aiTailor_1.getBaseProfile)();
    const candidateName = userProfile?.full_name || 'Candidate';
    const rawProfile = userProfile?.raw_resume_text || 'DevOps & Cloud Engineer with experience in Kubernetes, Terraform, AWS, and Security.';
    if (!genAI) {
        // Fallback SOP draft template
        const fallbackSop = `STATEMENT OF PURPOSE\n\n` +
            `Applicant: ${candidateName}\n` +
            `Target Programme: ${programme.name}\n` +
            `University: ${programme.university} (${programme.country})\n\n` +
            `My passion for cloud infrastructure, distributed systems, and security drives my application to the ${programme.name} at ${programme.university}. Having worked as a DevOps and Cloud Engineer, I have architected resilient containerized environments, automated CI/CD pipelines, and enforced DevSecOps standards.\n\n` +
            `The specialized curriculum offered at ${programme.university} aligns perfectly with my career goal to lead large-scale cloud security research and engineering. I am particularly drawn to ${programme.field} and look forward to contributing my technical experience to the academic community.\n\n` +
            `Sincerely,\n${candidateName}`;
        await saveSopDraft(programmeId, fallbackSop);
        return fallbackSop;
    }
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `
You are an expert academic advisor writing a compelling, professional Statement of Purpose (SOP) for a Masters degree application.

Applicant Name: ${candidateName}
Target Programme: ${programme.name}
Target University: ${programme.university} (${programme.country})
Degree & Field: ${programme.degree_level} in ${programme.field}
Funding Focus: ${programme.is_fully_funded ? 'Erasmus Mundus / Fully Funded Scholarship' : 'Merit Scholarship'}

Candidate Background:
${rawProfile}

SOP STRUCTURE & GUIDELINES:
1. Introduction: Hook expressing strong interest in ${programme.name} at ${programme.university}.
2. Technical Background: Connect candidate's DevOps, Kubernetes, Cloud, and Security projects to academic readiness.
3. Why this Programme: Mention specific coursework, labs, or research focus in ${programme.field}.
4. Future Goals: Explain how this MSc supports long-term leadership in Cloud Architecture & Security.
5. Tone: Intellectual, ambitious, polished academic tone (~500 - 700 words).

Write the complete Statement of Purpose below:
`;
    try {
        const response = await model.generateContent(prompt);
        const sopText = response.response.text().trim();
        await saveSopDraft(programmeId, sopText);
        return sopText;
    }
    catch (err) {
        console.error('⚠️ Gemini SOP Generator error:', err.message);
        throw err;
    }
}
/**
 * Saves SOP draft to scholarship_applications record
 */
async function saveSopDraft(programmeId, sopText) {
    const { data: existing } = await supabase_1.supabase.from('scholarship_applications').select('id').eq('programme_id', programmeId).single();
    if (existing) {
        await supabase_1.supabase.from('scholarship_applications').update({
            sop_draft: sopText
        }).eq('id', existing.id);
    }
    else {
        await supabase_1.supabase.from('scholarship_applications').insert({
            programme_id: programmeId,
            status: 'planning',
            sop_draft: sopText,
            date_started: new Date().toISOString()
        });
    }
}
