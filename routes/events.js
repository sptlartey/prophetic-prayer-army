// Public read of upcoming events.
//
// The weekly services (Wednesday Miracle Service, Saturday Prayer Service) are
// generated automatically from the calendar, so the site always shows the next
// upcoming dates without anyone editing them. One-off / special events (e.g.
// Three Day Fasting & Prayer) are managed by the admin and stored in the DB.
import { Router } from 'express';
import db from '../db.js';

const router = Router();

// Weekly recurring services. weekday: 0=Sun … 6=Sat. time is 24h "HH:MM".
const RECURRING_SERVICES = [
  {
    title: 'Wednesday Miracle Service',
    weekday: 3,
    time: '19:00',
    location: 'Main Sanctuary',
    description: 'A mid-week encounter for prophetic ministry, healing, and the miraculous power of God.',
  },
  {
    title: 'Saturday Prayer Service',
    weekday: 6,
    time: '07:00',
    location: 'Prayer Hall',
    description: 'Early-morning corporate prayer and intercession for families, the church, and the nations.',
  },
];

// These titles are now auto-generated, so make sure no stale stored copies
// (e.g. old seed rows) linger and create duplicates. Idempotent; runs at boot.
const recurringTitles = RECURRING_SERVICES.map((s) => s.title);
db.prepare(
  `DELETE FROM events WHERE title IN (${recurringTitles.map(() => '?').join(',')})`
).run(...recurringTitles);

const pad = (n) => String(n).padStart(2, '0');
const fmtLocal = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// The next `count` occurrences of a weekly service, starting from `from`.
function nextOccurrences(weekday, time, count, from) {
  const [hh, mm] = time.split(':').map(Number);
  let d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), hh, mm, 0, 0);
  // Advance day-by-day until we hit the right weekday AND it's still in the future.
  while (d.getDay() !== weekday || d <= from) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, hh, mm, 0, 0);
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(fmtLocal(d));
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7, hh, mm, 0, 0);
  }
  return out;
}

router.get('/api/events', (req, res) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  // Auto-generate the next few weeks of each weekly service.
  const generated = [];
  for (const s of RECURRING_SERVICES) {
    for (const starts_at of nextOccurrences(s.weekday, s.time, 3, now)) {
      generated.push({
        id: `auto-${s.weekday}-${starts_at}`,
        title: s.title,
        starts_at,
        location: s.location,
        description: s.description,
        recurring: true,
      });
    }
  }

  // Upcoming one-off events from the admin (drop anything in the past).
  const dbEvents = db
    .prepare('SELECT id, title, starts_at, location, description FROM events ORDER BY starts_at ASC')
    .all()
    .filter((e) => new Date(e.starts_at) >= startOfToday);

  const all = [...generated, ...dbEvents].sort(
    (a, b) => new Date(a.starts_at) - new Date(b.starts_at)
  );

  res.json(all);
});

export default router;
