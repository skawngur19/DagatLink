/* ==========================================================================
   store.js — prototype data layer
   The browser's local storage stands in for two things in this prototype:
   (a) the backend API + database, and (b) the phone's offline store.
   The device keeps its own store and an outbox; sync drains the outbox.
   ========================================================================== */

export const DB_KEY = 'bvsms.db.v4';
export const DEVICE_KEY = 'bvsms.device.v4';
export const CLOCK_KEY = 'bvsms.clock.v4';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

export const AREAS = [
  'Near-shore (Barotac Viejo)',
  'Banate Bay',
  'Visayan Sea edge',
];

export const SPECIES = [
  'Bangus', 'Tamban', 'Galunggong', 'Alumahan', 'Sapsap',
  'Tilapia', 'Nukos (squid)', 'Alimango (crab)', 'Pasayan (shrimp)',
];

export const GEAR = ['Gill net', 'Cast net', 'Hook and line', 'Fish trap', 'Ring net'];

export const AREA_CENTERS = {
  'Near-shore (Barotac Viejo)': { lat: 11.045, lng: 122.892 },
  'Banate Bay': { lat: 11.018, lng: 122.932 },
  'Visayan Sea edge': { lat: 11.076, lng: 122.956 },
};

export const ROLES = {
  mdrrmo: { label: 'MDRRMO — operations', positions: true, alerts: true, advisories: true, catchData: false, export: false, settings: false },
  mao: { label: 'MAO — fisheries', positions: false, alerts: false, advisories: false, catchData: true, export: true, settings: false },
  admin: { label: 'Administrator', positions: true, alerts: true, advisories: true, catchData: true, export: true, settings: true },
};

/* --------------------------------------------------------------- utils */

export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('bvsms:change', { detail: { key } }));
}

/* --------------------------------------------------------------- clock */
/* The simulated clock lets you walk a trip past its expected return during
   a demo instead of waiting two hours. Everything in the prototype reads
   time from now(). */

export function clockOffset() {
  return Number(localStorage.getItem(CLOCK_KEY) || 0);
}

export function setClockOffset(ms) {
  localStorage.setItem(CLOCK_KEY, String(ms));
  window.dispatchEvent(new CustomEvent('bvsms:clock'));
}

export function now() {
  return Date.now() + clockOffset();
}

/* --------------------------------------------------------------- seed */

