// SQLite setup, schema, and a small amount of seed data.
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// In production (e.g. Railway), point DATA_DIR at a mounted persistent volume
// so the database survives redeploys. Locally it defaults to ./data.
const dataDir = process.env.DATA_DIR || join(__dirname, 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS prayer_requests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT,
    email       TEXT,
    request     TEXT NOT NULL,
    is_private  INTEGER DEFAULT 0,
    status      TEXT DEFAULT 'open',          -- open | praying | answered
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    starts_at   TEXT NOT NULL,                -- ISO date/time
    location    TEXT,
    description TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS members (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    phone       TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    message     TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS donations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    amount_cents    INTEGER NOT NULL,
    currency        TEXT DEFAULT 'usd',
    donor_name      TEXT,
    donor_email     TEXT,
    stripe_session  TEXT,
    status          TEXT DEFAULT 'pending',   -- pending | completed
    created_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS videos (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id           TEXT UNIQUE NOT NULL,  -- YouTube video id
    title              TEXT NOT NULL,
    published_at       TEXT,
    thumbnail          TEXT,
    auto_category      TEXT,                  -- category guessed from title/date
    category_override  TEXT,                  -- admin-chosen category (wins if set)
    created_at         TEXT DEFAULT (datetime('now'))
  );
`);

// Seed a couple of example events the first time the DB is created so the
// landing page isn't empty before the admin adds real ones.
const eventCount = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
if (eventCount === 0) {
  const insert = db.prepare(
    'INSERT INTO events (title, starts_at, location, description) VALUES (?, ?, ?, ?)'
  );
  insert.run(
    'Wednesday Miracle Service',
    '2026-06-24T19:00',
    'Main Sanctuary',
    'A mid-week gathering for prophetic ministry, healing, and miracles.'
  );
  insert.run(
    'Saturday Prayer Service',
    '2026-06-27T07:00',
    'Prayer Hall',
    'Early-morning corporate prayer and intercession for families and nations.'
  );
  insert.run(
    'Three Day Fasting & Prayer',
    '2026-07-01T18:00',
    'Online + Onsite',
    'A consecrated three-day fast seeking the face of God for breakthrough.'
  );
}

export default db;
