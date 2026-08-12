import axios from 'axios';
import Parser from 'rss-parser';
import { supabase } from '../lib/supabase';
import { Job } from '../types/database';

const rssParser = new Parser();

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
  'kubernetes'
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
function isRelevantJob(title: string, description: string = ''): boolean {
  const combinedText = `${title} ${description}`.toLowerCase();
  return TITLE_KEYWORDS.some((keyword) => combinedText.includes(keyword));
}

/**
 * Extracts tech stack tags present in the job title/description.
 */
function extractTechTags(title: string, description: string = ''): string[] {
  const combinedText = `${title} ${description}`.toLowerCase();
  return TECH_STACK_TAGS.filter((tag) => combinedText.includes(tag.toLowerCase()));
}

/**
 * Sourcing Source 1: RemoteOK API
 */
async function fetchRemoteOKJobs(): Promise<Partial<Job>[]> {
  try {
    const response = await axios.get('https://remoteok.com/api', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    if (!Array.isArray(response.data)) return [];

    const jobsData = response.data.slice(1); // First element is disclaimer
    const results: Partial<Job>[] = [];

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
  } catch (error: any) {
    console.error('⚠️ RemoteOK fetch error:', error.message);
    return [];
  }
}

/**
 * Sourcing Source 2: WeWorkRemotely RSS
 */
async function fetchWeWorkRemotelyJobs(): Promise<Partial<Job>[]> {
  try {
    const feed = await rssParser.parseURL('https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss');
    const results: Partial<Job>[] = [];

    for (const item of feed.items) {
      const title = item.title || '';
      const description = item.content || item.summary || '';
      
      // Parse Company Name from title if formatted like "Company: Role"
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
  } catch (error: any) {
    console.error('⚠️ WeWorkRemotely fetch error:', error.message);
    return [];
  }
}

/**
 * Main Job Sourcing Orchestrator
 */
export async function runJobSourcingPipeline(): Promise<{ totalFetched: number; upserted: number }> {
  console.log('🔄 Sourcing jobs from remote feeds...');

  const remoteOKJobs = await fetchRemoteOKJobs();
  const wwrJobs = await fetchWeWorkRemotelyJobs();

  const allJobs = [...remoteOKJobs, ...wwrJobs];
  if (allJobs.length === 0) {
    console.log('ℹ️ No new jobs found in current sweep.');
    return { totalFetched: 0, upserted: 0 };
  }

  let upsertedCount = 0;

  for (const job of allJobs) {
    if (!job.job_url) continue;

    const { error } = await supabase.from('jobs').upsert(
      {
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
      },
      { onConflict: 'job_url' }
    );

    if (!error) {
      upsertedCount++;
    } else {
      console.error(`⚠️ Upsert error for ${job.job_url}:`, error.message);
    }
  }

  console.log(`✅ Sourcing Complete: Sourced ${allJobs.length} matching jobs, ${upsertedCount} upserted to database.`);
  return { totalFetched: allJobs.length, upserted: upsertedCount };
}
