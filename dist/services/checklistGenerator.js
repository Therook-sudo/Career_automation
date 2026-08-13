"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateScholarshipChecklist = generateScholarshipChecklist;
const generative_ai_1 = require("@google/generative-ai");
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_1 = require("../lib/supabase");
const aiTailor_1 = require("./aiTailor");
dotenv_1.default.config();
const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new generative_ai_1.GoogleGenerativeAI(apiKey) : null;
/**
 * AI Checklist & Requirement Parser for MSc Programmes & Scholarships
 */
async function generateScholarshipChecklist(programmeId) {
    const { data: programme, error } = await supabase_1.supabase.from('programmes').select('*').eq('id', programmeId).single();
    if (error || !programme) {
        throw new Error(`Programme with ID ${programmeId} not found.`);
    }
    const userProfile = await (0, aiTailor_1.getBaseProfile)();
    // Create or get scholarship application record
    let { data: scholApp } = await supabase_1.supabase.from('scholarship_applications').select('id').eq('programme_id', programmeId).single();
    if (!scholApp) {
        const { data: newApp } = await supabase_1.supabase.from('scholarship_applications').insert({
            programme_id: programmeId,
            status: 'planning',
            date_started: new Date().toISOString()
        }).select().single();
        scholApp = newApp;
    }
    const targetDeadline = new Date();
    targetDeadline.setMonth(targetDeadline.getMonth() + 3); // 90 days default buffer
    let tasksToCreate = [];
    if (!genAI) {
        // Fallback standard MSc application checklist
        tasksToCreate = [
            { description: `Draft & refine Statement of Purpose (SOP) for ${programme.name}`, bufferDaysBeforeDeadline: 45, priority: 'urgent' },
            { description: `Request Academic Recommendation Letters from 2 Professors / Managers`, bufferDaysBeforeDeadline: 40, priority: 'high' },
            { description: `Order & Apostille official University Transcripts & Degree Certificate`, bufferDaysBeforeDeadline: 35, priority: 'high' },
            { description: `Book & take IELTS Academic / TOEFL iBT English Test (Target: 7.0+)`, bufferDaysBeforeDeadline: 30, priority: 'medium' },
            { description: `Format DevOps & Cloud Engineering CV into Europass / Academic Format`, bufferDaysBeforeDeadline: 20, priority: 'medium' },
            { description: `Submit online application portal form for ${programme.university}`, bufferDaysBeforeDeadline: 7, priority: 'urgent' }
        ];
    }
    else {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const prompt = `
You are an expert international academic advisor specializing in MSc Computer Science, Cloud, and Security admissions.
Extract a step-by-step document preparation checklist for an applicant applying to this MSc programme.

Programme: ${programme.name}
University: ${programme.university} (${programme.country})
Degree & Field: ${programme.degree_level} in ${programme.field}
Funding: ${programme.is_fully_funded ? 'Fully Funded Scholarship' : programme.tuition_fee}

Candidate Profile:
${userProfile?.raw_resume_text || 'BSc Computer Science / DevOps Engineer'}

Output ONLY a valid JSON array of tasks matching this schema:
[
  {
    "description": "Specific action item description",
    "bufferDaysBeforeDeadline": 45,
    "priority": "urgent" | "high" | "medium" | "low"
  }
]
`;
        try {
            const response = await model.generateContent(prompt);
            const cleanJson = response.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            tasksToCreate = JSON.parse(cleanJson);
        }
        catch (err) {
            console.error('⚠️ Gemini Checklist extraction error:', err.message);
            tasksToCreate = [
                { description: `Draft Statement of Purpose for ${programme.name}`, bufferDaysBeforeDeadline: 30, priority: 'urgent' },
                { description: `Collect recommendation letters for ${programme.university}`, bufferDaysBeforeDeadline: 25, priority: 'high' }
            ];
        }
    }
    // Insert generated tasks into tasks table
    const insertedTasks = [];
    for (const item of tasksToCreate) {
        const dueDate = new Date(targetDeadline);
        dueDate.setDate(dueDate.getDate() - (item.bufferDaysBeforeDeadline || 15));
        const { data: taskData, error: taskError } = await supabase_1.supabase.from('tasks').insert({
            entity_type: 'scholarship',
            entity_id: scholApp?.id || programmeId,
            description: item.description,
            due_date: dueDate.toISOString(),
            status: 'pending',
            priority: item.priority || 'medium'
        }).select().single();
        if (!taskError && taskData) {
            insertedTasks.push(taskData);
        }
    }
    return insertedTasks;
}
