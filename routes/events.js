// Public read of upcoming events.
//
// The weekly/monthly services are generated automatically from the calendar and
// anchored to US Eastern time (DST handled by Luxon). Their time/location/etc.
// are admin-editable (stored in service_settings, falling back to the defaults
// below). One-off / special events are managed by the admin and stored in the
// DB events table.
import { Router } from 'express';
import { DateTime } from 'luxon';
import db from '../db.js';

const router = Router();
const ZONE = 'America/New_York';

// Recurring services. weekday uses Luxon numbering: 1=Mon … 7=Sun.
export const RECURRING = [
  {
    key: 'wednesday',
    title: 'Wednesday Miracle Service',
    type: 'weekly',
    weekday: 3, // Wednesday
    time: '19:00',
    durationHours: 2,
    location: 'Online',
    description: 'A mid-week encounter for prophetic ministry, healing, and the miraculous power of God.',
  },
  {
    key: 'liberation',
    title: 'Hour of Liberation',
    type: 'weekly',
    weekday: 6, // Saturday
    time: '16:00',
    durationHours: 2,
    location: 'Online',
    description: 'A Saturday hour of liberation, deliverance, and prevailing prayer for breakthrough.',
  },
  {
    key: 'fasting',
    title: 'Three Days Only Water Fast & Prayer',
    type: 'firstFriday',
    time: '00:00',
    durationHours: 72,
    location: 'Online',
    description: 'A consecrated three-day fast seeking the face of God for breakthrough.',
  },
];

// Seed the editable settings from the defaults the first time (idempotent).
const seedSetting = db.prepare(
  `INSERT OR IGNORE INTO service_settings (service_key, time, duration_hours, location, description)
   VALUES (?, ?, ?, ?, ?)`
);
for (const s of RECURRING) {
  seedSetting.run(s.key, s.time, s.durationHours, s.location, s.description);
}

// One-time: adopt the "Three Days Only Water Fast & Prayer" naming/details for
// installs seeded before this change (title falls back to the new code default).
const renamed = db.prepare("SELECT 1 FROM settings WHERE key = 'fast_rename_v1'").get();
if (!renamed) {
  db.prepare(
    "UPDATE service_settings SET description = ?, title = NULL WHERE service_key = 'fasting'"
  ).run('A consecrated three-day fast seeking the face of God for breakthrough.');
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('fast_rename_v1', '1')").run();
}

// One-time: all services are online — drop any "& Onsite" / platform notes.
const allOnline = db.prepare("SELECT 1 FROM settings WHERE key = 'all_online_v1'").get();
if (!allOnline) {
  db.prepare("UPDATE service_settings SET location = 'Online'").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('all_online_v1', '1')").run();
}

// Remove stale stored copies of these titles (incl. legacy "Saturday Prayer
// Service" and the duplicate one-off water-fast event) so nothing duplicates
// the generated cards. Idempotent at boot.
const cleanupTitles = [
  'Wednesday Miracle Service',
  'Hour of Liberation',
  'Saturday Prayer Service',
  'Three Day Fasting & Prayer',
  'Three Days Only Water Fast & Prayer',
];
db.prepare(
  `DELETE FROM events WHERE title IN (${cleanupTitles.map(() => '?').join(',')})`
).run(...cleanupTitles);

const settingsStmt = db.prepare('SELECT * FROM service_settings WHERE service_key = ?');
const isCancelledStmt = db.prepare(
  'SELECT 1 FROM event_cancellations WHERE service_key = ? AND occurrence_start = ?'
);
const isCancelled = (key, startIso) => Boolean(isCancelledStmt.get(key, startIso));

// Merge admin-editable settings over the code defaults for a service.
function merged(svc) {
  const s = settingsStmt.get(svc.key) || {};
  return {
    ...svc,
    title: s.title || svc.title,
    time: s.time ?? svc.time,
    durationHours: s.duration_hours ?? svc.durationHours,
    location: s.location ?? svc.location,
    description: s.description ?? svc.description,
    liveLink: s.live_link || null,
  };
}

