// The Prophetic Prayer Army — frontend behaviour.

// Always start at the top on reload; smooth-scroll anchor links without adding hash to the URL
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const href = a.getAttribute('href');
  e.preventDefault();
  if (href === '#' || href === '#top') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
});

// --- Helpers ---
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// --- Four Altars: auto-rotate the highlight, one at a time every 5s ---
(function rotateAltars() {
  const altars = $$('.altars .altar');
  if (altars.length < 2) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let i = 0, timer = null;
  const show = (n) => altars.forEach((a, k) => a.classList.toggle('is-active', k === n));
  const start = () => { if (!timer) timer = setInterval(() => { i = (i + 1) % altars.length; show(i); }, 5000); };
  const stop = () => { clearInterval(timer); timer = null; };
  show(0);
  start();
  // Let a hovering/focusing visitor take over; resume the cycle when they leave.
  const wrap = $('.altars');
  ['mouseenter', 'focusin'].forEach((e) => wrap.addEventListener(e, () => { stop(); altars.forEach((a) => a.classList.remove('is-active')); }));
  ['mouseleave', 'focusout'].forEach((e) => wrap.addEventListener(e, () => { show(i); start(); }));
  // Pause when the tab is hidden to avoid a jump on return.
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
})();

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

// --- Events (live schedule: timezones, countdown, status, join popup) ---
let siteLinks = { youtube: '', instagram: '', facebook: '', whatsapp: '' };

