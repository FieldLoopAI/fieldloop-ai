const { getSupabaseClient } = require('./supabaseClient');

function sourceIpFromEvent(event) {
  return event.requestContext?.http?.sourceIp
    || event.requestContext?.identity?.sourceIp
    || null;
}

// Ports mockDb.checkRoleAccess's IP-allowlist check to a real server-side
// enforcement point: admin/finance callers must originate from an IP in
// their fl_users.ip_allowlist, but only while system_settings.ip_allowlist_enabled
// is true. Every other role is unaffected.
async function enforceIpAllowlist(event, flUser) {
  if (!['admin', 'finance'].includes(flUser.role)) return;

  const supabase = await getSupabaseClient();
  const { data: settings } = await supabase
    .from('system_settings')
    .select('ip_allowlist_enabled')
    .eq('id', 1)
    .single();
  if (!settings?.ip_allowlist_enabled) return;

  const { data: userRow, error } = await supabase
    .from('fl_users')
    .select('ip_allowlist')
    .eq('id', flUser.id)
    .single();
  if (error || !userRow) throw new Error('Unable to verify IP allowlist for this account.');

  const allowlist = userRow.ip_allowlist || [];
  if (allowlist.length === 0) return; // no allowlist configured for this user yet

  const sourceIp = sourceIpFromEvent(event);
  if (!sourceIp || !allowlist.includes(sourceIp)) {
    throw new Error(`Access Blocked: IP address '${sourceIp || 'unknown'}' is not in the allowlist for the ${flUser.role} role.`);
  }
}

module.exports = { enforceIpAllowlist };