function seed() {
  const t = Date.now();

  const fishers = [
    { id: 'F1', name: 'Rolando Magbanua', boat: 'F/B Jonalyn 2', contact: '0917 342 8811', crew: 2, contacts: [{ name: 'Lorna Magbanua', rel: 'Wife', phone: '0917 342 8812' }, { name: 'Barangay Duty Desk', rel: 'Barangay', phone: '0917 342 8800' }] },
    { id: 'F2', name: 'Nilo Fantonial', boat: 'F/B Melchora', contact: '0918 220 4471', crew: 1, contacts: [{ name: 'Eda Fantonial', rel: 'Wife', phone: '0918 220 4472' }] },
    { id: 'F3', name: 'Eduardo Sarmiento', boat: 'F/B Niño Jesus', contact: '0995 118 6620', crew: 3, contacts: [{ name: 'Mila Sarmiento', rel: 'Mother', phone: '0995 118 6621' }] },
    { id: 'F4', name: 'Jessie Tornilla', boat: 'F/B Sta. Cruz', contact: '0906 771 2043', crew: 2, contacts: [{ name: 'Nena Tornilla', rel: 'Wife', phone: '0906 771 2044' }] },
    { id: 'F5', name: 'Mario Ledesma', boat: 'F/B Lady Grace', contact: '0921 553 9910', crew: 2, contacts: [{ name: 'Rita Ledesma', rel: 'Sister', phone: '0921 553 9911' }] },
    { id: 'F6', name: 'Antonio Villaflor', boat: 'F/B San Isidro', contact: '0935 908 7712', crew: 1, contacts: [{ name: 'Cora Villaflor', rel: 'Wife', phone: '0935 908 7713' }] },
  ];

  const trips = [
    { id: 'T1', fisherId: 'F1', area: 'Banate Bay', departedAt: t - 5 * HOUR, expectedReturn: t + 25 * MIN, crew: 2, status: 'active', acknowledgedAt: null },
    { id: 'T2', fisherId: 'F2', area: 'Near-shore (Barotac Viejo)', departedAt: t - 8 * HOUR, expectedReturn: t - 75 * MIN, crew: 1, status: 'active', acknowledgedAt: null },
    { id: 'T3', fisherId: 'F3', area: 'Visayan Sea edge', departedAt: t - 3 * HOUR, expectedReturn: t + 2 * HOUR, crew: 3, status: 'active', acknowledgedAt: null },
    { id: 'T4', fisherId: 'F4', area: 'Banate Bay', departedAt: t - 10 * HOUR, expectedReturn: t - 5 * HOUR, crew: 2, status: 'returned', closedAt: t - 4.5 * HOUR, acknowledgedAt: null },
    { id: 'T5', fisherId: 'F5', area: 'Near-shore (Barotac Viejo)', departedAt: t - 26 * HOUR, expectedReturn: t - 20 * HOUR, crew: 2, status: 'returned', closedAt: t - 19 * HOUR, acknowledgedAt: null },
  ];

  const checkins = [
    { id: 'C1', tripId: 'T1', lat: 11.0125, lng: 122.9255, accuracy: 12, status: 'safe', deviceTime: t - 4 * HOUR, receivedAt: t - 4 * HOUR },
    { id: 'C2', tripId: 'T1', lat: 11.0198, lng: 122.9338, accuracy: 9, status: 'safe', deviceTime: t - 2 * HOUR, receivedAt: t - 2 * HOUR },
    { id: 'C3', tripId: 'T1', lat: 11.0241, lng: 122.9402, accuracy: 18, status: 'safe', deviceTime: t - 40 * MIN, receivedAt: t - 36 * MIN },
    { id: 'C4', tripId: 'T2', lat: 11.0412, lng: 122.8905, accuracy: 22, status: 'safe', deviceTime: t - 6 * HOUR, receivedAt: t - 6 * HOUR },
    { id: 'C5', tripId: 'T2', lat: 11.0455, lng: 122.8962, accuracy: 15, status: 'safe', deviceTime: t - 3 * HOUR, receivedAt: t - 3 * HOUR },
    { id: 'C6', tripId: 'T3', lat: 11.0712, lng: 122.9518, accuracy: 26, status: 'safe', deviceTime: t - 1 * HOUR, receivedAt: t - 58 * MIN },
    { id: 'C7', tripId: 'T4', lat: 11.0205, lng: 122.9288, accuracy: 11, status: 'safe', deviceTime: t - 6 * HOUR, receivedAt: t - 6 * HOUR },
    { id: 'C8', tripId: 'T4', lat: 11.0311, lng: 122.9152, accuracy: 14, status: 'safe', deviceTime: t - 5 * HOUR, receivedAt: t - 5 * HOUR },
  ];

  const catches = [
    { id: 'K1', tripId: 'T4', fisherId: 'F4', species: 'Tamban', qty: 18, unit: 'kg', gear: 'Gill net', area: 'Banate Bay', landedAt: t - 4.6 * HOUR },
    { id: 'K2', tripId: 'T4', fisherId: 'F4', species: 'Galunggong', qty: 7.5, unit: 'kg', gear: 'Gill net', area: 'Banate Bay', landedAt: t - 4.6 * HOUR },
    { id: 'K3', tripId: 'T5', fisherId: 'F5', species: 'Bangus', qty: 12, unit: 'kg', gear: 'Cast net', area: 'Near-shore (Barotac Viejo)', landedAt: t - 19.2 * HOUR },
    { id: 'K4', tripId: 'T5', fisherId: 'F5', species: 'Alimango (crab)', qty: 3.2, unit: 'kg', gear: 'Fish trap', area: 'Near-shore (Barotac Viejo)', landedAt: t - 19.2 * HOUR },
    { id: 'K5', tripId: 'T5', fisherId: 'F5', species: 'Pasayan (shrimp)', qty: 1.8, unit: 'kg', gear: 'Fish trap', area: 'Near-shore (Barotac Viejo)', landedAt: t - 19.2 * HOUR },
    { id: 'K6', tripId: 'T1', fisherId: 'F1', species: 'Tamban', qty: 9, unit: 'kg', gear: 'Gill net', area: 'Banate Bay', landedAt: t - 1 * HOUR },
    { id: 'K7', tripId: 'T2', fisherId: 'F2', species: 'Sapsap', qty: 4.5, unit: 'kg', gear: 'Hook and line', area: 'Near-shore (Barotac Viejo)', landedAt: t - 2 * HOUR },
  ];

  const advisories = [
    {
      id: 'A1', level: 'yellow',
      headline: 'Moderate winds over Banate Bay',
      body: 'Wind 28–35 kph with moderate seas. Small boats are advised to take extra care and to check in with the barangay before sailing.',
      source: 'PAGASA Iloilo — gale warning bulletin', issuedAt: t - 6 * HOUR, publishedBy: 'MDRRMO duty officer',
      voice: 'Mga mangingisda, halong kamo. Mabaskog ang hangin kag mabahô ang balod sa Banate Bay. Maghalong gid kag mag-check in antes maglayag.',
    },
    {
      id: 'A2', level: 'green',
      headline: 'Fair weather, light winds',
      body: 'No gale warning in effect. Light to moderate winds and slight seas expected until tomorrow morning.',
      source: 'PAGASA Iloilo', issuedAt: t - 26 * HOUR, publishedBy: 'MDRRMO duty officer',
      voice: 'Maayo ang panahon. Sarag kamo maglayag, pero mag-check in gihapon kamo.',
    },
  ];

  return {
    fishers,
    trips,
    checkins,
    catches,
    advisories,
    alerts: [],
    settings: { graceMinutes: 60, retentionDays: 30 },
    audit: [],
    log: [
      { id: 'L1', at: t - 26 * HOUR, actor: 'MDRRMO', action: 'Advisory published', detail: 'Green — Fair weather, light winds' },
      { id: 'L2', at: t - 6 * HOUR, actor: 'MDRRMO', action: 'Advisory published', detail: 'Yellow — Moderate winds over Banate Bay' },
      { id: 'L3', at: t - 4.5 * HOUR, actor: 'System', action: 'Trip closed', detail: 'F/B Sta. Cruz returned safe' },
    ],
    meta: { createdAt: t, version: 4 },
  };
}

