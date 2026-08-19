// backend/functions/add-vehicle/index.js
// POST /vehicles — creates a vehicle. Only contractor_id is NOT NULL on this
// table (verified live via probe-insert) — unit_number is the only field
// this Lambda actually requires, since a vehicle with no unit label isn't
// useful in the UI even though the database would accept it.
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
    const { unit_number, make, model, year, default_driver_id } = body;

    if (!unit_number || !unit_number.trim()) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'unit_number is required.' }) };
    }
    if (!validateYear(year)) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'year must be a reasonable model year.' }) };
    }

    const supabase = await getSupabaseClient();

    if (default_driver_id) {
      const { data: tech } = await supabase
        .from('technicians').select('id')
        .eq('id', default_driver_id).eq('contractor_id', contractorUser.contractor_id).maybeSingle();
      if (!tech) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Driver not found for your company.' }) };
      }
    }

    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .insert({
        contractor_id: contractorUser.contractor_id,
        unit_number: unit_number.trim(),
        make: make?.trim() || null,
        model: model?.trim() || null,
        year: year ? parseInt(year, 10) : null,
        default_driver_id: default_driver_id || null,
      })
      .select()
      .single();
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
