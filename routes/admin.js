// Lightweight admin: single shared password (from .env), signed cookie session,
// and endpoints to manage events, prayer requests, and video categories.
import { Router } from 'express';
import { DateTime } from 'luxon';
import db from '../db.js';
import { CATEGORIES, refreshVideos } from '../services/youtube.js';
import { serviceConfigs, ZONE } from './events.js';
import { LINK_KEYS, getLinks } from './settings.js';

const router = Router();

// A tiny opaque token derived from the password. Good enough for a single-admin
// ministry site; not a substitute for real auth on a multi-user app.
function token() {
  const pw = process.env.ADMIN_PASSWORD || 'change-me-please';
  return Buffer.from(`ppa:${pw}`).toString('base64');
}

function requireAdmin(req, res, next) {
  if (req.cookies?.ppa_admin === token()) return next();
  res.status(401).json({ error: 'Not authorized. Please log in.' });
}

// --- Auth ---
router.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== (process.env.ADMIN_PASSWORD || 'change-me-please')) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  res.cookie('ppa_admin', token(), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 12, // 12 hours
  });
  res.json({ ok: true });
});

router.post('/api/admin/logout', (req, res) => {
  res.clearCookie('ppa_admin');
  res.json({ ok: true });
});

router.get('/api/admin/me', (req, res) => {
  res.json({ authenticated: req.cookies?.ppa_admin === token() });
});

// --- Prayer requests ---
router.get('/api/admin/prayer', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM prayer_requests ORDER BY created_at DESC').all());
});

router.patch('/api/admin/prayer/:id', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  const allowed = ['open', 'praying', 'answered'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  db.prepare('UPDATE prayer_requests SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

// --- Events (full CRUD) ---
router.get('/api/admin/events', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM events ORDER BY starts_at ASC').all());
});

// The "Date & time" field has no timezone of its own — it's always read as ET
// (matching how the public /api/events feed interprets it, and how the
// recurring services are anchored). If the entered value already fell off the
// public feed (its ET calendar day is over), saving would succeed but the
// event would silently never appear on the site — catch that here instead.
function pastInET(startsAt) {
  const start = DateTime.fromISO(startsAt, { zone: ZONE });
  if (!start.isValid) return true;
  const removeAt = start.startOf('day').plus({ days: 1 });
  return removeAt <= DateTime.utc();
}

router.post('/api/admin/events', requireAdmin, (req, res) => {
  const { title, starts_at, location, description } = req.body || {};
  if (!title?.trim() || !starts_at?.trim()) {
    return res.status(400).json({ error: 'Title and start date/time are required.' });
  }
  if (pastInET(starts_at.trim())) {
    return res.status(400).json({
      error: 'That date/time has already passed in Eastern Time (ET) — the site schedules events in ET, so this would never show on the page. Check the date, or account for the difference from ET.',
    });
  }
  const info = db
    .prepare('INSERT INTO events (title, starts_at, location, description) VALUES (?, ?, ?, ?)')
    .run(title.trim(), starts_at.trim(), location?.trim() || null, description?.trim() || null);
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

router.put('/api/admin/events/:id', requireAdmin, (req, res) => {
  const { title, starts_at, location, description } = req.body || {};
  if (!title?.trim() || !starts_at?.trim()) {
    return res.status(400).json({ error: 'Title and start date/time are required.' });
  }
  if (pastInET(starts_at.trim())) {
    return res.status(400).json({
      error: 'That date/time has already passed in Eastern Time (ET) — the site schedules events in ET, so this would never show on the page. Check the date, or account for the difference from ET.',
    });
  }
  db.prepare('UPDATE events SET title = ?, starts_at = ?, location = ?, description = ? WHERE id = ?')
    .run(title.trim(), starts_at.trim(), location?.trim() || null, description?.trim() || null, req.params.id);
  res.json({ ok: true });
});

router.delete('/api/admin/events/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Members / contacts / donations (read-only views) ---
router.get('/api/admin/members', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM members ORDER BY created_at DESC').all());
});
router.get('/api/admin/contacts', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all());
});
router.get('/api/admin/donations', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM donations ORDER BY created_at DESC').all());
});

// --- Videos: list, refresh, and manual category override ---
router.get('/api/admin/videos', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM videos ORDER BY published_at DESC').all());
});

