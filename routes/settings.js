// Generic key/value settings — currently the social / livestream links used by
// the "Join the Event" popup and the social icons. Admin-editable.
import { Router } from 'express';
import db from '../db.js';

const router = Router();

// The link keys we manage, with sensible defaults seeded on first run.
export const LINK_KEYS = ['youtube_url', 'instagram_url', 'facebook_url', 'whatsapp_url'];
const DEFAULTS = {
  youtube_url: 'https://youtube.com/@propheticprayerarmy',
  instagram_url: 'https://www.instagram.com/propheticprayerarmy?igsh=MXBhZnJwMGl2dXRlNQ==',
  facebook_url: 'https://www.facebook.com/share/18acHtswEv/?mibextid=wwXIfr',
  whatsapp_url: 'https://chat.whatsapp.com/EsXsRxS5zEI66YqfKlZtst',
};

const seed = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const k of LINK_KEYS) seed.run(k, DEFAULTS[k]);

export function getLinks() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    youtube: map.youtube_url || '',
    instagram: map.instagram_url || '',
    facebook: map.facebook_url || '',
    whatsapp: map.whatsapp_url || '',
  };
}

// Public: links for the front-end (join popup + social icons).
router.get('/api/settings', (req, res) => {
  res.json({ links: getLinks() });
});

export default router;
