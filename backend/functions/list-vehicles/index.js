// backend/functions/list-vehicles/index.js
// POST /vehicles/list — real data for Panel 4 "Fleet & vehicles". No Lambda
// has ever written to this table (verified live — 0 rows across the whole
// platform at the time of this build), so this will honestly show an empty
// state until a contractor adds their first vehicle.
const { requireContractorRole } = require('./shared/contractorAuth');
const { getSupabaseClient } = require('./shared/supabaseClient');

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  try {
    const contractorUser = await requireContractorRole(event, ['owner_admin']);
    const supabase = await getSupabaseClient();

    const { data: vehicles, error } = await supabase
      .from('vehicles')
      .select('id, unit_number, make, model, year, default_driver_id, obd2_dongle_id, current_dtc_codes, oil_life_pct, next_service_mileage, is_active, created_at')
      .eq('contractor_id', contractorUser.contractor_id)
      .order('unit_number');
    if (error) throw new Error(error.message);

    const driverIds = [...new Set(vehicles.map((v) => v.default_driver_id).filter(Boolean))];
    let driverNameById = {};
    if (driverIds.length) {
      const { data: techs } = await supabase.from('technicians').select('id, full_name').in('id', driverIds);
      driverNameById = Object.fromEntries((techs || []).map((t) => [t.id, t.full_name]));
    }

    const enriched = vehicles.map((v) => ({ ...v, driver_name: driverNameById[v.default_driver_id] || null }));

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ vehicles: enriched }) };
  } catch (err) {
    return {
      statusCode: err.message.includes('not permitted') ? 403 : 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