let cachedDB = null;

export function getDB() {
  const db = read(DB_KEY, null);
  if (!db) {
    const fresh = seed();
    write(DB_KEY, fresh);
    cachedDB = fresh;
    return fresh;
  }
  cachedDB = db;
  return db;
}

export function saveDB(db) {
  write(DB_KEY, db);
  cachedDB = db;
}

export function resetDB() {
  const fresh = seed();
  saveDB(fresh);
  localStorage.removeItem(DEVICE_KEY);
  setClockOffset(0);
  window.dispatchEvent(new CustomEvent('bvsms:change', { detail: { key: DB_KEY } }));
  return fresh;
}

/* --------------------------------------------------------------- device */

export function getDevice() {
  const dev = read(DEVICE_KEY, null);
  if (dev) return dev;

  const t = Date.now();
  const fresh = {
    online: true,
    fisherId: 'F1',
    lang: 'hil',
    sound: true,
    outbox: [],
    trips: [
      { id: 'T1', fisherId: 'F1', area: 'Banate Bay', departedAt: t - 5 * HOUR, expectedReturn: t + 25 * MIN, crew: 2, status: 'active', synced: true },
    ],
    catches: [],
    checkins: [
      { id: 'C1', tripId: 'T1', lat: 11.0125, lng: 122.9255, accuracy: 12, status: 'safe', deviceTime: t - 4 * HOUR, synced: true },
      { id: 'C2', tripId: 'T1', lat: 11.0198, lng: 122.9338, accuracy: 9, status: 'safe', deviceTime: t - 2 * HOUR, synced: true },
      { id: 'C3', tripId: 'T1', lat: 11.0241, lng: 122.9402, accuracy: 18, status: 'safe', deviceTime: t - 40 * MIN, synced: true },
    ],
    cache: { advisories: [], alerts: [], syncedAt: null },
  };
  write(DEVICE_KEY, fresh);
  return fresh;
}

export function saveDevice(dev) {
  write(DEVICE_KEY, dev);
  return dev;
}

export function deviceFisher(dev = getDevice()) {
  const db = getDB();
  return db.fishers.find((f) => f.id === dev.fisherId) || db.fishers[0];
}

export function currentTrip(dev = getDevice()) {
  const active = dev.trips.filter((t) => t.status === 'active');
  if (!active.length) return null;
  return active.sort((a, b) => b.departedAt - a.departedAt)[0];
}

/* --------------------------------------------------------------- sync */

