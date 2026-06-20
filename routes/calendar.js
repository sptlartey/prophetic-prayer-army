// Generates an iCalendar (.ics) feed with all recurring services so visitors can
// add them to Apple/Google/Outlook calendars — with the join links in each
// event and 30- and 15-minute reminders.
import { Router } from 'express';
import { DateTime } from 'luxon';
import { serviceConfigs } from './events.js';
import { getLinks } from './settings.js';

const router = Router();
const ZONE = 'America/New_York';
const BYDAY = { wednesday: 'WE', liberation: 'SA' };

// Standard US Eastern timezone definition (EST/EDT).
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:America/New_York',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'TZNAME:EDT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'TZNAME:EST',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

const esc = (s) =>
  String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

const fmtLocal = (iso) => DateTime.fromISO(iso).setZone(ZONE).toFormat("yyyyLLdd'T'HHmmss");

router.get('/api/calendar.ics', (req, res) => {
  const links = getLinks();
  const stamp = DateTime.utc().toFormat("yyyyLLdd'T'HHmmss'Z'");
  const joinText = [
    links.youtube && 'YouTube: ' + links.youtube,
    links.facebook && 'Facebook: ' + links.facebook,
    links.instagram && 'Instagram: ' + links.instagram,
  ].filter(Boolean).join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Prophetic Prayer Army//Services//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:The Prophetic Prayer Army',
    'X-WR-TIMEZONE:America/New_York',
    ...VTIMEZONE,
  ];

  for (const s of serviceConfigs()) {
    if (!s.nextStart) continue;
    const isFast = s.type === 'firstFriday';
    const rrule = isFast ? 'FREQ=MONTHLY;BYDAY=1FR' : `FREQ=WEEKLY;BYDAY=${BYDAY[s.key]}`;
    const duration = isFast ? 'P3D' : `PT${s.durationHours}H`;
    const description = joinText
      ? `${esc(s.description)}\\n\\nJoin live:\\n${esc(joinText)}`
      : esc(s.description);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.key}@propheticprayerarmy.org`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${ZONE}:${fmtLocal(s.nextStart)}`,
      `DURATION:${duration}`,
      `RRULE:${rrule}`,
      `SUMMARY:${esc(s.title)}`,
      `LOCATION:${esc(s.location || 'Online')}`,
      `DESCRIPTION:${description}`,
      links.youtube ? `URL:${links.youtube}` : '',
      // Reminders at 30 and 15 minutes before.
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Service starts in 30 minutes', 'TRIGGER:-PT30M', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Service starts in 15 minutes', 'TRIGGER:-PT15M', 'END:VALARM',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="prophetic-prayer-army.ics"');
  res.send(lines.filter((l) => l !== '').join('\r\n') + '\r\n');
});

export default router;
