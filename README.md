# The Prophetic Prayer Army — Website + Backend

A prayer-ministry website with a Node.js/Express + SQLite backend. It includes prayer
requests, events management, member sign-up, contact, online giving (Stripe), and a
video library that auto-pulls from YouTube and sorts services into three categories.

## Features

- **Landing page** — hero, mission/values, weekly services, events, video library, prayer, giving, contact.
- **Prayer requests** — public form → stored in DB → managed in the admin (open / praying / answered).
- **Events** — admin add/edit/delete; the landing page lists upcoming events.
- **Members & contact** — sign-up and contact forms saved to the database.
- **Giving** — Stripe Checkout (test mode). Without a key, the page shows a friendly "not configured" notice.
- **Video library** — pulls your YouTube channel/playlist RSS feed (no API key) and auto-categorizes each
  video by title + date into:
  - Wednesday Miracle Service
  - Saturday Prayer Service
  - Three Day Fasting & Prayer
  Admins can manually reassign any video.

## Quick start

```bash
cd prophetic-prayer-army
npm install
cp .env.example .env        # then edit .env
npm start
```

- Site:  http://localhost:3000
- Admin: http://localhost:3000/admin  (log in with `ADMIN_PASSWORD` from `.env`)

## Configuration (`.env`)

| Variable            | Purpose                                                                 |
|---------------------|-------------------------------------------------------------------------|
| `PORT`              | Server port (default 3000).                                             |
| `ADMIN_PASSWORD`    | Password for the admin dashboard. **Change this.**                      |
| `YT_CHANNEL_ID`     | Your YouTube channel ID — videos are pulled from its RSS feed.          |
| `YT_PLAYLIST_ID`    | Alternative to channel ID; pulls a single playlist.                     |
| `STRIPE_SECRET_KEY` | Stripe **test** secret key to enable online giving (optional).         |
| `SITE_URL`          | Base URL used for Stripe redirect (default http://localhost:3000).      |

Find your channel ID at <https://www.youtube.com/account_advanced>.

## How video auto-sorting works

1. On startup (and hourly, and on the admin "Refresh" button) the server fetches
   `https://www.youtube.com/feeds/videos.xml?channel_id=...`.
2. Each video is categorized by:
   - **Title keywords** first — e.g. "miracle"/"wednesday" → Wednesday; "fasting"/"three day" → Fasting.
   - **Publish weekday** as a fallback — Wednesday uploads → Wednesday service, Saturday → Saturday.
   - Anything unclear is marked **Uncategorized** for you to assign in the admin.
3. An admin override always wins over the automatic guess. Choose **(auto)** to revert.

## Project structure

```
server.js            Express app
db.js                SQLite schema + seed
routes/              prayer, events, members, donations, podcasts, admin
services/youtube.js  YouTube RSS fetch + categorization
public/              index.html, sermons.html, admin/, css/, js/, img/
data/app.db          SQLite database (created at runtime; gitignored)
```

## Replacing placeholder content

- **Hero image:** drop a photo at `public/img/hero.jpg` and change the `url('../img/hero.svg')`
  reference in `public/css/style.css` to `hero.jpg`.
- **Mission/Give images:** the `.media` blocks use a gradient placeholder; swap for `<img>` tags.
- **Text:** edit `public/index.html` directly.

## Going live (later)

Deploy to Render, Railway, or any Node host. Set the same `.env` variables there, switch
Stripe to live keys, and point `SITE_URL` at your real domain.
