import axios from 'axios';
import { supabase } from '../lib/supabase';

/**
 * Checks open job URLs to automatically mark expired or 404 postings as closed.
 */
export async function checkJobsLiveness(): Promise<{ checked: number; closed: number }> {
  console.log('🔍 Running Job Liveness & Dead Posting Health Check...');

  const { data: openJobs, error } = await supabase
    .from('jobs')
    .select('id, title, company, job_url')
    .eq('status', 'open')
    .limit(20);

  if (error || !openJobs || openJobs.length === 0) {
    return { checked: 0, closed: 0 };
  }

  let closedCount = 0;

  for (const job of openJobs) {
    if (!job.job_url) continue;

    try {
      const response = await axios.get(job.job_url, {
        timeout: 6000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        validateStatus: (status) => status < 500
      });

      const bodyText = typeof response.data === 'string' ? response.data.toLowerCase() : '';
      const isClosed =
        response.status === 404 ||
        response.status === 410 ||
        bodyText.includes('job is no longer available') ||
        bodyText.includes('position has been filled') ||
        bodyText.includes('this job has expired');

      if (isClosed) {
        await supabase.from('jobs').update({ status: 'closed' }).eq('id', job.id);
        closedCount++;
        console.log(`🛑 Marked dead job as closed: ${job.title} @ ${job.company}`);
      }
    } catch (err: any) {
      // If domain or link connection fails repeatedly
      if (err.response?.status === 404) {
        await supabase.from('jobs').update({ status: 'closed' }).eq('id', job.id);
        closedCount++;
      }
    }
  }

  console.log(`✅ Liveness Sweep Finished: ${openJobs.length} checked, ${closedCount} closed.`);
  return { checked: openJobs.length, closed: closedCount };
}
