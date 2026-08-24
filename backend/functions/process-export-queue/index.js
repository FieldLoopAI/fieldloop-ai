// backend/functions/process-export-queue/index.js
//
// The real file-generation half of Data Archive & Export (Panel 9) —
// create-export-request only ever writes a 'queued' row; this Lambda is
// invoked on a schedule (EventBridge, every 2 minutes — see HANDOFF.md for
// why a poll-and-process Lambda was chosen over SQS/Step Functions: real
// scale here is a handful of requests, not a queue needing backpressure)
// and is the only thing that ever moves a row past 'queued'. No caller/JWT —
// this runs as an internal system job using the service-role key directly.
//
// Two export_type values can't be fulfilled today and are marked 'failed'
// rather than left stuck at 'queued' forever (which would look like "still
// working" indefinitely, the more misleading state):
//   - 'media_only': field_events.s3_object_key photos are written by the
//     mobile app to a bucket this repo has never had access to or even
//     confirmed the identity of (see NEW_MOBILE_TEAM_HANDOFF.md).
//   - 'single_job': create-export-request's request contract has no way to
//     specify *which* job — no job_id field is accepted or stored anywhere
//     on data_export_requests. A real gap surfaced building this, not
//     something silently worked around; flagging it here for whoever
//     revisits this export type.
const { getSupabaseClient } = require('./shared/supabaseClient');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { stringify } = require('csv-stringify/sync');
const archiver = require('archiver');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const BUCKET = 'fieldloop-data-exports';
const EXPIRY_SECONDS = 72 * 60 * 60;
const MAX_PER_RUN = 5; // bounds one invocation's execution time; remainder picked up next poll

const s3 = new S3Client({});

// download_url_ref stores the S3 *key*, not a signed URL — Lambda's
// execution role only ever has 1-hour temporary credentials (its
// MaxSessionDuration, verified live), so a URL presigned here could never
// actually stay valid for the intended 72-hour window no matter what
// expiresIn is passed to getSignedUrl; S3 rejects it once the signing
// session itself expires, well before 72 hours. Same *_ref-pointer pattern
// this project already uses for encrypted secrets (reveal-field) — the real,
// short-lived signed URL is minted on demand by get-export-download-url,
// which is well within the 1-hour session cap.