const EVENT_TZS = [
  { label: 'EST', zone: 'America/New_York' },
  { label: 'PST', zone: 'America/Los_Angeles' },
  { label: 'GMT', zone: 'UTC' },
];
function tzTimes(iso) {
  return EVENT_TZS
    .map((t) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: t.zone }) + ' ' + t.label)
    .join(' · ');
}
function etDateLabel(iso) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
}
function etBadge(iso) {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'America/New_York' }),
    mon: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'America/New_York' }).toUpperCase(),
  };
}
function fmtCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = [];
  if (d) p.push(d + 'd');
  p.push(String(h).padStart(2, '0') + 'h', String(m).padStart(2, '0') + 'm', String(sec).padStart(2, '0') + 's');
  return p.join(' ');
}

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
      const b = etBadge(e.start);
      const calSingle = e.recurring
        ? `/api/calendar.ics?key=${e.key}&mode=single&start=${encodeURIComponent(e.start)}`
        : `/api/calendar.ics?dbid=${(e.id || '').replace('db-', '')}`;
      const calSeries = e.recurring ? `/api/calendar.ics?key=${e.key}` : '';
      return `
        <article class="event ${e.cancelled ? 'cancelled-card' : ''}"
                 data-start="${new Date(e.start).getTime()}"
                 data-end="${new Date(e.end).getTime()}"
                 data-remove="${new Date(e.removeAt).getTime()}"
                 data-cancelled="${e.cancelled ? 1 : 0}"
                 data-live-link="${escapeHtml(e.liveLink || '')}">
          <div class="date"><div class="d">${b.day}</div><div class="m">${b.mon}</div></div>
          <div class="event-body">
            <div class="event-head">
              <h3>${escapeHtml(e.title)}</h3>
              <span class="event-status" data-status></span>
            </div>
            <div class="meta">${etDateLabel(e.start)}</div>
            <div class="event-tz">${tzTimes(e.start)}${e.location ? ' &middot; ' + escapeHtml(e.location) : ''}</div>
            ${e.description ? `<p class="event-desc">${escapeHtml(e.description)}</p>` : ''}
            <div class="event-foot">
              <span class="event-countdown" data-countdown></span>
              <div class="event-cal">
                <button type="button" class="btn btn--sm btn--ghost cal-btn" data-cal>Add to Calendar &#9662;</button>
                <div class="cal-menu" hidden>
                  <a href="${calSingle}" download="prophetic-prayer-army.ics">&#128197;&nbsp; This event only</a>
                  ${calSeries ? `<a href="${calSeries}" download="prophetic-prayer-army.ics">&#128260;&nbsp; Add the whole series</a>` : ''}
                </div>
              </div>
              <button class="btn btn--sm join-event-btn" data-join hidden>Join the Event</button>
            </div>
          </div>
        </article>`;
    }).join('');
    $$('#eventList [data-join]').forEach((btn) => btn.addEventListener('click', () => {
      const liveLink = btn.closest('.event')?.dataset.liveLink || '';
      openJoinModal(liveLink);
    }));
    $$('#eventList [data-cal]').forEach((btn) => btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const menu = btn.nextElementSibling;
      const wasOpen = !menu.hidden;
      $$('#eventList .cal-menu').forEach((m) => { m.hidden = true; });
      menu.hidden = wasOpen;
    }));
    tickEvents();
    revealInit();
  } catch {
    list.innerHTML = '<p class="center empty-note">Could not load events.</p>';
  }
}

// Update each event's status/countdown every second; "Join" shows only while live.
function tickEvents() {
  const list = $('#eventList');
  if (!list) return;
  const now = Date.now();
  let expired = false;
  $$('.event', list).forEach((el) => {
    if (!el.dataset.start) return;
    const start = +el.dataset.start, end = +el.dataset.end, remove = +el.dataset.remove;
    const cancelled = el.dataset.cancelled === '1';
    const statusEl = $('[data-status]', el), cdEl = $('[data-countdown]', el), joinBtn = $('[data-join]', el);
    if (now >= remove) expired = true;
    let cls, text, cd = '';
    if (cancelled) { cls = 'cancelled'; text = 'Cancelled'; }
    else if (now < start) { cls = 'upcoming'; text = 'Upcoming'; cd = 'Starts in ' + fmtCountdown(start - now); }
    else if (now < end) { cls = 'ongoing'; text = 'Ongoing now'; cd = 'Live now · ends in ' + fmtCountdown(end - now); }
    else { cls = 'ended'; text = 'Ended'; }
    if (statusEl) { statusEl.className = 'event-status ' + cls; statusEl.textContent = text; }
    if (cdEl) cdEl.textContent = cd;

    // "Join the Event" is clickable only from 30 min before start until the
    // event's day ends; before that it's shown greyed-out and disabled.
    const JOIN_LEAD = 30 * 60 * 1000;
    if (joinBtn) {
      if (cancelled) {
        joinBtn.hidden = true;
      } else if (now >= start - JOIN_LEAD && now < remove) {
        joinBtn.hidden = false;
        joinBtn.disabled = false;
        joinBtn.classList.remove('is-disabled');
        joinBtn.title = '';
      } else if (now < start - JOIN_LEAD) {
        joinBtn.hidden = false;
        joinBtn.disabled = true;
        joinBtn.classList.add('is-disabled');
        joinBtn.title = 'Opens 30 minutes before the service starts';
      } else {
        joinBtn.hidden = true;
      }
    }
  });
  if (expired) loadEvents(); // an occurrence rolled past its day → pull the next one
}

// Join-the-Event popup (built once, reused).
// liveLink: direct URL to this week's stream (set by admin per-service); falls
// back to the general social links if not set.
function openJoinModal(liveLink) {
  let modal = $('#joinModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'joinModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="Join the live service">
        <button class="modal-close" type="button" aria-label="Close">&times;</button>
        <h3>We're live — join us!</h3>
        <p class="modal-note">Tap a platform to join the service in progress:</p>
        <div class="join-links"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
    $('.modal-close', modal).addEventListener('click', () => modal.classList.remove('open'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.classList.remove('open'); });
  }
  const platforms = [
    { k: 'youtube', label: 'YouTube', cls: 'social-youtube' },
    { k: 'instagram', label: 'Instagram', cls: 'social-instagram' },
    { k: 'facebook', label: 'Facebook', cls: 'social-facebook' },
  ];
  const socialHtml = platforms
    .filter((p) => siteLinks[p.k])
    .map((p) => `<a class="join-link ${p.cls}" href="${siteLinks[p.k]}" target="_blank" rel="noopener noreferrer">${p.label}</a>`)
    .join('');
  if (liveLink) {
    $('.join-links', modal).innerHTML =
      `<a class="join-link join-live-primary" href="${liveLink}" target="_blank" rel="noopener noreferrer">Join Live &rarr;</a>` +
      (socialHtml ? `<p class="join-or">or connect via:</p>${socialHtml}` : '');
  } else {
    $('.join-links', modal).innerHTML = socialHtml;
  }
  modal.classList.add('open');
}

// Fetch the editable links and apply them to the social icons + join popup.
async function loadLinks() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.links) siteLinks = data.links;
  } catch { /* keep defaults */ }
  const map = {
    'social-youtube': siteLinks.youtube,
    'social-facebook': siteLinks.facebook,
    'social-instagram': siteLinks.instagram,
    'social-whatsapp': siteLinks.whatsapp,
  };
  for (const [cls, url] of Object.entries(map)) {
    if (url) $$('a.' + cls).forEach((a) => { a.href = url; });
  }
}

// --- Videos ---
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

  try {
    const res = await fetch('/api/videos');
    const groups = await res.json();
    const activeCat = wanted && groups[wanted] ? wanted : null;
    // Categories come pre-ordered from the backend; "Uncategorized" is an
    // internal pending-review bucket and never shown publicly.
    let order = Object.keys(groups).filter((cat) => cat !== 'Uncategorized' && groups[cat].length);

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
// Show the "pay by debit/credit card" option only once Flutterwave is configured.
fetch('/api/giving/status').then((r) => r.json()).then((body) => {
  if (!body?.configured) return;
  $('#cardOr')?.classList.remove('hidden');
  $('#cardBtn')?.classList.remove('hidden');
}).catch(() => {});

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

// --- PayPal giving: redirect to paypal.me with the entered amount ---
const PAYPAL_ME = 'https://www.paypal.me/AgyaAcheampong';
$('#paypalBtn')?.addEventListener('click', () => {
  const amt = parseFloat($('#g-amount')?.value);
  const valid = Number.isFinite(amt) && amt >= 1;
  const url = valid ? `${PAYPAL_ME}/${Math.round(amt * 100) / 100}USD` : PAYPAL_ME;
  // Log the gift intent for the admin (fire-and-forget — never blocks the redirect).
  if (valid) {
    const f = $('#giveForm');
    fetch('/api/donate/paypal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amt, name: f?.name.value, email: f?.email.value }),
      keepalive: true,
    }).catch(() => {});
  }
  setMsg('giveMsg', 'Opening PayPal in a new tab — thank you for your gift! 🙌');
  window.open(url, '_blank', 'noopener');
});

// --- Zelle giving: open Zelle payment page ---
const ZELLE_URL = 'https://enroll.zellepay.com/qr-codes?data=ewogICAgIm5hbWUiOiAiUk9TRSIsCiAgICAiYWN0aW9uIjogInBheW1lbnQiLAogICAgInRva2VuIjogIjE1NjcyOTA5ODczIgp9';
$('#zelleBtn')?.addEventListener('click', () => {
  window.open(ZELLE_URL, '_blank', 'noopener,noreferrer');
});
$('#zelleCopyBtn')?.addEventListener('click', () => {
  navigator.clipboard.writeText('+15672909873').then(() => {
    const btn = $('#zelleCopyBtn');
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
    btn.style.color = '#00a826';
    setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 2000);
  });
});

// --- MTN Mobile Money (MoMo): reveal the name/number card ---
$('#momoBtn')?.addEventListener('click', () => {
  $('#momoCard')?.classList.toggle('hidden');
});
$('#momoCopyBtn')?.addEventListener('click', () => {
  navigator.clipboard.writeText('+233552937788').then(() => {
    const btn = $('#momoCopyBtn');
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!';
    btn.style.background = '#2e8b00';
    setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; }, 2000);
  });
});

// --- Cash App giving: open $RoseMaKo ---
const CASHAPP_TAG = '$RoseMaKo';
$('#cashappBtn')?.addEventListener('click', () => {
  const amt = parseFloat($('#g-amount')?.value);
  const valid = Number.isFinite(amt) && amt >= 1;
  const url = `https://cash.app/${CASHAPP_TAG}${valid ? `/${Math.round(amt * 100) / 100}` : ''}`;
  if (valid) {
    const f = $('#giveForm');
    fetch('/api/donate/paypal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amt, name: f?.name.value, email: f?.email.value, method: 'cashapp' }),
      keepalive: true,
    }).catch(() => {});
  }
  setMsg('giveMsg', 'Opening Cash App in a new tab — thank you for your gift!');
  window.open(url, '_blank', 'noopener');
});

