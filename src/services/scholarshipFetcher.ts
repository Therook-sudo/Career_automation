import { supabase } from '../lib/supabase';
import { Programme, Scholarship } from '../types/database';

/**
 * Featured MSc Programmes focusing on Cloud Engineering, Information Security & CS
 */
const SEED_PROGRAMMES: Array<Omit<Programme, 'id' | 'created_at'>> = [
  {
    name: 'SECCLO - Erasmus Mundus Master in Security and Cloud Computing',
    university: 'Aalto University & KTH Royal Institute of Technology',
    country: 'Finland & Sweden',
    field: 'Information Security & Cloud Engineering',
    degree_level: 'MSc',
    tuition_fee: 'Waived for Erasmus Mundus Scholarship Winners',
    is_fully_funded: true,
    duration: '2 Years',
    main_link: 'https://secclo.aalto.fi/',
    notes: 'Includes €1,400/month stipend + full tuition waiver + travel allowance.'
  },
  {
    name: 'MSc Cloud Computing and Services',
    university: 'TU Delft & EIT Digital Master School',
    country: 'Netherlands & Europe',
    field: 'Cloud Infrastructure & Distributed Systems',
    degree_level: 'MSc',
    tuition_fee: '€18,000 / year (Scholarships available)',
    is_fully_funded: false,
    duration: '2 Years',
    main_link: 'https://masterschool.eitdigital.eu/cloud-and-network-infrastructures',
    notes: 'Offers merit-based tuition waivers and monthly stipends.'
  },
  {
    name: 'MSc Cybersecurity & Privacy',
    university: 'KTH Royal Institute of Technology',
    country: 'Sweden',
    field: 'Information Security & System Safety',
    degree_level: 'MSc',
    tuition_fee: '155,000 SEK / year (KTH Scholarship available)',
    is_fully_funded: false,
    duration: '2 Years',
    main_link: 'https://www.kth.se/en/studies/master/cybersecurity',
    notes: 'KTH Scholarship covers full tuition fee.'
  },
  {
    name: 'DAAD Scholarships for International Master Students',
    university: 'German Universities (TUM, RWTH Aachen, LMU)',
    country: 'Germany',
    field: 'Computer Science & Software Engineering',
    degree_level: 'MSc',
    tuition_fee: 'Waived (No tuition in Germany public universities)',
    is_fully_funded: true,
    duration: '2 Years',
    main_link: 'https://www.daad.de/en/study-and-research-in-germany/scholarships/',
    notes: 'Provides €934/month stipend + health insurance + travel grant.'
  }
];

/**
 * Seed & Sourcing Engine for Programmes and Scholarships
 */
export async function runScholarshipSourcingPipeline(): Promise<{ programmesCount: number; scholarshipsCount: number }> {
  console.log('🔄 Running School & Scholarship Sourcing Sweep...');

  let progInserted = 0;
  let scholInserted = 0;

  for (const prog of SEED_PROGRAMMES) {
    const { data: insertedProg, error } = await supabase.from('programmes').upsert(
      {
        name: prog.name,
        university: prog.university,
        country: prog.country,
        field: prog.field,
        degree_level: prog.degree_level,
        tuition_fee: prog.tuition_fee,
        is_fully_funded: prog.is_fully_funded,
        duration: prog.duration,
        main_link: prog.main_link,
        notes: prog.notes
      },
      { onConflict: 'main_link' }
    ).select().single();

    if (!error && insertedProg) {
      progInserted++;

      // Create linked scholarship record if fully funded
      if (prog.is_fully_funded) {
        const deadlineDate = new Date();
        deadlineDate.setMonth(deadlineDate.getMonth() + 4); // ~4 months buffer

        const { error: scholError } = await supabase.from('scholarships').upsert(
          {
            programme_id: insertedProg.id,
            name: `${prog.name} Scholarship`,
            provider: prog.university,
            country: prog.country,
            coverage: 'Full Tuition + Monthly Stipend (€900 - €1,400) + Travel',
            eligibility_summary: 'BSc in Computer Science / IT / DevOps background, High GPA, English Proficiency (IELTS 6.5+)',
            deadline: deadlineDate.toISOString(),
            application_link: prog.main_link,
            tags: ['Erasmus', 'Fully Funded', 'Cloud', 'Security']
          },
          { onConflict: 'application_link' }
        );

        if (!scholError) scholInserted++;
      }
    }
  }

  console.log(`✅ School Sourcing Complete: ${progInserted} programmes, ${scholInserted} scholarships stored.`);
  return { programmesCount: progInserted, scholarshipsCount: scholInserted };
}
