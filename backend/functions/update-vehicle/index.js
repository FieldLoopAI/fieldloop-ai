// backend/functions/update-vehicle/index.js
// POST /vehicles/update — partial-update a vehicle. Also backs "Retire"
// (is_active: false) — a soft-delete, matching deactivate-technician's
// pattern rather than a hard DELETE, so fleet history isn't lost.
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

function validateYear(value) {
  if (value === undefined || value === null || value === '') return true;
  const year = parseInt(value, 10);
  return Number.isInteger(year) && year >= 1980 && year <= new Date().getFullYear() + 1;
}

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const body = JSON.parse(event.body || '{}');
    const { vehicle_id, unit_number, make, model, year, default_driver_id, is_active } = body;

    if (!vehicle_id) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'vehicle_id is required.' }) };
    }
    if (!validateYear(year)) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'year must be a reasonable model year.' }) };
    }

    const supabase = await getSupabaseClient();

    const { data: existing } = await supabase
      .from('vehicles').select('id')
      .eq('id', vehicle_id).eq('contractor_id', contractorUser.contractor_id).maybeSingle();
    if (!existing) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Vehicle not found for your company.' }) };
    }

    if (default_driver_id) {
      const { data: tech } = await supabase
        .from('technicians').select('id')
        .eq('id', default_driver_id).eq('contractor_id', contractorUser.contractor_id).maybeSingle();
      if (!tech) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Driver not found for your company.' }) };
      }
    }

    const update = {};
    if (unit_number !== undefined) update.unit_number = unit_number.trim();
    if (make !== undefined) update.make = make?.trim() || null;
    if (model !== undefined) update.model = model?.trim() || null;
    if (year !== undefined) update.year = year ? parseInt(year, 10) : null;
    if (default_driver_id !== undefined) update.default_driver_id = default_driver_id || null;
    if (is_active !== undefined) update.is_active = Boolean(is_active);
    if (Object.keys(update).length === 0) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Nothing to update.' }) };
    }

    const { data: vehicle, error } = await supabase
      .from('vehicles').update(update).eq('id', vehicle_id).select().single();
    if (error) throw new Error(error.message);

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, vehicle }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