// Next occurrence of a weekly service as Luxon DateTimes in ET.
function weeklyOccurrence(svc, now) {
  const today = now.setZone(ZONE).startOf('day');
  const [hh, mm] = svc.time.split(':').map(Number);
  const diff = (svc.weekday - today.weekday + 7) % 7;
  let start = today.plus({ days: diff }).set({ hour: hh, minute: mm });
  let removeAt = start.startOf('day').plus({ days: 1 }); // midnight ET ending the event day
  if (removeAt <= now) {
    start = start.plus({ weeks: 1 });
    removeAt = start.startOf('day').plus({ days: 1 });
  }
  const end = start.plus({ hours: svc.durationHours });
  return { start, end, removeAt };
}

// First Friday of the month, running Fri → Sunday midnight (remove Mon 00:00 ET).
function firstFridayOccurrence(svc, now) {
  const [hh, mm] = svc.time.split(':').map(Number);
  const firstFriday = (year, month) => {
    const d1 = DateTime.fromObject({ year, month, day: 1 }, { zone: ZONE });
    const add = (5 - d1.weekday + 7) % 7; // 5 = Friday
    return d1.plus({ days: add }).set({ hour: hh, minute: mm, second: 0, millisecond: 0 });
  };
  const et = now.setZone(ZONE);
  let start = firstFriday(et.year, et.month);
  let end = start.startOf('day').plus({ days: 3 }); // end of Sunday (Mon 00:00)
  if (end <= now) {
    const nm = et.plus({ months: 1 });
    start = firstFriday(nm.year, nm.month);
    end = start.startOf('day').plus({ days: 3 });
  }
  return { start, end, removeAt: end };
}

// Full event objects for the recurring services (UTC ISO instants).
export function recurringEvents() {
  const now = DateTime.utc();
  return RECURRING.map((base) => {
    const svc = merged(base);
    const occ = svc.type === 'weekly' ? weeklyOccurrence(svc, now) : firstFridayOccurrence(svc, now);
    const start = occ.start.toUTC().toISO();
    return {
      id: `${svc.key}-${start}`,
      key: svc.key,
      title: svc.title,
      location: svc.location,
      description: svc.description,
      liveLink: svc.liveLink,
      start,
      end: occ.end.toUTC().toISO(),
      removeAt: occ.removeAt.toUTC().toISO(),
      cancelled: isCancelled(svc.key, start),
      recurring: true,
    };
  });
}

// Admin-facing list: editable settings + the next occurrence + cancelled flag.
export function serviceConfigs() {
  return RECURRING.map((base) => {
    const svc = merged(base);
    const evt = recurringEvents().find((e) => e.key === svc.key);
    return {
      key: svc.key,
      title: svc.title,
      type: svc.type,
      time: svc.time,
      durationHours: svc.durationHours,
      location: svc.location,
      description: svc.description,
      liveLink: svc.liveLink,
      nextStart: evt?.start,
      cancelled: evt?.cancelled || false,
    };
  });
}

router.get('/api/events', (req, res) => {
  const now = DateTime.utc();
  const events = recurringEvents();

  // Upcoming one-off events from the admin (interpreted in ET).
  const dbEvents = db
    .prepare('SELECT id, title, starts_at, location, description FROM events ORDER BY starts_at ASC')
    .all();
  for (const e of dbEvents) {
    const start = DateTime.fromISO(e.starts_at, { zone: ZONE });
    if (!start.isValid) continue;
    const removeAt = start.startOf('day').plus({ days: 1 });
    if (removeAt <= now) continue;
    events.push({
      id: `db-${e.id}`,
      key: null,
      title: e.title,
      location: e.location,
      description: e.description,
      start: start.toUTC().toISO(),
      end: start.plus({ hours: 2 }).toUTC().toISO(),
      removeAt: removeAt.toUTC().toISO(),
      cancelled: false,
      recurring: false,
    });
  }

  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  res.json(events);
});

export default router;
