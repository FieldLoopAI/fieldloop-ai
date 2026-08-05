export const jobs = [
  { id: 'FL-2847', time: '08:00 AM', trade: 'MASTER BATH REMODEL', title: 'Anderson residence — Master bath full remodel (Day 3 of 5)', address: '1402 Palmetto Avenue, Sarasota, FL 34237', phone: '(941) 555-0812', techs: ['Taylor Ramirez (lead)', 'Miguel Santos'], vehicle: 'Van 02 · Ram ProMaster', warning: 'Change order pending', status: 'ON SITE', detail: 'Geofence ✓', onSiteSeconds: 8133 },
  { id: 'FL-2848', time: '11:30 AM', trade: 'KITCHEN TILE REPAIR', title: 'Chen residence — Kitchen tile crack repair (single visit)', address: '360 Bayshore Drive, Sarasota, FL 34234', phone: '(941) 555-0334', techs: ['Jake Anderson'], vehicle: 'Van 01 · Ford Transit', estimate: 'Est. $845 · Approved', status: 'EN ROUTE', detail: 'ETA: 11:26 AM · 1.4 mi out' },
  { id: 'FL-2849', time: '02:00 PM', trade: 'KITCHEN CABINET INSTALL', title: 'Delgado residence — Kitchen cabinet install (Day 1 of 2)', address: '88 Siesta Key Circle, Sarasota, FL 34242', phone: '(941) 555-0956', techs: ['Devon Washington (lead)', 'Chris Delgado', 'Ben Novak'], vehicle: 'Truck 03 · Ford F-350', status: 'SCHEDULED', detail: 'Depart: 1:15 PM · Est. drive: 22 min' },
];

export const technicians = [
  ['Tyler Brooks', 'Field Ops Lead / Superintendent', '(941) 555-0188', 'OSHA-30 · CAPS', 'Active — Office', 'green'], ['Miguel Santos', 'Master Tile Installer', '(941) 555-0221', 'CTI-Certified', 'On job FL-2847', 'green'], ['Devon Washington', 'Lead Painter / Finish Work', '(941) 555-0234', 'EPA RRP', 'Prep for FL-2849', 'green'], ['Jake Anderson', 'Flooring Specialist', '(941) 555-0245', 'NWFA-Certified', 'En route to FL-2848', 'green'], ['Taylor Ramirez', 'Kitchen / Bath Remodeler', '(941) 555-0256', 'NKBA · Lic. Plumb sub', 'On job FL-2847 (lead)', 'green'], ['Marcus Chen', 'General Carpenter', '(941) 555-0267', 'OSHA-10', 'PTO — returns Thu', 'amber'], ['Raul Ortiz', 'Apprentice — Tile', '(941) 555-0278', 'In training', 'Off duty', 'gray'], ['Ben Novak', 'Framing / Additions Lead', '(941) 555-0289', 'OSHA-30', 'Prep for FL-2849', 'green'], ['Chris Delgado', 'Finish Carpentry', '(941) 555-0290', 'Cabinet-Cert', 'Prep for FL-2849', 'green'],
].map(([name, specialty, phone, certifications, status, color]) => ({ name, specialty, phone, certifications, status, color }));

export const fleet = [
  { unit: 'Van 01', vehicle: '2022 Ford Transit 250', vin: '••••4821', driver: 'Jake Anderson', health: 'Healthy', color: 'green' },
  { unit: 'Van 02', vehicle: '2023 Ram ProMaster 2500', vin: '••••7734', driver: 'Taylor Ramirez', health: 'Oil change due 500 mi', color: 'amber' },
  { unit: 'Truck 03', vehicle: '2021 Ford F-350 Super Duty', vin: '••••9012', driver: 'Devon Washington', health: 'Check engine — P0128', color: 'red' },
];

export const customers = [
  ['Anderson, Sarah & Todd', '(941) 555-0812', 'sanderson88@gmail.com', '1402 Palmetto Ave', '2 (1 active)', '$14,320'], ['Chen, Linda', '(941) 555-0334', 'l.chen@bayshore.net', '360 Bayshore Dr', '1', '$845'], ['Delgado, Robert', '(941) 555-0956', 'rdelgado@siestakey.com', '88 Siesta Key Cir', '3 (1 active)', '$47,200'], ['Rodriguez, Elena', '(941) 555-1147', 'elena.r@gmail.com', '2418 Lido Beach Rd', '0 (est. pending)', '—'], ['Whitfield, Karen', '(941) 555-1288', 'kwhitfield@gulfview.net', '7710 Gulf of Mexico Dr', '0 (est. pending)', '—'],
].map(([name, phone, email, address, jobs, value]) => ({ name, phone, email, address, jobs, value }));
