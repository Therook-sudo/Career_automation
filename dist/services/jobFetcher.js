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
        const feedUrl = 'https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss';
        let feed;
        try {
            const res = await axios_1.default.get(feedUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
                },
                timeout: 10000
            });
            feed = await rssParser.parseString(res.data);
        }
        catch {
            feed = await rssParser.parseURL(feedUrl);
        }
        const results = [];
        for (const item of feed.items) {
            const rawTitle = (item.title || '').trim();
            const description = (item.content || item.summary || '').trim();
            let company = 'Unknown';
            let cleanTitle = rawTitle;
            if (rawTitle.includes(':')) {
                const parts = rawTitle.split(':');
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
    // 2. Read from config/google_alerts.txt across multiple possible execution paths
    const candidatePaths = [
        path_1.default.join(process.cwd(), 'config', 'google_alerts.txt'),
        path_1.default.join(__dirname, '..', '..', 'config', 'google_alerts.txt'),
        path_1.default.join(__dirname, '..', 'config', 'google_alerts.txt'),
        path_1.default.resolve('config/google_alerts.txt')
    ];
    for (const cPath of candidatePaths) {
        if (fs_1.default.existsSync(cPath)) {
            try {
                const fileContent = fs_1.default.readFileSync(cPath, 'utf8');
                const fileUrls = fileContent
                    .split(/\r?\n/)
                    .map((u) => u.trim())
                    .filter((u) => u && !u.startsWith('#') && u.startsWith('http'));
                urls.push(...fileUrls);
                if (urls.length > 0)
                    break;
            }
            catch (err) {
                console.warn(`⚠️ Could not read ${cPath}:`, err.message);
            }
        }
    }
    // Deduplicate URLs
    const uniqueUrls = Array.from(new Set(urls));
    if (uniqueUrls.length === 0) {
        console.log('ℹ️ No Google Alerts RSS URLs configured.');
        return [];
    }
    console.log(`📡 Fetching from ${uniqueUrls.length} Google Alerts RSS feed(s)...`);
    const allResults = [];
    await Promise.allSettled(uniqueUrls.map(async (feedUrl) => {
        try {
            let feed;
            try {
                const res = await axios_1.default.get(feedUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                        'Accept': 'application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
                    },
                    timeout: 10000
                });
                feed = await rssParser.parseString(res.data);
            }
            catch {
                feed = await rssParser.parseURL(feedUrl);
            }
            for (const item of feed.items) {
                const rawTitle = (item.title || '').replace(/<[^>]*>?/gm, '').trim();
                const description = (item.content || item.summary || '').replace(/<[^>]*>?/gm, '').trim();
                // Extract clean destination URL if Google Alerts tracking redirect
                let jobUrl = item.link || item.guid || '';
                if (jobUrl.includes('google.com/url?') && jobUrl.includes('url=')) {
                    try {
                        const parsedUrl = new URL(jobUrl);
                        const target = parsedUrl.searchParams.get('url');
                        if (target)
                            jobUrl = target;
                    }
                    catch { }
                }
                // Extract company from title if "Job Title - Company" or "Job Title | Company"
                let company = 'Google Alerts Lead';
                let title = rawTitle;
                if (rawTitle.includes(' - ')) {
                    const parts = rawTitle.split(' - ');
                    title = parts[0].trim();
                    company = parts.slice(1).join(' - ').trim();
                }
                else if (rawTitle.includes(' | ')) {
                    const parts = rawTitle.split(' | ');
                    title = parts[0].trim();
                    company = parts.slice(1).join(' | ').trim();
                }
                if (isRelevantJob(rawTitle, description)) {
                    allResults.push({
                        title: title || 'DevOps Opportunity',
                        company,
                        location: 'Remote / Unspecified',
                        is_remote: true,
                        tech_stack_tags: extractTechTags(rawTitle, description),
                        source: 'Google Alerts',
                        job_url: jobUrl,
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
