const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const { getSecret } = require('./secrets');

let cachedClient = null;

async function getSupabaseClient() {
  if (cachedClient) return cachedClient;
  const credsRaw = await getSecret('fieldloop/supabase-service-credentials');
  const creds = JSON.parse(credsRaw);
  // None of these functions use Supabase Realtime, but createClient() still
  // initializes a Realtime client by default, which throws on Lambda's
  // nodejs20.x runtime (no native WebSocket until Node 22) unless a
  // WebSocket implementation is explicitly provided here.
  cachedClient = createClient(creds.SUPABASE_URL, creds.SUPABASE_SERVICE_KEY, {
    realtime: { transport: WebSocket },
  });
  return cachedClient;
}

module.exports = { getSupabaseClient }
