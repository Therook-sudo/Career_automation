"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const telegraf_1 = require("telegraf");
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_1 = require("../lib/supabase");
const jobFetcher_1 = require("../services/jobFetcher");
const aiTailor_1 = require("../services/aiTailor");
const leadFinder_1 = require("../services/leadFinder");
const emailOutreach_1 = require("../services/emailOutreach");
const scholarshipFetcher_1 = require("../services/scholarshipFetcher");
const checklistGenerator_1 = require("../services/checklistGenerator");
const sopGenerator_1 = require("../services/sopGenerator");
const metricsEngine_1 = require("../services/metricsEngine");
dotenv_1.default.config();
const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN is required in environment variables!');
    process.exit(1);
}
const bot = new telegraf_1.Telegraf(botToken);
const allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
// Authorization middleware
bot.use(async (ctx, next) => {
    if (allowedUserId && ctx.from && ctx.from.id.toString() !== allowedUserId.toString()) {
        return ctx.reply('⛔ Unauthorized access. This bot is configured for a private pipeline.');
    }
    return next();
});
// /start command
bot.start((ctx) => {
    ctx.reply(`🤖 *Autonomous Career & Scholarship Pipeline Bot*\n\n` +
        `Welcome! Your personal DevOps/Cloud career sourcing and Masters scholarship tracking system is active.\n\n` +
        `📌 *Quick Commands*:\n` +
        `• /dashboard - View pipeline overview & stats\n` +
        `• /jobs - Browse latest sourced DevOps/Cloud jobs\n` +
        `• /apply <job_id> - Tailor CV for a specific job\n` +
        `• /outreach <job_id> - Draft & schedule cold email sequence\n` +
        `• /schools - View upcoming MSc programmes\n` +
        `• /scholarships - View fully-funded scholarships\n` +
        `• /checklist <school_id> - Generate AI application checklist\n` +
        `• /sop <school_id> - Generate Statement of Purpose (SOP)\n` +
        `• /tasks - View tasks due today & overdue items\n` +
        `• /help - Full command list`, { parse_mode: 'Markdown' });
});
// /help command
bot.help((ctx) => {
    ctx.reply(`🛠 *Pipeline Commands Reference*\n\n` +
        `*System A – Career Pipeline*:\n` +
        `• /jobs - Show recent DevOps / Cloud jobs\n` +
        `• /jobs_remote - Show remote-only job listings\n` +
        `• /fetch_jobs - Run automated job scrapers now\n` +
        `• /apply <job_id> - Tailor CV & create application record\n` +
        `• /outreach <job_id> - Discover recruiter & schedule email\n` +
        `• /outreach_pending - Show cold emails waiting to send\n\n` +
        `*System B – Scholarship & School Tracker*:\n` +
        `• /schools - Show upcoming MSc programmes\n` +
        `• /scholarships - Show fully-funded scholarships\n` +
        `• /fetch_schools - Run school sourcing sweep\n` +
        `• /checklist <school_id> - Generate AI task checklist\n` +
        `• /sop <school_id> - Generate Statement of Purpose (SOP)\n\n` +
        `*Unified Tools*:\n` +
        `• /dashboard - Live 7-day pipeline summary\n` +
        `• /tasks - Daily tasks & deadline checklist\n` +
        `• /resume - View or update your base CV profile`, { parse_mode: 'Markdown' });
});
// /fetch_jobs command
bot.command('fetch_jobs', async (ctx) => {
    ctx.reply('🔍 *Running DevOps/Cloud Job Sourcing Pipeline...*\nFetching from RemoteOK, WeWorkRemotely feeds...', { parse_mode: 'Markdown' });
    try {
        const stats = await (0, jobFetcher_1.runJobSourcingPipeline)();
        ctx.reply(`✅ *Job Sourcing Complete*\n` +
            `• Matching Jobs Sourced: *${stats.totalFetched}*\n` +
            `• Database Updates/Upserts: *${stats.upserted}*\n\n` +
            `Use /jobs to list the latest items!`, { parse_mode: 'Markdown' });
    }
    catch (error) {
        console.error('Job fetch command error:', error);
        ctx.reply('⚠️ Failed to complete job sourcing sweep.');
    }
});
// /fetch_schools command
bot.command('fetch_schools', async (ctx) => {
    ctx.reply('🔍 *Running School & Scholarship Sourcing Sweep...*', { parse_mode: 'Markdown' });
    try {
        const stats = await (0, scholarshipFetcher_1.runScholarshipSourcingPipeline)();
        ctx.reply(`✅ *School Sourcing Complete*\n` +
            `• MSc Programmes Stored: *${stats.programmesCount}*\n` +
            `• Fully-Funded Scholarships: *${stats.scholarshipsCount}*\n\n` +
            `Use /schools or /scholarships to list opportunities!`, { parse_mode: 'Markdown' });
    }
    catch (error) {
        console.error('School fetch command error:', error);
        ctx.reply('⚠️ Failed to complete school sourcing sweep.');
    }
});
// /dashboard command
bot.command('dashboard', async (ctx) => {
    try {
        const { count: openJobsCount } = await supabase_1.supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'open');
        const { count: appliedCount } = await supabase_1.supabase.from('job_applications').select('*', { count: 'exact', head: true }).eq('status', 'applied');
        const { count: interviewsCount } = await supabase_1.supabase.from('job_applications').select('*', { count: 'exact', head: true }).eq('status', 'interview');
        const { count: schoolsCount } = await supabase_1.supabase.from('programmes').select('*', { count: 'exact', head: true });
        const { count: pendingTasksCount } = await supabase_1.supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'pending');
        ctx.reply(`📊 *Unified Pipeline Dashboard*\n` +
            `───────────────\n` +
            `💼 *Career Pipeline*:\n` +
            `• Open Sourced Jobs: *${openJobsCount || 0}*\n` +
            `• Applications Sent: *${appliedCount || 0}*\n` +
            `• Active Interviews: *${interviewsCount || 0}*\n\n` +
            `🎓 *School & Scholarship Tracker*:\n` +
            `• MSc Programmes Tracked: *${schoolsCount || 0}*\n` +
            `• Pending Tasks/Checklists: *${pendingTasksCount || 0}*\n` +
            `───────────────\n` +
            `💡 _Tip: Use /jobs or /schools to inspect individual opportunities._`, { parse_mode: 'Markdown' });
    }
    catch (error) {
        console.error('Error fetching dashboard stats:', error);
        ctx.reply('⚠️ Error loading dashboard. Please verify Supabase credentials.');
    }
});
// /jobs command
bot.command('jobs', async (ctx) => {
    try {
        const { data: jobs, error } = await supabase_1.supabase
            .from('jobs')
            .select('*')
            .eq('status', 'open')
            .order('created_at', { ascending: false })
            .limit(5);
        if (error)
            throw error;
        if (!jobs || jobs.length === 0) {
            return ctx.reply('📭 No open jobs found in database yet. Use /fetch_jobs to trigger a sourcing sweep!');
        }
        let message = `🚀 *Latest Sourced Jobs*\n\n`;
        jobs.forEach((job, idx) => {
            message += `${idx + 1}. *${job.title}* @ ${job.company}\n`;
            message += `📍 ${job.location} ${job.is_remote ? '(Remote)' : ''}\n`;
            message += `🏷 Stack: ${job.tech_stack_tags ? job.tech_stack_tags.join(', ') : 'DevOps'}\n`;
            message += `🆔 ID: \`${job.id}\`\n`;
            message += `🔗 [Apply Link](${job.job_url})\n\n`;
        });
        ctx.reply(message, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
    }
    catch (error) {
        console.error('Error fetching jobs:', error);
        ctx.reply('⚠️ Failed to query jobs table.');
    }
});
// /apply <job_id> command
bot.command('apply', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    const jobId = parts[1]?.trim();
    if (!jobId) {
        return ctx.reply('⚠️ Usage: `/apply <job_id>`', { parse_mode: 'Markdown' });
    }
    ctx.reply(`🧠 *Tailoring Resume with Gemini AI for Job ID:* \`${jobId}\`...`, { parse_mode: 'Markdown' });
    try {
        const tailored = await (0, aiTailor_1.tailorResumeForJob)(jobId);
        if (!tailored)
            return ctx.reply('⚠️ Failed to generate tailored resume.');
        let message = `✅ *Resume Tailored Successfully!*\n\n`;
        message += `📝 *Summary Profile*:\n${tailored.tailored_summary}\n\n`;
        message += `🔑 *Matched Keywords*:\n\`${tailored.tailored_keywords.join(', ')}\`\n\n`;
        message += `🎯 *Key Custom Bullet Points*:\n`;
        tailored.custom_bullets.forEach((b) => { message += `• ${b}\n`; });
        message += `\n💡 _Use /outreach ${jobId} to draft cold outreach._`;
        ctx.reply(message, { parse_mode: 'Markdown' });
    }
    catch (error) {
        console.error('Apply command error:', error);
        ctx.reply(`⚠️ Error tailoring resume: ${error.message}`);
    }
});
// /outreach <job_id> command
bot.command('outreach', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    const jobId = parts[1]?.trim();
    if (!jobId) {
        return ctx.reply('⚠️ Usage: `/outreach <job_id>`', { parse_mode: 'Markdown' });
    }
    ctx.reply(`🔍 *Finding Hiring Contact & Drafting Email for Job:* \`${jobId}\`...`, { parse_mode: 'Markdown' });
    try {
        const { data: job } = await supabase_1.supabase.from('jobs').select('company').eq('id', jobId).single();
        const company = job?.company || 'Target Company';
        const contact = await (0, leadFinder_1.findOrProposeContact)(company);
        const outreach = await (0, emailOutreach_1.scheduleOutreachEmail)(jobId, contact.id, 1, 0);
        let message = `📧 *Cold Email Drafted & Scheduled!*\n\n`;
        message += `👤 *Contact*: ${contact.name} (${contact.role_title})\n`;
        message += `📬 *Email*: \`${contact.email}\`\n\n`;
        message += `📌 *Subject*: ${outreach.subject}\n\n`;
        message += `📜 *Body*:\n${outreach.body}\n\n`;
        message += `✅ *Scheduled for Send*: ${new Date(outreach.send_at).toLocaleDateString()}`;
        ctx.reply(message, { parse_mode: 'Markdown' });
    }
    catch (error) {
        console.error('Outreach command error:', error);
        ctx.reply(`⚠️ Error generating outreach: ${error.message}`);
    }
});
// /schools command
bot.command('schools', async (ctx) => {
    try {
        const { data: programmes, error } = await supabase_1.supabase
            .from('programmes')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);
        if (error)
            throw error;
        if (!programmes || programmes.length === 0) {
            return ctx.reply('📭 No MSc programmes stored in database yet. Use /fetch_schools to load opportunities!');
        }
        let message = `🎓 *MSc Programmes Tracked*\n\n`;
        programmes.forEach((prog, idx) => {
            message += `${idx + 1}. *${prog.name}*\n`;
            message += `🏛 ${prog.university} (${prog.country})\n`;
            message += `💰 Funding: ${prog.is_fully_funded ? 'Fully Funded' : prog.tuition_fee || 'Tuition Applies'}\n`;
            message += `🆔 ID: \`${prog.id}\`\n`;
            message += `🔗 [Programme Link](${prog.main_link})\n\n`;
        });
        ctx.reply(message, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
    }
    catch (error) {
        console.error('Error fetching programmes:', error);
        ctx.reply('⚠️ Failed to query programmes table.');
    }
});
// /scholarships command
bot.command('scholarships', async (ctx) => {
    try {
        const { data: scholarships, error } = await supabase_1.supabase
            .from('scholarships')
            .select('*')
            .order('deadline', { ascending: true })
            .limit(5);
        if (error)
            throw error;
        if (!scholarships || scholarships.length === 0) {
            return ctx.reply('📭 No scholarships found in database yet. Use /fetch_schools to populate!');
        }
        let message = `🏆 *Fully-Funded Scholarships*\n\n`;
        scholarships.forEach((schol, idx) => {
            message += `${idx + 1}. *${schol.name}*\n`;
            message += `🏛 Provider: ${schol.provider} (${schol.country})\n`;
            message += `💰 Coverage: ${schol.coverage}\n`;
            message += `📅 Deadline: ${schol.deadline ? new Date(schol.deadline).toLocaleDateString() : 'Rolling'}\n`;
            message += `🆔 ID: \`${schol.id}\`\n\n`;
        });
        ctx.reply(message, { parse_mode: 'Markdown' });
    }
    catch (error) {
        console.error('Error fetching scholarships:', error);
        ctx.reply('⚠️ Failed to query scholarships table.');
    }
});
// /checklist <school_id> command
bot.command('checklist', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    const schoolId = parts[1]?.trim();
    if (!schoolId) {
        return ctx.reply('⚠️ Usage: `/checklist <school_id>`', { parse_mode: 'Markdown' });
    }
    ctx.reply(`🧠 *Generating AI Application Checklist for School ID:* \`${schoolId}\`...`, { parse_mode: 'Markdown' });
    try {
        const tasks = await (0, checklistGenerator_1.generateScholarshipChecklist)(schoolId);
        let message = `📋 *Application Tasks Checklist Generated!*\n\n`;
        tasks.forEach((t, idx) => {
            message += `${idx + 1}. [${t.priority.toUpperCase()}] ${t.description}\n`;
            message += `   📅 Due: ${new Date(t.due_date).toLocaleDateString()}\n\n`;
        });
        message += `💡 _Tasks saved to database! Use /tasks to view your active schedule._`;
        ctx.reply(message, { parse_mode: 'Markdown' });
    }
    catch (error) {
        console.error('Checklist command error:', error);
        ctx.reply(`⚠️ Error generating checklist: ${error.message}`);
    }
});
// /sop <school_id> command
bot.command('sop', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    const schoolId = parts[1]?.trim();
    if (!schoolId) {
        return ctx.reply('⚠️ Usage: `/sop <school_id>`', { parse_mode: 'Markdown' });
    }
    ctx.reply(`✍️ *Generating Tailored Statement of Purpose (SOP) for School ID:* \`${schoolId}\`...`, { parse_mode: 'Markdown' });
    try {
        const sopDraft = await (0, sopGenerator_1.generateSopForProgramme)(schoolId);
        let message = `📜 *Statement of Purpose (SOP) Draft Created!*\n\n`;
        message += `${sopDraft.substring(0, 800)}...\n\n`;
        message += `💡 _Full SOP saved to database under scholarship_applications record._`;
        ctx.reply(message, { parse_mode: 'Markdown' });
    }
    catch (error) {
        console.error('SOP command error:', error);
        ctx.reply(`⚠️ Error generating SOP: ${error.message}`);
    }
});
// /tasks command
bot.command('tasks', async (ctx) => {
    try {
        const { data: tasks, error } = await supabase_1.supabase
            .from('tasks')
            .select('*')
            .eq('status', 'pending')
            .order('due_date', { ascending: true })
            .limit(5);
        if (error)
            throw error;
        if (!tasks || tasks.length === 0) {
            return ctx.reply('🎉 No pending tasks due! You are all caught up.');
        }
        let message = `📅 *Active Application Tasks*\n\n`;
        tasks.forEach((task, idx) => {
            message += `${idx + 1}. [${task.priority.toUpperCase()}] ${task.description}\n`;
            message += `   📅 Due Date: ${new Date(task.due_date).toLocaleDateString()}\n\n`;
        });
        ctx.reply(message, { parse_mode: 'Markdown' });
    }
    catch (error) {
        console.error('Tasks command error:', error);
        ctx.reply('⚠️ Failed to query tasks.');
    }
});
// /report command - Weekly AI Performance Synthesis
bot.command('report', async (ctx) => {
    ctx.reply('📊 *Computing 7-Day Performance Metrics & AI Synthesis Digest...*', { parse_mode: 'Markdown' });
    try {
        const report = await (0, metricsEngine_1.computeWeeklyMetrics)();
        let message = `🤖 *Weekly Performance & AI Synthesis Digest*\n`;
        message += `📅 *Period*: ${report.weekStart} to ${report.weekEnd}\n\n`;
        message += `📈 *Key Activity Metrics*:\n`;
        message += `• Sourced Jobs: *${report.sourcedJobsCount}*\n`;
        message += `• Applications Submitted: *${report.applicationsSentCount}*\n`;
        message += `• Recruiter Cold Emails Sent: *${report.outreachSentCount}*\n`;
        message += `• Cold Email Reply Rate: *${report.emailReplyRate}%*\n`;
        message += `• Active Interviews: *${report.interviewsCount}*\n\n`;
        message += `💡 *AI Insights & Strategic Synthesis*:\n`;
        message += `${report.aiInsightsSummary}`;
        ctx.reply(message, { parse_mode: 'Markdown' });
    }
    catch (error) {
        console.error('Report command error:', error);
        ctx.reply('⚠️ Error computing weekly performance report.');
    }
});
// Start bot & background sourcing schedulers
bot.launch().then(() => {
    console.log('🤖 Telegram Bot successfully launched & connected to Supabase!');
    // Run initial sourcing sweeps after startup
    setTimeout(() => {
        (0, jobFetcher_1.runJobSourcingPipeline)().catch((err) => console.error('Initial job fetch error:', err));
        (0, scholarshipFetcher_1.runScholarshipSourcingPipeline)().catch((err) => console.error('Initial school fetch error:', err));
    }, 5000);
    // Periodic 6-hour job sourcing trigger
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    setInterval(() => {
        console.log('⏰ Executing 6-hour scheduled job sourcing sweep...');
        (0, jobFetcher_1.runJobSourcingPipeline)().catch((err) => console.error('Scheduled job fetch error:', err));
    }, SIX_HOURS_MS);
});
// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
