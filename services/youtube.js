// Pulls videos from a YouTube channel/playlist RSS feed (no API key required)
// and auto-categorizes each one into the ministry's three service types.
import { XMLParser } from 'fast-xml-parser';
import db from '../db.js';

export const CATEGORIES = {
  WEDNESDAY: 'Wednesday Miracle Service',
  SATURDAY: 'Hour of Liberation',
  FASTING: 'Three Days Only Water Fasting & Prayer',
  UNCATEGORIZED: 'Uncategorized',
};

// One-time rename of the Saturday video folder → "Hour of Liberation".
// Idempotent: only matches the old label, so it's a no-op after the first run.
db.prepare("UPDATE videos SET auto_category = 'Hour of Liberation' WHERE auto_category = 'Saturday Prayer Service'").run();
db.prepare("UPDATE videos SET category_override = 'Hour of Liberation' WHERE category_override = 'Saturday Prayer Service'").run();
db.prepare("UPDATE videos SET auto_category = 'Three Days Only Water Fasting & Prayer' WHERE auto_category = 'Three Day Fasting & Prayer'").run();
db.prepare("UPDATE videos SET category_override = 'Three Days Only Water Fasting & Prayer' WHERE category_override = 'Three Day Fasting & Prayer'").run();

// Decide a category from the video title first, then fall back to the weekday
// it was published. Returns one of the CATEGORIES values.
export function categorize(title = '', publishedAt = '') {
  const t = title.toLowerCase();

  // 1) Title keyword rules (most reliable).
  //    Fasting: "fast", "three/3 day", and the ministry's "Lamentation Fast" series.
  if (/\bfast(ing)?\b|three[\s-]?day|3[\s-]?day|lamentation/.test(t)) return CATEGORIES.FASTING;
  //    Wednesday Miracle Service.
  if (/wednesday|miracle/.test(t)) return CATEGORIES.WEDNESDAY;
  //    Saturday Prayer Service — published on this channel as the
  //    "Hour of Liberation" series, plus any literal Saturday/prayer-service titles.
  if (/saturday|prayer service|hour of liberation|liberation/.test(t)) return CATEGORIES.SATURDAY;

  // 2) Fallback: weekday of publish date.
  if (publishedAt) {
    const d = new Date(publishedAt);
    if (!Number.isNaN(d.getTime())) {
      const day = d.getUTCDay(); // 0 Sun .. 6 Sat
      if (day === 3) return CATEGORIES.WEDNESDAY;
      if (day === 6) return CATEGORIES.SATURDAY;
    }
  }

  // 3) Couldn't tell — flag for the admin to assign manually.
  return CATEGORIES.UNCATEGORIZED;
}

function feedUrl() {
  const channel = process.env.YT_CHANNEL_ID?.trim();
  const playlist = process.env.YT_PLAYLIST_ID?.trim();
  if (channel) return `https://www.youtube.com/feeds/videos.xml?channel_id=${channel}`;
  if (playlist) return `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlist}`;
  return null;
}

const upsert = db.prepare(`
  INSERT INTO videos (video_id, title, published_at, thumbnail, auto_category)
  VALUES (@video_id, @title, @published_at, @thumbnail, @auto_category)
  ON CONFLICT(video_id) DO UPDATE SET
    title = excluded.title,
    published_at = excluded.published_at,
    thumbnail = excluded.thumbnail,
    auto_category = excluded.auto_category
`);

// Fetch the feed and upsert all entries. Returns { ok, count, message }.
export async function refreshVideos() {
  const url = feedUrl();
  if (!url) {
    return { ok: false, count: 0, message: 'No YT_CHANNEL_ID or YT_PLAYLIST_ID configured in .env.' };
  }

  let xml;
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, count: 0, message: `YouTube feed returned HTTP ${res.status}.` };
    xml = await res.text();
  } catch (err) {
    return { ok: false, count: 0, message: `Could not reach YouTube: ${err.message}` };
  }

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  let parsed;
  try {
    parsed = parser.parse(xml);
  } catch (err) {
    return { ok: false, count: 0, message: `Could not parse feed: ${err.message}` };
  }

  let entries = parsed?.feed?.entry ?? [];
  if (!Array.isArray(entries)) entries = [entries];

  let count = 0;
  const tx = db.transaction((rows) => {
    for (const e of rows) {
      const videoId = e['yt:videoId'];
      if (!videoId) continue;
      const title = String(e.title ?? '');
      const published = String(e.published ?? '');
      const media = e['media:group'] || {};
      const thumb = media['media:thumbnail']?.['@_url']
        || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      upsert.run({
        video_id: videoId,
        title,
        published_at: published,
        thumbnail: thumb,
        auto_category: categorize(title, published),
      });
      count++;
    }
  });
  tx(entries);

  return { ok: true, count, message: `Imported/updated ${count} video(s).` };
}

// Effective category = admin override if set, otherwise the auto guess.
export function effectiveCategory(row) {
  return row.category_override || row.auto_category || CATEGORIES.UNCATEGORIZED;
}

// All videos grouped by effective category, newest first within each group.
export function groupedVideos() {
  const rows = db.prepare('SELECT * FROM videos ORDER BY published_at DESC').all();
  const groups = {
    [CATEGORIES.WEDNESDAY]: [],
    [CATEGORIES.SATURDAY]: [],
    [CATEGORIES.FASTING]: [],
    [CATEGORIES.UNCATEGORIZED]: [],
  };
  for (const r of rows) {
    const cat = effectiveCategory(r);
    (groups[cat] ||= []).push({
      video_id: r.video_id,
      title: r.title,
      published_at: r.published_at,
      thumbnail: r.thumbnail,
      category: cat,
    });
  }
  return groups;
}