function applyOutboxItem(db, item, dev) {
  const receivedAt = Date.now();
  if (item.type === 'trip') {
    const existing = db.trips.find((t) => t.id === item.payload.id);
    if (!existing) db.trips.push({ ...item.payload, receivedAt });
  } else if (item.type === 'checkin') {
    if (!db.checkins.find((c) => c.id === item.payload.id)) {
      db.checkins.push({ ...item.payload, receivedAt });
    }
  } else if (item.type === 'catch') {
    if (!db.catches.find((c) => c.id === item.payload.id)) {
      db.catches.push({ ...item.payload, receivedAt });
    }
  } else if (item.type === 'return') {
    const trip = db.trips.find((t) => t.id === item.payload.tripId);
    if (trip) {
      trip.status = 'returned';
      trip.closedAt = item.payload.at;
      db.alerts.forEach((a) => {
        if (a.tripId === trip.id && !a.closedAt) {
          a.closedAt = item.payload.at;
          a.closedBy = 'Trip returned safe';
        }
      });
      db.log.unshift({
        id: uid('lg'), at: item.payload.at, actor: 'Fisher',
        action: 'Trip closed', detail: `${trip.id} returned safe`,
      });
    }
  } else if (item.type === 'ack') {
    const trip = db.trips.find((t) => t.id === item.payload.tripId);
    if (trip) {
      trip.acknowledgedAt = item.payload.at;
      db.alerts.forEach((a) => {
        if (a.tripId === trip.id && !a.closedAt) {
          a.closedAt = item.payload.at;
          a.closedBy = 'Fisher (still at sea)';
        }
      });
    }
  }
  if (item.type !== 'ack') {
    const trip = db.trips.find((t) => t.id === (item.payload.tripId || item.payload.id));
    if (trip && item.type === 'checkin') {
      trip.lastCheckinAt = item.payload.deviceTime;
    }
  }
}

export function syncDevice() {
  const dev = getDevice();
  const db = getDB();

  if (!dev.online) {
    return { synced: 0, offline: true };
  }

  const sent = dev.outbox.slice();
  sent.forEach((item) => applyOutboxItem(db, item, dev));

  dev.outbox = [];
  dev.trips.forEach((t) => { t.synced = true; });
  dev.checkins.forEach((c) => { c.synced = true; });
  dev.catches.forEach((c) => { c.synced = true; });

  const myTrips = dev.trips.map((t) => t.id);
  dev.cache = {
    advisories: db.advisories.map((a) => ({ ...a })),
    alerts: db.alerts.filter((a) => myTrips.includes(a.tripId) && !a.closedAt).map((a) => ({ ...a })),
    syncedAt: Date.now(),
  };
  dev.lastSyncAt = Date.now();

  saveDB(db);
  saveDevice(dev);
  evaluateAlerts();
  return { synced: sent.length, offline: false };
}

export function queue(type, payload) {
  const dev = getDevice();
  const item = { id: uid('q'), type, payload, queuedAt: Date.now() };
  dev.outbox.push(item);
  saveDevice(dev);

  if (dev.online) {
    const result = syncDevice();
    return { queued: item, ...result };
  }
  return { queued: item, synced: 0, offline: true };
}

/* --------------------------------------------------------------- rules */
/* The server-side rule engine: an active trip past its expected return
   plus the grace period, with no acknowledgement, raises an alert. */

export function pendingItems(dev = getDevice()) {
  return dev.outbox.length + dev.trips.filter((t) => !t.synced).length
    + dev.checkins.filter((c) => !c.synced).length
    + dev.catches.filter((c) => !c.synced).length;
}

export function latestAdvisory(db = getDB()) {
  if (!db.advisories.length) return null;
  return [...db.advisories].sort((a, b) => b.issuedAt - a.issuedAt)[0];
}

export function tripState(trip, db = getDB(), at = now()) {
  const grace = (db.settings?.graceMinutes ?? 60) * MIN;
  const eta = trip.expectedReturn;
  if (trip.status === 'returned') {
    return { key: 'returned', label: 'Returned', overdueMin: 0 };
  }
  if (at < eta) {
    return { key: 'active', label: 'At sea', overdueMin: 0, remainingMin: Math.round((eta - at) / MIN) };
  }
  const overdueMin = Math.round((at - eta) / MIN);
  if (overdueMin < Math.round(grace / MIN)) {
    return { key: 'grace', label: 'Within grace', overdueMin };
  }
  return { key: 'overdue', label: 'Overdue', overdueMin };
}

