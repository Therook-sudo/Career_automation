import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';
import { supabase } from '../lib/supabase';
import { runJobSourcingPipeline } from '../services/jobFetcher';

dotenv.config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required in environment variables!');
  process.exit(1);
}

const bot = new Telegraf(botToken);
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
  ctx.reply(
    `🤖 *Autonomous Career & Scholarship Pipeline Bot*\n\n` +
    `Welcome! Your personal DevOps/Cloud career sourcing and Masters scholarship tracking system is active.\n\n` +
    `📌 *Quick Commands*:\n` +
    `• /dashboard - View pipeline overview & stats\n` +
    `• /jobs - Browse latest sourced DevOps/Cloud jobs\n` +
    `• /fetch_jobs - Trigger manual job sourcing sweep\n` +
    `• /schools - View upcoming MSc programmes & scholarships\n` +
    `• /tasks - View tasks due today & overdue items\n` +
    `• /resume - Upload or view your base CV profile\n` +
    `• /help - Full command list`,
    { parse_mode: 'Markdown' }
  );
});

// /help command
bot.help((ctx) => {
  ctx.reply(
    `🛠 *Pipeline Commands Reference*\n\n` +
    `*System A – Career Pipeline*:\n` +
    `• /jobs - Show recent DevOps / Cloud jobs\n` +
    `• /jobs_remote - Show remote-only job listings\n` +
    `• /fetch_jobs - Run automated job scrapers now\n` +
    `• /apply <job_id> - Tailor CV & create application record\n` +
    `• /outreach_pending - Show cold emails/DMs waiting for review\n\n` +
    `*System B – Scholarship & School Tracker*:\n` +
    `• /schools - Show upcoming MSc programmes & deadlines\n` +
    `• /scholarships - Show fully-funded scholarships\n` +
    `• /sop_draft <school_id> - Generate AI Statement of Purpose\n\n` +
    `*Unified Tools*:\n` +
    `• /dashboard - Live 7-day pipeline summary\n` +
    `• /tasks - Daily tasks & deadline checklist\n` +
    `• /resume - Send text/file to update your base profile\n` +
    `• /report - Weekly AI synthesis digest`,
    { parse_mode: 'Markdown' }
  );
});

// /fetch_jobs command
bot.command('fetch_jobs', async (ctx) => {
  ctx.reply('🔍 *Running DevOps/Cloud Job Sourcing Pipeline...*\nFetching from RemoteOK, WeWorkRemotely feeds...', { parse_mode: 'Markdown' });
  try {
    const stats = await runJobSourcingPipeline();
    ctx.reply(
      `✅ *Sourcing Sweep Complete*\n` +
      `• Matching Jobs Sourced: *${stats.totalFetched}*\n` +
      `• Database Updates/Upserts: *${stats.upserted}*\n\n` +
      `Use /jobs to list the latest items!`,
      { parse_mode: 'Markdown' }
    );
  } catch (error: any) {
    console.error('Job fetch command error:', error);
    ctx.reply('⚠️ Failed to complete job sourcing sweep.');
  }
});

// /dashboard command
bot.command('dashboard', async (ctx) => {
  try {
    const { count: openJobsCount } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'open');
    const { count: appliedCount } = await supabase.from('job_applications').select('*', { count: 'exact', head: true }).eq('status', 'applied');
    const { count: interviewsCount } = await supabase.from('job_applications').select('*', { count: 'exact', head: true }).eq('status', 'interview');
    const { count: schoolsCount } = await supabase.from('programmes').select('*', { count: 'exact', head: true });
    const { count: pendingTasksCount } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'pending');

    ctx.reply(
      `📊 *Unified Pipeline Dashboard*\n` +
      `───────────────\n` +
      `💼 *Career Pipeline*:\n` +
      `• Open Sourced Jobs: *${openJobsCount || 0}*\n` +
      `• Applications Sent: *${appliedCount || 0}*\n` +
      `• Active Interviews: *${interviewsCount || 0}*\n\n` +
      `🎓 *School & Scholarship Tracker*:\n` +
      `• MSc Programmes Tracked: *${schoolsCount || 0}*\n` +
      `• Pending Tasks/Checklists: *${pendingTasksCount || 0}*\n` +
      `───────────────\n` +
      `💡 _Tip: Use /jobs or /schools to inspect individual opportunities._`,
      { parse_mode: 'Markdown' }
    );
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    ctx.reply('⚠️ Error loading dashboard. Please verify Supabase credentials.');
  }
});

// /jobs command
bot.command('jobs', async (ctx) => {
  try {
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;

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
  } catch (error: any) {
    console.error('Error fetching jobs:', error);
    ctx.reply('⚠️ Failed to query jobs table.');
  }
});

// /jobs_remote command
bot.command('jobs_remote', async (ctx) => {
  try {
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'open')
      .eq('is_remote', true)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;

    if (!jobs || jobs.length === 0) {
      return ctx.reply('📭 No remote jobs found. Use /fetch_jobs to run the scrapers!');
    }

    let message = `🌐 *Remote-Only DevOps Roles*\n\n`;
    jobs.forEach((job, idx) => {
      message += `${idx + 1}. *${job.title}* @ ${job.company}\n`;
      message += `🏷 Stack: ${job.tech_stack_tags ? job.tech_stack_tags.join(', ') : 'DevOps'}\n`;
      message += `🆔 ID: \`${job.id}\`\n`;
      message += `🔗 [Apply Link](${job.job_url})\n\n`;
    });

    ctx.reply(message, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
  } catch (error: any) {
    console.error('Error fetching remote jobs:', error);
    ctx.reply('⚠️ Failed to query jobs table.');
  }
});

// /schools command
bot.command('schools', async (ctx) => {
  try {
    const { data: programmes, error } = await supabase
      .from('programmes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;

    if (!programmes || programmes.length === 0) {
      return ctx.reply('📭 No MSc programmes stored in database yet.');
    }

    let message = `🎓 *Masters Programmes & Scholarships*\n\n`;
    programmes.forEach((prog, idx) => {
      message += `${idx + 1}. *${prog.name}*\n`;
      message += `🏛 ${prog.university} (${prog.country})\n`;
      message += `💰 Funding: ${prog.is_fully_funded ? 'Fully Funded' : prog.tuition_fee || 'Tuition Fee Applies'}\n`;
      message += `🔗 [Programme Link](${prog.main_link})\n\n`;
    });

    ctx.reply(message, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
  } catch (error: any) {
    console.error('Error fetching programmes:', error);
    ctx.reply('⚠️ Failed to query programmes table.');
  }
});

// Start bot & background sourcing scheduler (Every 6 hours)
bot.launch().then(() => {
  console.log('🤖 Telegram Bot successfully launched & connected to Supabase!');

  // Run initial job fetch after startup (delayed 5s)
  setTimeout(() => {
    runJobSourcingPipeline().catch((err) => console.error('Initial job fetch error:', err));
  }, 5000);

  // Periodic 6-hour job sourcing trigger
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  setInterval(() => {
    console.log('⏰ Executing 6-hour scheduled job sourcing sweep...');
    runJobSourcingPipeline().catch((err) => console.error('Scheduled job fetch error:', err));
  }, SIX_HOURS_MS);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

