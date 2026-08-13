"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.draftPersonalizedEmail = draftPersonalizedEmail;
exports.scheduleOutreachEmail = scheduleOutreachEmail;
exports.sendOutreachEmail = sendOutreachEmail;
exports.cancelSequenceOnReply = cancelSequenceOnReply;
const resend_1 = require("resend");
const generative_ai_1 = require("@google/generative-ai");
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_1 = require("../lib/supabase");
const aiTailor_1 = require("./aiTailor");
dotenv_1.default.config();
const resendApiKey = process.env.RESEND_API_KEY || '';
const resend = resendApiKey ? new resend_1.Resend(resendApiKey) : null;
const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new generative_ai_1.GoogleGenerativeAI(apiKey) : null;
/**
 * Generates personalized cold email draft using Gemini AI
 */
async function draftPersonalizedEmail(jobId, contactId, sequenceStage = 1) {
    const { data: job } = await supabase_1.supabase.from('jobs').select('*').eq('id', jobId).single();
    const { data: contact } = await supabase_1.supabase.from('contacts').select('*').eq('id', contactId).single();
    const userProfile = await (0, aiTailor_1.getBaseProfile)();
    const candidateName = userProfile?.full_name || 'DevOps Engineer';
    const company = job?.company || contact?.company || 'Target Company';
    const jobTitle = job?.title || 'DevOps Engineer';
    if (!genAI) {
        // Fallback template if Gemini key is absent
        const fallbackSubjects = {
            1: `${jobTitle} Role @ ${company} - DevOps & Cloud Infrastructure Experience`,
            2: `Quick Follow-up regarding ${jobTitle} role @ ${company}`,
            3: `Cloud Security Architecture Project - ${jobTitle} @ ${company}`,
            4: `Final check-in: ${jobTitle} position`
        };
        const fallbackBodies = {
            1: `Hi ${contact?.name || 'there'},\n\nI noticed ${company} is hiring a ${jobTitle}. I'm a DevOps & Cloud Engineer specializing in Kubernetes, Terraform, and automated CI/CD pipelines.\n\nRecently, I built containerized cloud infrastructure that reduced deployment times by 40%. Given ${company}'s focus on cloud scale, I'd love to connect.\n\nBest regards,\n${candidateName}`,
            2: `Hi ${contact?.name || 'there'},\n\nFollowing up on my previous message regarding the ${jobTitle} role. I'd welcome a brief 10-minute chat to discuss how I can support ${company}'s cloud goals.\n\nBest,\n${candidateName}`,
            3: `Hi ${contact?.name || 'there'},\n\nThought you might find this interesting: I recently published a DevSecOps automated vulnerability scanning template for Kubernetes workloads. Would love to share how this applies to ${company}.\n\nBest,\n${candidateName}`,
            4: `Hi ${contact?.name || 'there'},\n\nI understand you're busy! This is my final check-in. If you ever need a DevOps / Cloud Specialist at ${company}, feel free to keep my details handy.\n\nBest,\n${candidateName}`
        };
        return {
            subject: fallbackSubjects[sequenceStage] || fallbackSubjects[1],
            body: fallbackBodies[sequenceStage] || fallbackBodies[1]
        };
    }
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `
You are drafting a concise, highly personalized cold email for a job application outreach sequence.

Sequence Stage: ${sequenceStage} (1=Initial outreach, 2=Short reminder, 3=Value-add project link, 4=Breakup email)
Candidate Name: ${candidateName}
Target Role: ${jobTitle}
Target Company: ${company}
Contact Name: ${contact?.name || 'Hiring Manager'}
Tech Stack Required: ${job?.tech_stack_tags ? job.tech_stack_tags.join(', ') : 'DevOps, Kubernetes, Cloud'}

CONSTRAINTS:
- Maximum 120 words.
- Natural, professional, human tone (NOT spammy or robotic).
- Do NOT exaggerate or invent fake experience.
- Include a direct call to action.

Respond ONLY with valid JSON matching:
{
  "subject": "Email Subject Line",
  "body": "Email Body Text"
}
`;
    try {
        const response = await model.generateContent(prompt);
        const text = response.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(text);
    }
    catch (error) {
        console.error('⚠️ AI Email Draft error:', error.message);
        return {
            subject: `${jobTitle} Role @ ${company}`,
            body: `Hi ${contact?.name || 'there'},\n\nI'm reaching out regarding the ${jobTitle} position at ${company}. I have hands-on experience in Kubernetes, Terraform, and cloud infrastructure.\n\nBest regards,\n${candidateName}`
        };
    }
}
/**
 * Creates and schedules an email outreach sequence entry in Supabase.
 */
async function scheduleOutreachEmail(jobId, contactId, sequenceStage = 1, delayDays = 0) {
    const draft = await draftPersonalizedEmail(jobId, contactId, sequenceStage);
    const sendAtDate = new Date();
    sendAtDate.setDate(sendAtDate.getDate() + delayDays);
    const { data, error } = await supabase_1.supabase.from('email_outreach').insert({
        job_id: jobId,
        contact_id: contactId,
        channel: 'email',
        subject: draft.subject,
        body: draft.body,
        status: 'scheduled',
        send_at: sendAtDate.toISOString(),
        follow_up_sequence_id: sequenceStage
    }).select().single();
    if (error || !data) {
        throw new Error('Failed to schedule outreach email.');
    }
    return data;
}
/**
 * Sends a scheduled email via Resend API
 */
async function sendOutreachEmail(outreachId) {
    const { data: outreach, error } = await supabase_1.supabase.from('email_outreach').select('*, contacts(*)').eq('id', outreachId).single();
    if (error || !outreach) {
        console.error('Outreach record not found:', outreachId);
        return false;
    }
    if (outreach.status === 'cancelled' || outreach.status === 'replied') {
        console.log(`Skipping send for outreach ${outreachId} because status is ${outreach.status}`);
        return false;
    }
    const senderEmail = process.env.OUTREACH_SENDER_EMAIL || 'onboarding@resend.dev';
    const recipientEmail = outreach.contacts?.email || 'test@example.com';
    if (!resend) {
        console.warn(`⚠️ RESEND_API_KEY missing. Simulating email send to ${recipientEmail}`);
        await supabase_1.supabase.from('email_outreach').update({
            status: 'sent',
            sent_at: new Date().toISOString()
        }).eq('id', outreachId);
        return true;
    }
    try {
        await resend.emails.send({
            from: senderEmail,
            to: recipientEmail,
            subject: outreach.subject || 'DevOps Role Inquiry',
            text: outreach.body
        });
        await supabase_1.supabase.from('email_outreach').update({
            status: 'sent',
            sent_at: new Date().toISOString()
        }).eq('id', outreachId);
        console.log(`✅ Email sent via Resend to ${recipientEmail}`);
        return true;
    }
    catch (err) {
        console.error('⚠️ Resend email send error:', err.message);
        await supabase_1.supabase.from('email_outreach').update({ status: 'bounced' }).eq('id', outreachId);
        return false;
    }
}
/**
 * Auto-cancels remaining scheduled follow-up sequence steps when a recipient reply is detected.
 */
async function cancelSequenceOnReply(contactId) {
    const { data, error } = await supabase_1.supabase
        .from('email_outreach')
        .update({ status: 'cancelled' })
        .eq('contact_id', contactId)
        .eq('status', 'scheduled')
        .select();
    if (error) {
        console.error('Error canceling sequence on reply:', error);
        return 0;
    }
    console.log(`🛑 Auto-cancelled ${data?.length || 0} pending follow-up emails for contact ${contactId}`);
    return data?.length || 0;
}