// ---------------------------------------------------------------------------
// Data fetchers — same join patterns list-jobs/list-invoices/list-estimates
// already use (invoices/estimates_and_change_orders have no contractor_id of
// their own; tenant scope flows through jobs).
// ---------------------------------------------------------------------------
async function fetchJobs(supabase, contractorId, dateStart, dateEnd) {
  let query = supabase
    .from('jobs')
    .select('job_id_public, job_type, trade_category, description, service_address, scheduled_start, scheduled_end, status, total_estimate, total_invoiced, total_paid, created_at, customers ( household_name, primary_phone ), technicians ( full_name )')
    .eq('contractor_id', contractorId)
    .order('created_at', { ascending: false });
  if (dateStart) query = query.gte('created_at', dateStart);
  if (dateEnd) query = query.lte('created_at', dateEnd);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchInvoices(supabase, contractorId) {
  const { data: jobs, error: jobsError } = await supabase
    .from('jobs').select('id, job_id_public, description, customers ( household_name, primary_phone )').eq('contractor_id', contractorId);
  if (jobsError) throw new Error(jobsError.message);
  const jobsById = Object.fromEntries((jobs || []).map((j) => [j.id, j]));
  const jobIds = Object.keys(jobsById);
  if (jobIds.length === 0) return [];
  const { data: invoices, error: invError } = await supabase
    .from('invoices').select('*').in('job_id', jobIds).order('created_at', { ascending: false });
  if (invError) throw new Error(invError.message);
  return (invoices || []).map((inv) => ({
    ...inv, job: jobsById[inv.job_id] || null,
    status: inv.paid_ts ? 'paid' : inv.invoice_number ? 'invoiced' : 'draft',
  }));
}

async function fetchEstimates(supabase, contractorId) {
  const { data: jobs, error: jobsError } = await supabase
    .from('jobs').select('id, job_id_public, description, customers ( household_name, primary_phone )').eq('contractor_id', contractorId);
  if (jobsError) throw new Error(jobsError.message);
  const jobsById = Object.fromEntries((jobs || []).map((j) => [j.id, j]));
  const jobIds = Object.keys(jobsById);
  if (jobIds.length === 0) return [];
  const { data: estimates, error: estError } = await supabase
    .from('estimates_and_change_orders').select('*').in('job_id', jobIds).order('created_at', { ascending: false });
  if (estError) throw new Error(estError.message);
  return (estimates || []).map((e) => ({ ...e, job: jobsById[e.job_id] || null }));
}

// job_count is not a real column on customers (verified live) — same
// derived-from-jobs computation list-customers/index.js already uses.
async function fetchCustomers(supabase, contractorId) {
  const { data, error } = await supabase
    .from('customers').select('id, household_name, primary_contact_name, primary_phone, email, service_address, lifetime_value')
    .eq('contractor_id', contractorId).order('household_name');
  if (error) throw new Error(error.message);

  const { data: jobs, error: jErr } = await supabase
    .from('jobs').select('customer_id').eq('contractor_id', contractorId);
  if (jErr) throw new Error(jErr.message);
  const jobCountByCustomer = {};
  (jobs || []).forEach((j) => { jobCountByCustomer[j.customer_id] = (jobCountByCustomer[j.customer_id] || 0) + 1; });

  return (data || []).map((c) => ({ ...c, job_count: jobCountByCustomer[c.id] || 0 }));
}

// ---------------------------------------------------------------------------
// File builders
// ---------------------------------------------------------------------------
function jobsToRows(jobs) {
  return jobs.map((j) => ({
    job_id: j.job_id_public, type: j.job_type, trade: j.trade_category, description: j.description,
    address: j.service_address, customer: j.customers?.household_name || '', customer_phone: j.customers?.primary_phone || '',
    technician: j.technicians?.full_name || '', status: j.status,
    scheduled_start: j.scheduled_start || '', scheduled_end: j.scheduled_end || '',
    estimate: j.total_estimate ?? '', invoiced: j.total_invoiced ?? '', paid: j.total_paid ?? '', created_at: j.created_at,
  }));
}
function invoicesToRows(invoices) {
  return invoices.map((i) => ({
    job_id: i.job?.job_id_public || '', customer: i.job?.customers?.household_name || '',
    invoice_number: i.invoice_number || '', status: i.status, total: i.total ?? '', platform_fee: i.platform_fee ?? '',
    payment_method: i.payment_method || '', paid_ts: i.paid_ts || '', created_at: i.created_at,
  }));
}
function estimatesToRows(estimates) {
  return estimates.map((e) => ({
    job_id: e.job?.job_id_public || '', customer: e.job?.customers?.household_name || '',
    doc_type: e.doc_type, status: e.status, tier_good: e.tier_good ?? '', tier_better: e.tier_better ?? '', tier_best: e.tier_best ?? '',
    owner_approved_ts: e.owner_approved_ts || '', created_at: e.created_at,
  }));
}
function customersToRows(customers) {
  return customers.map((c) => ({
    household_name: c.household_name, contact: c.primary_contact_name || '', phone: c.primary_phone || '',
    email: c.email || '', address: c.service_address || '', lifetime_value: c.lifetime_value ?? '', job_count: c.job_count ?? '',
  }));
}

function rowsToCsv(rows) {
  if (rows.length === 0) return 'No records.\n';
  return stringify(rows, { header: true });
}

async function buildZip(files) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks = [];
    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    for (const f of files) archive.append(f.content, { name: f.name });
    archive.finalize();
  });
}

