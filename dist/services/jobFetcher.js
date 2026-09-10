"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runJobSourcingPipeline = runJobSourcingPipeline;
const axios_1 = __importDefault(require("axios"));
const rss_parser_1 = __importDefault(require("rss-parser"));
const supabase_1 = require("../lib/supabase");
const rssParser = new rss_parser_1.default();
// Keyword Filter Criteria
const TITLE_KEYWORDS = [
    'devops',
    'cloud',
    'sre',
    'site reliability',
    'platform',
    'devsecops',
    'infrastructure',
    'security engineer',
    'systems engineer',
    'kubernetes',
    'scholarship',
    'masters'
];
const TECH_STACK_TAGS = [
    'Kubernetes',
    'Docker',
    'Terraform',
    'AWS',
    'GCP',
    'Azure',
    'CI/CD',
    'Node.js',
    'Python',
    'Ansible',
    'Helm',
    'Prometheus',
    'Grafana',
    'Security'
];
/**
 * Evaluates whether a job title & description match the user's DevOps/Cloud focus.
 */
function isRelevantJob(title, description = '') {
    const combinedText = `${title} ${description}`.toLowerCase();
    return TITLE_KEYWORDS.some((keyword) => combinedText.includes(keyword));
}
/**
 * Extracts tech stack tags present in the job title/description.
 */
function extractTechTags(title, description = '') {
    const combinedText = `${title} ${description}`.toLowerCase();
    return TECH_STACK_TAGS.filter((tag) => combinedText.includes(tag.toLowerCase()));
}
/**
 * Sourcing Source 1: RemoteOK API
 */
