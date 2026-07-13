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
    payment_ref     TEXT,                     -- processor's transaction reference (tx_ref)
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

  -- Records that a specific occurrence of a recurring service is cancelled.
  CREATE TABLE IF NOT EXISTS event_cancellations (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    service_key        TEXT NOT NULL,         -- wednesday | liberation | fasting
    occurrence_start   TEXT NOT NULL,         -- the occurrence's UTC ISO start
    created_at         TEXT DEFAULT (datetime('now')),
    UNIQUE(service_key, occurrence_start)
  );

  -- Admin-editable settings per recurring service (time, duration, etc.).
  CREATE TABLE IF NOT EXISTS service_settings (
    service_key        TEXT PRIMARY KEY,      -- wednesday | liberation | fasting
    time               TEXT,                  -- "HH:MM" Eastern
    duration_hours     REAL,
    location           TEXT,
    description        TEXT
  );

  -- Generic key/value settings (e.g. social / livestream links).
  CREATE TABLE IF NOT EXISTS settings (
    key                TEXT PRIMARY KEY,
    value              TEXT
  );

  -- Video library categories (the "folders" shown on the site). Admin-creatable;
  -- position controls display order.
  CREATE TABLE IF NOT EXISTS video_categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT UNIQUE NOT NULL,
    position    INTEGER NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

// Migration: track which method a gift used (card | paypal). Safe to run on
// every boot — only adds the column if it isn't there yet.
const donationCols = db.prepare('PRAGMA table_info(donations)').all().map((c) => c.name);
if (!donationCols.includes('method')) {
  db.exec("ALTER TABLE donations ADD COLUMN method TEXT DEFAULT 'card'");
}

// Migration: the payment processor's own reference for a gift (was
// stripe_session; renamed when card giving moved from Stripe to Flutterwave).
if (donationCols.includes('stripe_session') && !donationCols.includes('payment_ref')) {
  db.exec('ALTER TABLE donations RENAME COLUMN stripe_session TO payment_ref');
} else if (!donationCols.includes('payment_ref')) {
  db.exec('ALTER TABLE donations ADD COLUMN payment_ref TEXT');
}

// Migration: allow an admin-editable title per recurring service.
const svcCols = db.prepare('PRAGMA table_info(service_settings)').all().map((c) => c.name);
if (!svcCols.includes('title')) {
  db.exec('ALTER TABLE service_settings ADD COLUMN title TEXT');
}
if (!svcCols.includes('live_link')) {
  db.exec('ALTER TABLE service_settings ADD COLUMN live_link TEXT');
}
if (!svcCols.includes('weekday')) {
  db.exec('ALTER TABLE service_settings ADD COLUMN weekday INTEGER');
}

// Seed one example special event the first time the DB is created so the
// landing page isn't empty. The weekly Wednesday/Saturday services are NOT
// seeded here — they are generated automatically from the calendar in
// routes/events.js so their dates always stay current.
const eventCount = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
if (eventCount === 0) {
  db.prepare(
    'INSERT INTO events (title, starts_at, location, description) VALUES (?, ?, ?, ?)'
  ).run(
    'Three Days Only Water Fasting & Prayer',
    '2026-07-01T18:00',
    'Online + Onsite',
    'A consecrated three-day fast seeking the face of God for breakthrough.'
  );
}

// Seed the video library's default categories the first time (idempotent —
// only inserts names that aren't already there, so admin-added categories or
// renames are never touched).
const seedCategory = db.prepare(
  'INSERT OR IGNORE INTO video_categories (name, position) VALUES (?, ?)'
);
[
  'Wednesday Miracle Service',
  'Hour of Liberation',
  'Three Days Only Water Fasting & Prayer',
  'Operation 1000 souls campaign',
].forEach((name, i) => seedCategory.run(name, i));

export default db;
