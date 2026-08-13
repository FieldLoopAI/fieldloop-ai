// backend/functions/shared/geocoding.js
//
// Google Maps Geocoding API — resolves a free-text service address into
// { lat, lng } for geofencing (mobile-app-plan Beat 4). Best-effort: a
// geocoding failure (bad address, quota, missing secret) must never block
// job creation — the caller stores null lat/lng and the job still saves,
// same graceful-degradation shape as Twilio/SES in messagingAdapter.js.
const { getSecret } = require('./secrets');

async function geocodeAddress(address) {
  if (!address?.trim()) return null;

  let apiKey;
  try {
    apiKey = JSON.parse(await getSecret('fieldloop/geocoding-api-key')).api;
  } catch {
    return null; // secret not configured — degrade gracefully, not an error
  }
  if (!apiKey) return null;

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address.trim())}&key=${apiKey}`;

  let res;
  try {
    res = await fetch(url);
  } catch {
    return null; // network failure — degrade gracefully
  }
  if (!res.ok) return null;

  const body = await res.json().catch(() => null);
  if (body?.status !== 'OK' || !body.results?.length) return null;

  const { lat, lng } = body.results[0].geometry.location;
  return { lat, lng };
}

module.exports = { geocodeAddress };