async function buildPdf(title, sections) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]);
  let y = 750;
  const left = 50;
  const line = (text, { size = 9, useFont = font, color = rgb(0.1, 0.1, 0.1), gap = 14 } = {}) => {
    if (y < 60) { page = pdf.addPage([612, 792]); y = 750; }
    page.drawText(String(text).slice(0, 100), { x: left, y, size, font: useFont, color });
    y -= gap;
  };
  line(title, { size: 16, useFont: bold, gap: 24 });
  line(`Generated ${new Date().toLocaleString()}`, { size: 8, color: rgb(0.5, 0.5, 0.5), gap: 20 });
  for (const section of sections) {
    line(section.title, { size: 11, useFont: bold, gap: 16 });
    if (section.rows.length === 0) { line('No records.'); y -= 6; continue; }
    for (const row of section.rows.slice(0, 200)) { // bounded so one export can't produce an unusable thousand-page PDF
      line(Object.values(row).map((v) => (v === null || v === undefined || v === '' ? '—' : v)).join('  ·  '));
    }
    if (section.rows.length > 200) line(`… and ${section.rows.length - 200} more (see CSV/ZIP export for the full set).`, { size: 8, color: rgb(0.5, 0.5, 0.5) });
    y -= 6;
  }
  return Buffer.from(await pdf.save());
}

// ---------------------------------------------------------------------------
// Per-request generation
// ---------------------------------------------------------------------------
async function generate(supabase, req) {
  const { contractor_id, export_type, output_format, date_range_start, date_range_end } = req;

  const sections = [];
  if (export_type === 'jobs' || export_type === 'full') {
    sections.push({ key: 'jobs', title: 'JOBS', rows: jobsToRows(await fetchJobs(supabase, contractor_id, date_range_start, date_range_end)) });
  }
  if (export_type === 'invoices' || export_type === 'full') {
    sections.push({ key: 'invoices', title: 'INVOICES', rows: invoicesToRows(await fetchInvoices(supabase, contractor_id)) });
  }
  if (export_type === 'full') {
    sections.push({ key: 'estimates', title: 'ESTIMATES & CHANGE ORDERS', rows: estimatesToRows(await fetchEstimates(supabase, contractor_id)) });
    sections.push({ key: 'customers', title: 'CUSTOMERS', rows: customersToRows(await fetchCustomers(supabase, contractor_id)) });
  }

  const title = `FieldLoop Export — ${export_type} — ${new Date().toISOString().slice(0, 10)}`;

  if (output_format === 'csv') {
    // A single request only ever has one CSV-able section unless it's
    // 'full' — for 'full'+csv, concatenate sections with a header line each
    // rather than forcing a zip the user didn't ask for.
    const body = sections.map((s) => `${s.title}\n${rowsToCsv(s.rows)}`).join('\n');
    return { buffer: Buffer.from(body, 'utf-8'), ext: 'csv', contentType: 'text/csv' };
  }
  if (output_format === 'pdf') {
    return { buffer: await buildPdf(title, sections), ext: 'pdf', contentType: 'application/pdf' };
  }
  // zip — one CSV file per section
  const files = sections.map((s) => ({ name: `${s.key}.csv`, content: rowsToCsv(s.rows) }));
  return { buffer: await buildZip(files), ext: 'zip', contentType: 'application/zip' };
}

exports.handler = async () => {
  const supabase = await getSupabaseClient();

  const { data: queued, error } = await supabase
    .from('data_export_requests')
    .select('id, contractor_id, export_type, output_format, date_range_start, date_range_end')
    .eq('status', 'queued')
    .order('requested_at', { ascending: true })
    .limit(MAX_PER_RUN);
  if (error) throw new Error(error.message);
  if (!queued || queued.length === 0) return { processed: 0 };

  let processed = 0;
  for (const req of queued) {
    if (req.export_type === 'media_only' || req.export_type === 'single_job') {
      await supabase.from('data_export_requests').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', req.id);
      processed++;
      continue;
    }

    await supabase.from('data_export_requests').update({ status: 'processing' }).eq('id', req.id);
    try {
      const { buffer, ext, contentType } = await generate(supabase, req);
      const key = `exports/${req.contractor_id}/${req.id}.${ext}`;

      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType }));

      await supabase.from('data_export_requests').update({
        status: 'ready',
        download_url_ref: key,
        file_size_bytes: buffer.length,
        expires_at: new Date(Date.now() + EXPIRY_SECONDS * 1000).toISOString(),
        completed_at: new Date().toISOString(),
      }).eq('id', req.id);
    } catch (err) {
      console.error(`Export request ${req.id} failed:`, err.message);
      await supabase.from('data_export_requests').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', req.id);
    }
    processed++;
  }

  return { processed };
};