async function fetchRemoteOKJobs() {
    try {
        const response = await axios_1.default.get('https://remoteok.com/api', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        if (!Array.isArray(response.data))
            return [];
        const jobsData = response.data.slice(1); // First element is disclaimer
        const results = [];
        for (const item of jobsData) {
            const title = item.position || item.title || '';
            const description = item.description || '';
            if (isRelevantJob(title, description)) {
                results.push({
                    title,
                    company: item.company || 'Unknown',
                    location: item.location || 'Remote',
                    is_remote: true,
                    tech_stack_tags: Array.from(new Set([...(item.tags || []), ...extractTechTags(title, description)])),
                    source: 'RemoteOK',
                    job_url: item.url || item.apply_url || `https://remoteok.com/remote-jobs/${item.id}`,
                    description,
                    posted_date: item.date ? new Date(item.date).toISOString() : new Date().toISOString(),
                    status: 'open'
                });
            }
        }
        return results;
    }
    catch (error) {
        console.error('⚠️ RemoteOK fetch error:', error.message);
        return [];
    }
}
/**
 * Sourcing Source 2: WeWorkRemotely RSS
 */
async function fetchWeWorkRemotelyJobs() {
    try {
        const feed = await rssParser.parseURL('https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss');
        const results = [];
        for (const item of feed.items) {
            const title = item.title || '';
            const description = item.content || item.summary || '';
            let company = 'Unknown';
            let cleanTitle = title;
            if (title.includes(':')) {
                const parts = title.split(':');
                company = parts[0].trim();
                cleanTitle = parts.slice(1).join(':').trim();
            }
            if (isRelevantJob(cleanTitle, description)) {
                results.push({
                    title: cleanTitle,
                    company,
                    location: 'Remote',
                    is_remote: true,
                    tech_stack_tags: extractTechTags(cleanTitle, description),
                    source: 'WeWorkRemotely',
                    job_url: item.link || item.guid || `https://weworkremotely.com/jobs/${item.id}`,
                    description,
                    posted_date: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
                    status: 'open'
                });
            }
        }
        return results;
    }
    catch (error) {
        console.error('⚠️ WeWorkRemotely fetch error:', error.message);
        return [];
    }
}
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Sourcing Source 3: Google Alerts RSS Feed Integration (Supports multiple URLs)
 */
async function fetchGoogleAlertsJobs() {
    const urls = [];
    // 1. Read from environment variable (comma or newline separated)
    const envUrls = process.env.GOOGLE_ALERTS_RSS_URLS || process.env.GOOGLE_ALERTS_RSS_URL || '';
    if (envUrls) {
        const parsed = envUrls.split(/[\r\n,]+/).map((u) => u.trim()).filter(Boolean);
        urls.push(...parsed);
    }
    // 2. Read from config/google_alerts.txt if present
    const configPath = path_1.default.join(process.cwd(), 'config', 'google_alerts.txt');
    if (fs_1.default.existsSync(configPath)) {
        try {
            const fileContent = fs_1.default.readFileSync(configPath, 'utf8');
            const fileUrls = fileContent.split(/\r?\n/).map((u) => u.trim()).filter((u) => u && !u.startsWith('#'));
            urls.push(...fileUrls);
        }
        catch (err) {
            console.warn('⚠️ Could not read config/google_alerts.txt:', err.message);
        }
    }
    // Deduplicate URLs
    const uniqueUrls = Array.from(new Set(urls));
    if (uniqueUrls.length === 0)
        return [];
    console.log(`📡 Fetching from ${uniqueUrls.length} Google Alerts RSS feed(s)...`);
    const allResults = [];
    await Promise.allSettled(uniqueUrls.map(async (feedUrl) => {
        try {
            const feed = await rssParser.parseURL(feedUrl);
            for (const item of feed.items) {
                const title = (item.title || '').replace(/<[^>]*>?/gm, ''); // Clean HTML
                const description = (item.content || item.summary || '').replace(/<[^>]*>?/gm, '');
                if (isRelevantJob(title, description)) {
                    allResults.push({
                        title: title || 'DevOps Opportunity',
                        company: 'Google Alerts Source',
                        location: 'Remote / Unspecified',
                        is_remote: true,
                        tech_stack_tags: extractTechTags(title, description),
                        source: 'Google Alerts',
                        job_url: item.link || item.guid || '',
                        description,
                        posted_date: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
                        status: 'open'
                    });
                }
            }
        }
        catch (err) {
            console.error(`⚠️ Error fetching Google Alert feed (${feedUrl}):`, err.message);
        }
    }));
    return allResults;
}
/**
 * Main Job Sourcing Orchestrator
 */
async function runJobSourcingPipeline() {
    console.log('🔄 Sourcing jobs from remote feeds & Google Alerts...');
    const remoteOKJobs = await fetchRemoteOKJobs();
    const wwrJobs = await fetchWeWorkRemotelyJobs();
    const alertsJobs = await fetchGoogleAlertsJobs();
    const allJobs = [...remoteOKJobs, ...wwrJobs, ...alertsJobs];
    if (allJobs.length === 0) {
        console.log('ℹ️ No new jobs found in current sweep.');
        return { totalFetched: 0, upserted: 0 };
    }
    let upsertedCount = 0;
    for (const job of allJobs) {
        if (!job.job_url)
            continue;
        const { error } = await supabase_1.supabase.from('jobs').upsert({
            title: job.title,
            company: job.company,
            location: job.location,
            is_remote: job.is_remote,
            tech_stack_tags: job.tech_stack_tags,
            source: job.source,
            job_url: job.job_url,
            description: job.description,
            posted_date: job.posted_date,
            status: 'open',
            updated_at: new Date().toISOString()
        }, { onConflict: 'job_url' });
        if (!error) {
            upsertedCount++;
        }
        else {
            console.error(`⚠️ Upsert error for ${job.job_url}:`, error.message);
        }
    }
    console.log(`✅ Sourcing Complete: Sourced ${allJobs.length} matching jobs, ${upsertedCount} upserted to database.`);
    return { totalFetched: allJobs.length, upserted: upsertedCount };
}
