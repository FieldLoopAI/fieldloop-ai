// Fallback roster shown only until the real `list-technicians` response
// arrives (see `displayTechs` in ContractorCommandDashboard.jsx) — every
// other export this file used to have (`jobs`, `fleet`, `customers`) is
// gone now that Job Dispatch (§12), Fleet, and Customers (§27) are wired to
// real Lambdas; keeping dead mock data around after its last real reference
// is removed just invites drift.
export const technicians = [
  ['Tyler Brooks', 'Field Ops Lead / Superintendent', '(941) 555-0188', 'OSHA-30 · CAPS', 'Active — Office', 'green'], ['Miguel Santos', 'Master Tile Installer', '(941) 555-0221', 'CTI-Certified', 'On job FL-2847', 'green'], ['Devon Washington', 'Lead Painter / Finish Work', '(941) 555-0234', 'EPA RRP', 'Prep for FL-2849', 'green'], ['Jake Anderson', 'Flooring Specialist', '(941) 555-0245', 'NWFA-Certified', 'En route to FL-2848', 'green'], ['Taylor Ramirez', 'Kitchen / Bath Remodeler', '(941) 555-0256', 'NKBA · Lic. Plumb sub', 'On job FL-2847 (lead)', 'green'], ['Marcus Chen', 'General Carpenter', '(941) 555-0267', 'OSHA-10', 'PTO — returns Thu', 'amber'], ['Raul Ortiz', 'Apprentice — Tile', '(941) 555-0278', 'In training', 'Off duty', 'gray'], ['Ben Novak', 'Framing / Additions Lead', '(941) 555-0289', 'OSHA-30', 'Prep for FL-2849', 'green'], ['Chris Delgado', 'Finish Carpentry', '(941) 555-0290', 'Cabinet-Cert', 'Prep for FL-2849', 'green'],
].map(([name, specialty, phone, certifications, status, color]) => ({ name, specialty, phone, certifications, status, color }));