// Show a note if returning from Flutterwave checkout.
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

// --- Giving carousel / slideshow ---
function initCarousel() {
  const carousel = $('#giveCarousel');
  if (!carousel) return;
  const slides = $$('.slide', carousel);
  const dotsWrap = $('#giveDots');
  if (slides.length < 2) return;

  let index = 0;
  let timer;
  const INTERVAL = 5000; // 5 seconds per slide

  // Build a dot for each slide.
  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
    dot.type = 'button';
    dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
    dot.addEventListener('click', () => { go(i); restart(); });
    dotsWrap?.appendChild(dot);
  });
  const dots = dotsWrap ? $$('.carousel-dot', dotsWrap) : [];

  function go(n) {
    slides[index].classList.remove('active');
    dots[index]?.classList.remove('active');
    index = (n + slides.length) % slides.length;
    slides[index].classList.add('active');
    dots[index]?.classList.add('active');
  }
  const next = () => go(index + 1);
  const prev = () => go(index - 1);
  function start() { timer = setInterval(next, INTERVAL); }
  function restart() { clearInterval(timer); start(); }

  $('.carousel-arrow.next', carousel)?.addEventListener('click', () => { next(); restart(); });
  $('.carousel-arrow.prev', carousel)?.addEventListener('click', () => { prev(); restart(); });
  // Pause while the visitor is hovering or focusing the carousel.
  carousel.addEventListener('mouseenter', () => clearInterval(timer));
  carousel.addEventListener('mouseleave', start);
  carousel.addEventListener('focusin', () => clearInterval(timer));
  carousel.addEventListener('focusout', start);

  start();
}

// Calendar subscribe link (webcal:// keeps the calendar auto-updating).
const calSub = $('#calSubscribe');
if (calSub) calSub.href = 'webcal://' + location.host + '/api/calendar.ics';
// Close any open per-event calendar menus when clicking elsewhere.
document.addEventListener('click', () => $$('.cal-menu').forEach((m) => { m.hidden = true; }));

// WhatsApp picker — single icon, popup selects Community or Channel.
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('.wa-trigger');
  $$('.wa-picker').forEach((p) => {
    if (p.querySelector('.wa-trigger') !== trigger) {
      p.classList.remove('open');
      p.querySelector('.wa-trigger').setAttribute('aria-expanded', 'false');
    }
  });
  if (trigger) {
    const picker = trigger.closest('.wa-picker');
    const isOpen = picker.classList.toggle('open');
    trigger.setAttribute('aria-expanded', String(isOpen));
  }
});

// --- Init ---
initCarousel();
initBackToTop();
revealInit();
loadLinks().then(loadEvents);
setInterval(tickEvents, 1000);          // live countdown / status
setInterval(loadEvents, 60000);         // roll occurrences + reflect admin changes
loadVideos();
