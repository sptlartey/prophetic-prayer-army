// The Prophetic Prayer Army — frontend behaviour.

// --- Helpers ---
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function toast(message, isError = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('err', isError);
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3600);
}

function setMsg(id, text, ok = true) {
  const el = $('#' + id);
  if (!el) return;
  el.textContent = text;
  el.className = 'form-msg ' + (ok ? 'ok' : 'err');
}

async function postJSON(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: '—', mon: '', full: iso };
  return {
    day: d.getDate(),
    mon: d.toLocaleString('en-US', { month: 'short' }),
    full: d.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
  };
}

// --- Mobile nav ---
$('#navToggle')?.addEventListener('click', () => $('#navLinks')?.classList.toggle('open'));
$$('#navLinks a').forEach((a) => a.addEventListener('click', () => $('#navLinks')?.classList.remove('open')));

// --- Year in footer ---
const yearEl = $('#year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// --- Events ---
async function loadEvents() {
  const list = $('#eventList');
  if (!list) return;
  try {
    const res = await fetch('/api/events');
    const events = await res.json();
    if (!events.length) {
      list.innerHTML = '<p class="center empty-note">No upcoming events posted yet. Check back soon.</p>';
      return;
    }
    list.innerHTML = events.map((e) => {
      const d = fmtDate(e.starts_at);
      return `
        <article class="event">
          <div class="date"><div class="d">${d.day}</div><div class="m">${d.mon}</div></div>
          <div>
            <h3>${escapeHtml(e.title)}</h3>
            <div class="meta">${d.full}${e.location ? ' &middot; ' + escapeHtml(e.location) : ''}</div>
            ${e.description ? `<p style="margin:.4rem 0 0;color:var(--muted)">${escapeHtml(e.description)}</p>` : ''}
          </div>
        </article>`;
    }).join('');
  } catch {
    list.innerHTML = '<p class="center empty-note">Could not load events.</p>';
  }
}

// --- Videos ---
const CATEGORY_ORDER = [
  'Wednesday Miracle Service',
  'Saturday Prayer Service',
  'Three Day Fasting & Prayer',
];

function videoCard(v) {
  const when = v.published_at ? new Date(v.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  return `
    <article class="video">
      <div class="thumb" data-video="${v.video_id}">
        <img src="${v.thumbnail}" alt="${escapeHtml(v.title)}" loading="lazy" />
      </div>
      <div class="body">
        <h4>${escapeHtml(v.title)}</h4>
        <div class="when">${when}</div>
      </div>
    </article>`;
}

async function loadVideos() {
  const lib = $('#videoLibrary');
  if (!lib) return;
  try {
    const res = await fetch('/api/videos');
    const groups = await res.json();
    const sections = CATEGORY_ORDER
      .filter((cat) => (groups[cat] || []).length)
      .map((cat) => {
        // On the homepage show the 3 most recent per category; full library shows all.
        const limit = lib.dataset.full === 'true' ? Infinity : 3;
        const vids = groups[cat].slice(0, limit);
        return `
          <div class="video-cat">
            <h3>${cat}</h3>
            <div class="video-grid">${vids.map(videoCard).join('')}</div>
          </div>`;
      });

    if (!sections.length) {
      lib.innerHTML = '<p class="center empty-note">No messages have been published yet. Connect a YouTube channel in the admin to populate this section.</p>';
      return;
    }
    lib.innerHTML = sections.join('');

    // Click-to-play: swap thumbnail for an embedded player.
    $$('.thumb', lib).forEach((thumb) => {
      thumb.addEventListener('click', () => {
        const id = thumb.dataset.video;
        thumb.classList.add('playing');
        thumb.innerHTML = `<iframe src="https://www.youtube.com/embed/${id}?autoplay=1" title="Video player" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
      });
    });
  } catch {
    lib.innerHTML = '<p class="center empty-note">Could not load messages.</p>';
  }
}

// --- Prayer form ---
$('#prayerForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const { ok, body } = await postJSON('/api/prayer', {
    name: f.name.value,
    email: f.email.value,
    request: f.request.value,
    is_private: f.is_private.checked,
  });
  if (ok) { setMsg('prayerMsg', body.message); toast('Prayer request received 🙏'); f.reset(); }
  else { setMsg('prayerMsg', body.error || 'Something went wrong.', false); }
});

// --- Member form ---
$('#memberForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const { ok, body } = await postJSON('/api/members', {
    name: f.name.value, email: f.email.value, phone: f.phone.value,
  });
  if (ok) { setMsg('memberMsg', body.message); toast('Welcome to the family!'); f.reset(); }
  else { setMsg('memberMsg', body.error || 'Something went wrong.', false); }
});

// --- Contact form ---
$('#contactForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const { ok, body } = await postJSON('/api/contact', {
    name: f.name.value, email: f.email.value, message: f.message.value,
  });
  if (ok) { setMsg('contactMsg', body.message); toast('Message sent!'); f.reset(); }
  else { setMsg('contactMsg', body.error || 'Something went wrong.', false); }
});

// --- Giving ---
$$('#amountChips .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    $$('#amountChips .chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    const amt = $('#g-amount');
    if (amt) amt.value = chip.dataset.amount;
  });
});

$('#giveForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const { ok, status, body } = await postJSON('/api/donate', {
    amount: f.amount.value, name: f.name.value, email: f.email.value,
  });
  if (ok && body.url) {
    setMsg('giveMsg', 'Redirecting to secure checkout…');
    window.location.href = body.url;
  } else if (status === 503) {
    setMsg('giveMsg', body.error, false);
  } else {
    setMsg('giveMsg', body.error || 'Something went wrong.', false);
  }
});

// Show a note if returning from Stripe.
const params = new URLSearchParams(location.search);
if (params.get('giving') === 'success') toast('Thank you for your generous offering! 🙌');
if (params.get('giving') === 'cancelled') toast('Giving was cancelled.', true);

// --- Escape user/content strings before injecting into HTML ---
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// --- Init ---
loadEvents();
loadVideos();