router.post('/api/admin/videos/refresh', requireAdmin, async (req, res) => {
  const result = await refreshVideos();
  res.status(result.ok ? 200 : 502).json(result);
});

router.patch('/api/admin/videos/:videoId/category', requireAdmin, (req, res) => {
  const { category } = req.body || {};
  const valid = [...Object.values(CATEGORIES), null, ''];
  if (!valid.includes(category)) return res.status(400).json({ error: 'Invalid category.' });
  // Empty string clears the override and reverts to the auto guess.
  db.prepare('UPDATE videos SET category_override = ? WHERE video_id = ?')
    .run(category || null, req.params.videoId);
  res.json({ ok: true });
});

router.get('/api/admin/categories', requireAdmin, (req, res) => {
  res.json(Object.values(CATEGORIES));
});

// --- Recurring services: edit time/details + cancel an occurrence ---
router.get('/api/admin/services', requireAdmin, (req, res) => {
  res.json(serviceConfigs());
});

router.put('/api/admin/services/:key', requireAdmin, (req, res) => {
  const { title, time, durationHours, location, description, liveLink, weekday } = req.body || {};
  if (time && !/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ error: 'Time must be in HH:MM (24-hour) format.' });
  }
  const wdNum = weekday != null && weekday !== '' ? Number(weekday) : null;
  if (wdNum !== null && (wdNum < 1 || wdNum > 7 || !Number.isInteger(wdNum))) {
    return res.status(400).json({ error: 'Weekday must be 1 (Mon) – 7 (Sun).' });
  }
  const exists = db.prepare('SELECT 1 FROM service_settings WHERE service_key = ?').get(req.params.key);
  if (!exists) return res.status(404).json({ error: 'Unknown service.' });
  db.prepare(
    `UPDATE service_settings
       SET title = COALESCE(?, title),
           time = COALESCE(?, time),
           weekday = COALESCE(?, weekday),
           duration_hours = COALESCE(?, duration_hours),
           location = COALESCE(?, location),
           description = COALESCE(?, description),
           live_link = ?
     WHERE service_key = ?`
  ).run(
    title && title.trim() ? title.trim() : null,
    time || null,
    wdNum,
    durationHours != null && durationHours !== '' ? Number(durationHours) : null,
    location ?? null,
    description ?? null,
    typeof liveLink === 'string' ? liveLink.trim() || null : null,
    req.params.key
  );
  res.json({ ok: true });
});

router.post('/api/admin/recurring/cancel', requireAdmin, (req, res) => {
  const { key, start, cancelled } = req.body || {};
  if (!key || !start) return res.status(400).json({ error: 'key and start are required.' });
  if (cancelled) {
    db.prepare(
      'INSERT OR IGNORE INTO event_cancellations (service_key, occurrence_start) VALUES (?, ?)'
    ).run(key, start);
  } else {
    db.prepare(
      'DELETE FROM event_cancellations WHERE service_key = ? AND occurrence_start = ?'
    ).run(key, start);
  }
  res.json({ ok: true });
});

// --- Social / livestream links ---
router.get('/api/admin/settings', requireAdmin, (req, res) => {
  res.json(getLinks());
});

router.put('/api/admin/settings', requireAdmin, (req, res) => {
  const body = req.body || {};
  // Accept the friendly keys (youtube, instagram, …) → store as *_url.
  const map = {
    youtube: 'youtube_url',
    instagram: 'instagram_url',
    facebook: 'facebook_url',
    whatsapp: 'whatsapp_url',
  };
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  for (const [friendly, col] of Object.entries(map)) {
    if (typeof body[friendly] === 'string' && LINK_KEYS.includes(col)) {
      upsert.run(col, body[friendly].trim());
    }
  }
  res.json({ ok: true, links: getLinks() });
});

export default router;
