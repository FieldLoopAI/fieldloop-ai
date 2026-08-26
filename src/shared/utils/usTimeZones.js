// Standard US time zones, IANA identifier as the stored value (matches the
// old free-text placeholder's own "America/New_York (ET)" style) with a
// friendly label. Shared between Step6OperationsWorkforce.jsx's dropdown
// and RegistrationDashboard.jsx's validateStep backstop, so the two can't
// drift out of sync.
export const US_TIME_ZONES = [
  ['America/New_York', 'Eastern Time (ET)'],
  ['America/Chicago', 'Central Time (CT)'],
  ['America/Denver', 'Mountain Time (MT)'],
  ['America/Phoenix', 'Mountain Time — no DST (Arizona)'],
  ['America/Los_Angeles', 'Pacific Time (PT)'],
  ['America/Anchorage', 'Alaska Time (AKT)'],
  ['Pacific/Honolulu', 'Hawaii-Aleutian Time (HST)'],
];

export const US_TIME_ZONE_VALUES = new Set(US_TIME_ZONES.map(([tz]) => tz));
