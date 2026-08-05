// backend/functions/export-contractor-pdf/index.js
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { requireRole } = require('./shared/auth');
const { getSupabaseClient } = require('./shared/supabaseClient');
const { enforceIpAllowlist } = require('./shared/ipAllowlist');

// Sensitive fields (SSN, DOB, bank/routing, Stripe keys) are deliberately
// left out of the exported PDF — only their *_ref pointer's presence is
// shown ("On file" / "Not on file"), never the decrypted secret. Printing
// a physical/PDF copy of live secrets is a much bigger exposure surface
// than viewing them on screen, so the export stays at "reference exists"
// resolution the same way the original mock's print flow never surfaced
// raw values either.
async function fetchFullRecord(supabase, contractorId) {
  const [{ data: contractor }, { data: principal }, { data: contacts }, { data: compliance }, { data: operations }, { data: financials }, { data: meta }] = await Promise.all([
    supabase.from('contractors').select('*').eq('id', contractorId).single(),
    supabase.from('contractor_principals').select('*').eq('contractor_id', contractorId).maybeSingle(),
    supabase.from('contractor_contacts').select('*').eq('contractor_id', contractorId),
    supabase.from('contractor_compliance').select('*').eq('contractor_id', contractorId).maybeSingle(),
    supabase.from('contractor_operations').select('*').eq('contractor_id', contractorId).maybeSingle(),
    supabase.from('contractor_financials').select('*').eq('contractor_id', contractorId).maybeSingle(),
    supabase.from('contractor_system_meta').select('*').eq('contractor_id', contractorId).maybeSingle(),
  ]);
  return { contractor, principal, contacts: contacts || [], compliance, operations, financials, meta };
}

exports.handler = async (event) => {
  try {
    const flUser = await requireRole(event, ['admin']);
    await enforceIpAllowlist(event, flUser);
    const { contractorId } = JSON.parse(event.body);
    const supabase = await getSupabaseClient();

    const { contractor, principal, contacts, compliance, operations, financials, meta } = await fetchFullRecord(supabase, contractorId);
    if (!contractor) throw new Error('Contractor record not found.');

    const ip = event.requestContext?.http?.sourceIp || event.requestContext?.identity?.sourceIp || 'unknown';
    const timestamp = new Date().toLocaleString();

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([612, 792]);
    let y = 750;
    const left = 50;

    const line = (text, { size = 10, useFont = font, color = rgb(0.1, 0.1, 0.1), gap = 16 } = {}) => {
      if (y < 60) { page = pdf.addPage([612, 792]); y = 750; }
      page.drawText(text, { x: left, y, size, font: useFont, color });
      y -= gap;
    };

    line('FieldLoop — Contractor Registration Record', { size: 16, useFont: bold, gap: 24 });
    line(`${contractor.legal_name} (${contractor.contractor_id_public || contractorId})`, { size: 12, useFont: bold, gap: 20 });

    line('BUSINESS IDENTITY', { size: 11, useFont: bold, gap: 18 });
    line(`DBA: ${contractor.dba_name || '—'}`);
    line(`Structure: ${contractor.business_structure || '—'}   EIN: ${contractor.ein_ref ? 'On file (encrypted)' : 'Not on file'}`);
    line(`Phone: ${contractor.business_phone || '—'}   Email: ${contractor.business_email || '—'}`);
    line(`Address: ${contractor.physical_street || '—'}, ${contractor.physical_city || ''}, ${contractor.physical_state || ''} ${contractor.physical_zip || ''}`, { gap: 20 });

    line('OWNERSHIP & PRINCIPAL', { size: 11, useFont: bold, gap: 18 });
    line(`${principal?.full_name || '—'} — ${principal?.title || '—'} (${principal?.ownership_pct ?? '—'}% ownership)`);
    line(`DOB: ${principal?.dob_ref ? 'On file (encrypted)' : 'Not on file'}   SSN: ${principal?.ssn_last4_ref ? 'On file (encrypted)' : 'Not on file'}`, { gap: 20 });

    line('KEY CONTACTS', { size: 11, useFont: bold, gap: 18 });
    if (contacts.length === 0) line('No contacts on file.');
    contacts.forEach((c) => line(`${c.full_name} — ${c.contact_type} — ${c.direct_phone || '—'} / ${c.email || '—'}`));
    y -= 4;

    line('COMPLIANCE & LICENSING', { size: 11, useFont: bold, gap: 18 });
    line(`License: ${compliance?.primary_license_number || '—'} (${compliance?.license_state || '—'}), expires ${compliance?.license_expiration_date || '—'}`);
    line(`GL Insurance: ${compliance?.gl_insurance_provider || '—'} #${compliance?.gl_policy_number || '—'}, expires ${compliance?.gl_expiration || '—'}`);
    line(`Bonded: ${compliance?.is_bonded ? 'Yes' : 'No'}   W-9 on file: ${compliance?.w9_on_file ? 'Yes' : 'No'}`, { gap: 20 });

    line('OPERATIONS & WORKFORCE', { size: 11, useFont: bold, gap: 18 });
    line(`Primary trade: ${operations?.primary_trade || '—'}   Technicians: ${operations?.technician_count ?? '—'}   Vehicles: ${operations?.vehicle_count ?? '—'}`, { gap: 20 });

    line('FINANCIALS', { size: 11, useFont: bold, gap: 18 });
    line(`Payout bank: ${financials?.payout_bank_name || '—'}   Routing/Account: ${financials?.routing_number_ref ? 'On file (encrypted)' : 'Not on file'}`);
    line(`Stripe Connect: ${financials?.stripe_account_id_ref ? 'On file (encrypted)' : 'Not on file'}   ACH authorized: ${financials?.ach_authorization_signed ? 'Yes' : 'No'}`, { gap: 20 });

    line('SYSTEM STATUS', { size: 11, useFont: bold, gap: 18 });
    line(`Status: ${meta?.status || '—'}   Risk score: ${meta?.risk_score ?? '—'}`, { gap: 24 });

    line(`Exported by ${flUser.email || flUser.id} · ${timestamp} · IP ${ip}`, { size: 8, color: rgb(0.5, 0.5, 0.5) });

    const pdfBytes = await pdf.save();
    const pdfBase64 = Buffer.from(pdfBytes).toString('base64');

    await supabase.from('access_audit_log').insert({
      user_id: flUser.id,
      contractor_id: contractorId,
      action: 'export',
      field_accessed: 'contractor_full_pdf_export',
      ip_address: ip === 'unknown' ? null : ip,
      user_agent: event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
    });

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        pdfBase64,
        watermark: { user: flUser.email || flUser.id, timestamp, ip },
      }),
    };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
