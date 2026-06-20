// The Prophetic Prayer Army — Express server.
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import prayerRoutes from './routes/prayer.js';
import eventRoutes from './routes/events.js';
import memberRoutes from './routes/members.js';
import donationRoutes from './routes/donations.js';
import podcastRoutes from './routes/podcasts.js';
import settingsRoutes from './routes/settings.js';
import calendarRoutes from './routes/calendar.js';
import adminRoutes from './routes/admin.js';
import { refreshVideos } from './services/youtube.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// API routes
app.use(prayerRoutes);
app.use(eventRoutes);
app.use(memberRoutes);
app.use(donationRoutes);
app.use(podcastRoutes);
app.use(settingsRoutes);
app.use(calendarRoutes);
app.use(adminRoutes);

// Health check — responds instantly so Railway knows the app is ready.
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Static frontend
app.use(express.static(join(__dirname, 'public')));

// Pretty routes for the admin dashboard
app.get('/admin', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'admin', 'index.html'));
});

app.listen(PORT, async () => {
  console.log(`\n  The Prophetic Prayer Army is running:`);
  console.log(`   → Site:  http://localhost:${PORT}`);
  console.log(`   → Admin: http://localhost:${PORT}/admin\n`);

  // Pull the video feed on startup (no-op if not configured), then hourly.
  const first = await refreshVideos();
  console.log(`  [videos] ${first.message}`);
  setInterval(async () => {
    const r = await refreshVideos();
    if (r.ok) console.log(`  [videos] hourly refresh: ${r.message}`);
  }, 1000 * 60 * 60);
});
