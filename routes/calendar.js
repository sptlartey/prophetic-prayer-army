// Generates iCalendar (.ics) feeds so visitors can add services to their
// calendar — the whole set, a single service's series, or just one occurrence.
// Each event carries the join links and 30- and 15-minute reminders.
//
//   /api/calendar.ics                          → all services (each as a series)
//   /api/calendar.ics?key=liberation           → that service's series
//   /api/calendar.ics?key=liberation&mode=single&start=<UTC ISO>  → one occurrence
//   /api/calendar.ics?dbid=5                    → a one-off admin event
import { Router } from 'express';
import { DateTime } from 'luxon';
import db from '../db.js';
import { serviceConfigs } from './events.js';
import { getLinks } from './settings.js';

const router = Router();
const ZONE = 'America/New_York';
const BYDAY = { wednesday: 'WE', liberation: 'SA' };

const VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:America/New_York',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'TZNAME:EDT',
  'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'TZNAME:EST',
  'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];

const esc = (s) =>
  String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const fmtLocal = (iso) => DateTime.fromISO(iso).setZone(ZONE).toFormat("yyyyLLdd'T'HHmmss");
const stamp = () => DateTime.utc().toFormat("yyyyLLdd'T'HHmmss'Z'");

function joinBlock() {
  const links = getLinks();
  const txt = [
    links.youtube && 'YouTube: ' + links.youtube,
    links.facebook && 'Facebook: ' + links.facebook,
    links.instagram && 'Instagram: ' + links.instagram,
  ].filter(Boolean).join('\n');
  return { txt, url: links.youtube || '' };
}

// Build one VEVENT. `rrule` null → a single (non-repeating) occurrence.
function vevent({ uid, startIso, duration, rrule, summary, location, description }) {
  const join = joinBlock();
  const desc = join.txt ? `${esc(description)}\\n\\nJoin live:\\n${esc(join.txt)}` : esc(description);
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp()}`,
    `DTSTART;TZID=${ZONE}:${fmtLocal(startIso)}`,
    `DURATION:${duration}`,
    rrule ? `RRULE:${rrule}` : '',
    `SUMMARY:${esc(summary)}`,
    `LOCATION:${esc(location || 'Online')}`,
    `DESCRIPTION:${desc}`,
    join.url ? `URL:${join.url}` : '',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Service starts in 30 minutes', 'TRIGGER:-PT30M', 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Service starts in 15 minutes', 'TRIGGER:-PT15M', 'END:VALARM',
    'END:VEVENT',
  ].filter((l) => l !== '');
}

function seriesEvent(s) {
  const isFast = s.type === 'firstFriday';
  return vevent({
    uid: `${s.key}@propheticprayerarmy.org`,
    startIso: s.nextStart,
    duration: isFast ? 'P3D' : `PT${s.durationHours}H`,
    rrule: isFast ? 'FREQ=MONTHLY;BYDAY=1FR' : `FREQ=WEEKLY;BYDAY=${BYDAY[s.key]}`,
    summary: s.title,
    location: s.location,
    description: s.description,
  });
}

function singleEvent(s, startIso) {
  const isFast = s.type === 'firstFriday';
  return vevent({
    uid: `${s.key}-${startIso}@propheticprayerarmy.org`,
    startIso,
    duration: isFast ? 'P3D' : `PT${s.durationHours}H`,
    rrule: null,
    summary: s.title,
    location: s.location,
    description: s.description,
  });
}

router.get('/api/calendar.ics', (req, res) => {
  const { key, mode, start, dbid } = req.query;
  let events = [];

  if (dbid) {
    const e = db.prepare('SELECT * FROM events WHERE id = ?').get(dbid);
    if (e) {
      const startIso = DateTime.fromISO(e.starts_at, { zone: ZONE }).toUTC().toISO();
      events = vevent({
        uid: `db-${e.id}@propheticprayerarmy.org`,
        startIso, duration: 'PT2H', rrule: null,
        summary: e.title, location: e.location, description: e.description,
      });
    }
  } else if (key) {
    const cfg = serviceConfigs().find((s) => s.key === key);
    if (cfg) events = mode === 'single' && start ? singleEvent(cfg, start) : seriesEvent(cfg);
  } else {
    events = serviceConfigs().flatMap(seriesEvent);
  }

  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The Prophetic Prayer Army//Services//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:The Prophetic Prayer Army',
    'X-WR-TIMEZONE:America/New_York', ...VTIMEZONE, ...events, 'END:VCALENDAR',
  ];
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="prophetic-prayer-army.ics"');
  res.send(lines.join('\r\n') + '\r\n');
});

export default router;
