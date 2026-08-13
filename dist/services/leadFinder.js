"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findOrProposeContact = findOrProposeContact;
const supabase_1 = require("../lib/supabase");
/**
 * Searches for or proposes a hiring contact / recruiter for a target job application.
 */
async function findOrProposeContact(company, roleFocus = 'DevOps') {
    // Check if contact for company already exists
    const { data: existing } = await supabase_1.supabase.from('contacts').select('*').eq('company', company).limit(1).single();
    if (existing) {
        return existing;
    }
    // Create a proposed contact entry
    const proposedName = `${company} Talent Acquisition / Hiring Team`;
    const proposedEmail = `recruiting@${company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
    const { data, error } = await supabase_1.supabase.from('contacts').insert({
        name: proposedName,
        role_title: `Technical Recruiter / ${roleFocus} Lead`,
        company: company,
        email: proposedEmail,
        confidence_score: 0.85,
        source: 'Automated Lead Finder'
    }).select().single();
    if (error || !data) {
        throw new Error(`Failed to create contact for company ${company}`);
    }
    return data;
}
