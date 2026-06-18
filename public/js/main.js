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
    revealInit();
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

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

async function loadVideos() {
  const lib = $('#videoLibrary');
  if (!lib) return;
  const isFull = lib.dataset.full === 'true';
  // A service tile may link here with ?category=... to show just that service.
  const wanted = new URLSearchParams(location.search).get('category');
  const activeCat = wanted && CATEGORY_ORDER.includes(wanted) ? wanted : null;

  try {
    const res = await fetch('/api/videos');
    const groups = await res.json();
    let order = CATEGORY_ORDER.filter((cat) => (groups[cat] || []).length);

    // Filtered view (sermons page reached from a service tile): only that service.
    if (activeCat) order = order.filter((cat) => cat === activeCat);

    const sections = order.map((cat) => {
      // Homepage shows the 3 most recent per category; full library shows all.
      const limit = isFull ? Infinity : 3;
      const vids = groups[cat].slice(0, limit);
      // On the homepage, the heading links to that service's full video list.
      const heading = isFull
        ? cat
        : `<a href="/sermons.html?category=${encodeURIComponent(cat)}">${cat}</a>`;
      return `
        <div class="video-cat reveal" id="cat-${slugify(cat)}">
          <h3>${heading}</h3>
          <div class="video-grid">${vids.map(videoCard).join('')}</div>
        </div>`;
    });

    // Banner when filtered to a single service.
    const banner = activeCat
      ? `<div class="filter-banner reveal">
           <strong>${activeCat}</strong>
           <a href="/sermons.html">&larr; View all services</a>
         </div>`
      : '';

    if (!sections.length) {
      lib.innerHTML = banner + '<p class="center empty-note">No messages in this service yet. Check back soon.</p>';
      revealInit();
      return;
    }
    lib.innerHTML = banner + sections.join('');

    // Click-to-play: swap thumbnail for an embedded player.
    $$('.thumb', lib).forEach((thumb) => {
      thumb.addEventListener('click', () => {
        const id = thumb.dataset.video;
        thumb.classList.add('playing');
        thumb.innerHTML = `<iframe src="https://www.youtube.com/embed/${id}?autoplay=1" title="Video player" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
      });
    });

    revealInit();
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

// --- Scroll-reveal animations (IntersectionObserver) ---
let revealObserver;
function revealInit() {
  if (!('IntersectionObserver' in window)) return;
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('visible'); revealObserver.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  }
  // Tag the things worth animating once, then observe any not yet seen.
  $$('.card, .split > *, .event, .video-cat, .filter-banner, .section > .container > .center')
    .forEach((el) => {
      if (!el.classList.contains('reveal')) el.classList.add('reveal');
      if (!el.dataset.revObserved) { el.dataset.revObserved = '1'; revealObserver.observe(el); }
    });
}

// --- Back-to-top button (injected so it works on every page) ---
function initBackToTop() {
  const btn = document.createElement('button');
  btn.className = 'to-top';
  btn.setAttribute('aria-label', 'Back to top');
  btn.innerHTML = '&uarr;';
  document.body.appendChild(btn);
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  const onScroll = () => {
    btn.classList.toggle('show', window.scrollY > 500);
    $('.site-header')?.classList.toggle('scrolled', window.scrollY > 10);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// --- Init ---
initBackToTop();
revealInit();
loadEvents();
loadVideos();