export function evaluateAlerts() {
  const db = getDB();
  const at = now();
  const advisory = latestAdvisory(db);
  let changed = false;

  db.trips.forEach((trip) => {
    if (trip.status === 'returned') {
      db.alerts.forEach((a) => {
        if (a.tripId === trip.id && !a.closedAt) {
          a.closedAt = trip.closedAt || at;
          a.closedBy = 'Trip closed';
          changed = true;
        }
      });
      return;
    }

    const state = tripState(trip, db, at);
    if (state.key !== 'overdue') return;
    if (trip.acknowledgedAt) return;

    const open = db.alerts.find((a) => a.tripId === trip.id && !a.closedAt);
    if (open) return;

    const fisher = db.fishers.find((f) => f.id === trip.fisherId) || {};
    const redInForce = advisory && advisory.level === 'red';
    const priority = redInForce || state.overdueMin >= (db.settings.graceMinutes * 2) ? 1 : 2;

    const notified = [
      ...(fisher.contacts || []).slice(0, 2).map((c) => ({ name: c.name, channel: 'SMS', at })),
      { name: 'MDRRMO duty officer', channel: priority === 1 ? 'SMS + dashboard' : 'Dashboard', at },
    ];

    db.alerts.unshift({
      id: uid('al'),
      tripId: trip.id,
      fisherId: trip.fisherId,
      priority,
      reason: `${state.overdueMin} min past the expected return, no check-in`,
      overdueMin: state.overdueMin,
      raisedAt: at,
      ackAt: null,
      closedAt: null,
      notified,
      advisoryLevel: advisory ? advisory.level : 'none',
    });

    db.log.unshift({
      id: uid('lg'),
      at,
      actor: 'Rule engine',
      action: `Priority ${priority} alert raised`,
      detail: `${fisher.boat || 'Boat'} — ${state.overdueMin} min overdue`,
    });
    changed = true;
  });

  if (changed) saveDB(db);
  return changed;
}

/* --------------------------------------------------------------- views */

export function tripsWithFishers(db = getDB()) {
  return db.trips.map((trip) => ({
    ...trip,
    fisher: db.fishers.find((f) => f.id === trip.fisherId) || { name: 'Unknown', boat: '—' },
    lastCheckin: [...db.checkins].filter((c) => c.tripId === trip.id).sort((a, b) => b.deviceTime - a.deviceTime)[0] || null,
  }));
}

export function catchSummary(db = getDB()) {
  const map = new Map();
  db.catches.forEach((c) => {
    const key = `${c.species}|${c.unit}`;
    if (!map.has(key)) {
      map.set(key, { species: c.species, unit: c.unit, total: 0, rows: 0, trips: new Set(), last: c.landedAt });
    }
    const row = map.get(key);
    row.total += Number(c.qty) || 0;
    row.rows += 1;
    row.trips.add(c.tripId);
    row.last = Math.max(row.last, c.landedAt);
  });
  return [...map.values()]
    .map((r) => ({ ...r, trips: r.trips.size }))
    .sort((a, b) => b.total - a.total);
}

export function catchesToCSV(db = getDB()) {
  const header = ['trip_id', 'fisher', 'boat', 'species', 'quantity', 'unit', 'gear', 'area', 'landed_at'];
  const lines = [header.join(',')];
  db.catches.forEach((c) => {
    const fisher = db.fishers.find((f) => f.id === c.fisherId) || {};
    lines.push([
      c.tripId,
      csvCell(fisher.name || ''),
      csvCell(fisher.boat || ''),
      csvCell(c.species),
      c.qty,
      c.unit,
      csvCell(c.gear),
      csvCell(c.area),
      new Date(c.landedAt).toISOString(),
    ].join(','));
  });
  return lines.join('\n');
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function addAudit(action, detail, actor = 'MDRRMO') {
  const db = getDB();
  db.audit.unshift({ id: uid('au'), at: now(), actor, action, detail });
  db.audit = db.audit.slice(0, 60);
  db.log.unshift({ id: uid('lg'), at: now(), actor, action, detail });
  db.log = db.log.slice(0, 80);
  saveDB(db);
}

/* --------------------------------------------------------------- format */

const MIN_MS = 60000;

export function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

export function fmtAgo(ts, at = now()) {
  if (!ts) return '—';
  const diff = Math.max(0, at - ts);
  const mins = Math.round(diff / MIN_MS);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ${mins % 60} min ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export function fmtDuration(mins) {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export function fmtClock(ts) {
  return new Date(ts).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
}
