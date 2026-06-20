// Admin dashboard logic.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const CATEGORIES = [
  'Wednesday Miracle Service',
  'Saturday Prayer Service',
  'Three Day Fasting & Prayer',
  'Uncategorized',
];

function esc(str = '') {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function when(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? (iso || '') : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

// --- Auth flow ---
async function checkAuth() {
  const { body } = await api('/api/admin/me');
  if (body.authenticated) showDash();
  else showLogin();
}
function showLogin() { $('#loginView').classList.remove('hidden'); $('#dashView').classList.add('hidden'); }
function showDash() { $('#loginView').classList.add('hidden'); $('#dashView').classList.remove('hidden'); loadAll(); }

$('#loginBtn').addEventListener('click', login);
$('#pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
async function login() {
  const { ok, body } = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#pw').value }) });
  if (ok) { $('#pw').value = ''; showDash(); }
  else $('#loginMsg').textContent = body.error || 'Login failed.';
}
$('#logoutBtn').addEventListener('click', async () => { await api('/api/admin/logout', { method: 'POST' }); showLogin(); });

// --- Tabs ---
$$('.tab').forEach((tab) => tab.addEventListener('click', () => {
  $$('.tab').forEach((t) => t.classList.remove('active'));
  tab.classList.add('active');
  const name = tab.dataset.tab;
  $$('.tabpane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== name));
}));

// --- Loaders ---
function loadAll() {
  loadPrayer(); loadServices(); loadLinksAdmin(); loadEvents(); loadVideos();
  loadMembers(); loadContacts(); loadDonations();
}

function etFull(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/New_York',
  }) + ' ET';
}

async function loadServices() {
  const wrap = $('#servicesWrap');
  if (!wrap) return;
  const { body } = await api('/api/admin/services');
  wrap.innerHTML = (body || []).map((s) => `
    <div class="card" style="margin:0;background:#fbfdfa;">
      <div class="flex" style="justify-content:space-between;align-items:baseline;">
        <strong>${esc(s.title)}</strong>
        <span class="muted">Next: ${etFull(s.nextStart)} ${s.cancelled ? '· <span class="pill cancelled" style="background:#f6d6d2;color:#9b2620">cancelled</span>' : ''}</span>
      </div>
      <div style="margin-top:10px"><label>Title</label><input data-svc="${s.key}" data-f="title" value="${esc(s.title)}" /></div>
      <div class="row" style="margin-top:10px">
        <div><label>Time (ET)</label><input type="time" data-svc="${s.key}" data-f="time" value="${esc(s.time)}" /></div>
        <div><label>Duration (hours)</label><input type="number" min="0.5" step="0.5" data-svc="${s.key}" data-f="durationHours" value="${esc(String(s.durationHours))}" /></div>
      </div>
      <div class="row" style="margin-top:10px">
        <div><label>Location</label><input data-svc="${s.key}" data-f="location" value="${esc(s.location || '')}" /></div>
        <div><label>Description</label><input data-svc="${s.key}" data-f="description" value="${esc(s.description || '')}" /></div>
      </div>
      <div class="flex" style="margin-top:12px">
        <button class="btn small" data-save="${s.key}">Save changes</button>
        <button class="btn small ${s.cancelled ? 'secondary' : 'danger'}"
                data-cancel="${s.key}" data-start="${esc(s.nextStart || '')}" data-cancelled="${s.cancelled ? 1 : 0}">
          ${s.cancelled ? 'Restore this occurrence' : 'Cancel next occurrence'}
        </button>
      </div>
    </div>`).join('') || '<p class="muted">No services.</p>';

  $$('[data-save]', wrap).forEach((btn) => btn.addEventListener('click', async () => {
    const key = btn.dataset.save;
    const payload = {};
    $$(`[data-svc="${key}"]`, wrap).forEach((inp) => { payload[inp.dataset.f] = inp.value; });
    const { ok, body: r } = await api(`/api/admin/services/${key}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (ok) loadServices(); else alert(r.error || 'Could not save.');
  }));

  $$('[data-cancel]', wrap).forEach((btn) => btn.addEventListener('click', async () => {
    const cancelled = btn.dataset.cancelled !== '1'; // toggle
    await api('/api/admin/recurring/cancel', {
      method: 'POST',
      body: JSON.stringify({ key: btn.dataset.cancel, start: btn.dataset.start, cancelled }),
    });
    loadServices();
  }));
}

async function loadLinksAdmin() {
  if (!$('#lnk-youtube')) return;
  const { body } = await api('/api/admin/settings');
  $('#lnk-youtube').value = body.youtube || '';
  $('#lnk-instagram').value = body.instagram || '';
  $('#lnk-facebook').value = body.facebook || '';
  $('#lnk-whatsapp').value = body.whatsapp || '';
}

$('#saveLinks')?.addEventListener('click', async () => {
  const payload = {
    youtube: $('#lnk-youtube').value,
    instagram: $('#lnk-instagram').value,
    facebook: $('#lnk-facebook').value,
    whatsapp: $('#lnk-whatsapp').value,
  };
  const { ok } = await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
  $('#linksMsg').textContent = ok ? 'Saved ✓' : 'Could not save.';
  setTimeout(() => { const m = $('#linksMsg'); if (m) m.textContent = ''; }, 2500);
});

async function loadPrayer() {
  const { body } = await api('/api/admin/prayer');
  $('#prayerRows').innerHTML = (body || []).map((r) => {
    const opts = ['open', 'praying', 'answered'].map((s) =>
      `<option value="${s}" ${s === r.status ? 'selected' : ''}>${s}</option>`).join('');
    return `<tr>
      <td class="muted">${when(r.created_at)}</td>
      <td>${esc(r.name || 'Anonymous')}${r.email ? `<br><span class="muted">${esc(r.email)}</span>` : ''}${r.is_private ? '<br><span class="pill open">private</span>' : ''}</td>
      <td>${esc(r.request)}</td>
      <td><span class="pill ${r.status}">${r.status}</span><br>
        <select class="small" data-prayer="${r.id}" style="margin-top:6px;width:auto;">${opts}</select></td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" class="muted">No prayer requests yet.</td></tr>';

  $$('[data-prayer]').forEach((sel) => sel.addEventListener('change', async () => {
    await api(`/api/admin/prayer/${sel.dataset.prayer}`, { method: 'PATCH', body: JSON.stringify({ status: sel.value }) });
    loadPrayer();
  }));
}

async function loadEvents() {
  const { body } = await api('/api/admin/events');
  $('#eventRows').innerHTML = (body || []).map((e) => `
    <tr>
      <td class="muted">${when(e.starts_at)}</td>
      <td>${esc(e.title)}${e.description ? `<br><span class="muted">${esc(e.description)}</span>` : ''}</td>
      <td>${esc(e.location || '')}</td>
      <td class="flex">
        <button class="btn small secondary" data-edit='${esc(JSON.stringify(e))}'>Edit</button>
        <button class="btn small danger" data-del="${e.id}">Delete</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="4" class="muted">No events yet.</td></tr>';

  $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this event?')) return;
    await api(`/api/admin/events/${b.dataset.del}`, { method: 'DELETE' });
    loadEvents();
  }));
  $$('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    const e = JSON.parse(b.dataset.edit);
    $('#ev-id').value = e.id;
    $('#ev-title').value = e.title;
    $('#ev-when').value = (e.starts_at || '').slice(0, 16);
    $('#ev-loc').value = e.location || '';
    $('#ev-desc').value = e.description || '';
    $('#eventFormTitle').textContent = 'Edit Event';
    $('#ev-cancel').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
}

$('#eventForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#ev-id').value;
  const payload = {
    title: $('#ev-title').value,
    starts_at: $('#ev-when').value,
    location: $('#ev-loc').value,
    description: $('#ev-desc').value,
  };
  const url = id ? `/api/admin/events/${id}` : '/api/admin/events';
  const method = id ? 'PUT' : 'POST';
  const { ok, body } = await api(url, { method, body: JSON.stringify(payload) });
  if (ok) { resetEventForm(); loadEvents(); }
  else alert(body.error || 'Could not save event.');
});
$('#ev-cancel').addEventListener('click', resetEventForm);
function resetEventForm() {
  $('#eventForm').reset(); $('#ev-id').value = '';
  $('#eventFormTitle').textContent = 'Add Event';
  $('#ev-cancel').classList.add('hidden');
}

async function loadVideos() {
  const { body } = await api('/api/admin/videos');
  $('#videoRows').innerHTML = (body || []).map((v) => {
    const current = v.category_override || '';
    const opts = ['<option value="">(auto)</option>']
      .concat(CATEGORIES.map((c) => `<option value="${esc(c)}" ${c === current ? 'selected' : ''}>${esc(c)}</option>`))
      .join('');
    return `<tr>
      <td class="muted">${when(v.published_at)}</td>
      <td><a href="https://youtu.be/${v.video_id}" target="_blank" rel="noopener">${esc(v.title)}</a></td>
      <td class="muted">${esc(v.auto_category || '')}</td>
      <td><select data-video="${v.video_id}" style="width:auto;">${opts}</select></td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" class="muted">No videos imported yet. Set YT_CHANNEL_ID in .env and click "Refresh from YouTube".</td></tr>';

  $$('[data-video]').forEach((sel) => sel.addEventListener('change', async () => {
    await api(`/api/admin/videos/${sel.dataset.video}/category`, { method: 'PATCH', body: JSON.stringify({ category: sel.value }) });
    loadVideos();
  }));
}

$('#refreshVideos').addEventListener('click', async () => {
  $('#videoNote').innerHTML = '<p class="note">Refreshing…</p>';
  const { ok, body } = await api('/api/admin/videos/refresh', { method: 'POST' });
  $('#videoNote').innerHTML = `<p class="note">${esc(body.message || (ok ? 'Done.' : 'Refresh failed.'))}</p>`;
  loadVideos();
});

async function loadMembers() {
  const { body } = await api('/api/admin/members');
  $('#memberRows').innerHTML = (body || []).map((m) => `
    <tr><td class="muted">${when(m.created_at)}</td><td>${esc(m.name)}</td><td>${esc(m.email)}</td><td>${esc(m.phone || '')}</td></tr>`)
    .join('') || '<tr><td colspan="4" class="muted">No members yet.</td></tr>';
}
async function loadContacts() {
  const { body } = await api('/api/admin/contacts');
  $('#contactRows').innerHTML = (body || []).map((c) => `
    <tr><td class="muted">${when(c.created_at)}</td><td>${esc(c.name)}</td><td>${esc(c.email)}</td><td>${esc(c.message)}</td></tr>`)
    .join('') || '<tr><td colspan="4" class="muted">No messages yet.</td></tr>';
}
async function loadDonations() {
  const { body } = await api('/api/admin/donations');
  $('#donationRows').innerHTML = (body || []).map((d) => `
    <tr><td class="muted">${when(d.created_at)}</td><td>$${(d.amount_cents / 100).toFixed(2)}</td>
    <td><span class="pill ${d.method === 'paypal' ? 'praying' : 'open'}">${esc(d.method || 'card')}</span></td>
    <td>${esc(d.donor_name || 'Anonymous')}${d.donor_email ? `<br><span class="muted">${esc(d.donor_email)}</span>` : ''}</td>
    <td><span class="pill ${d.status === 'completed' ? 'answered' : 'open'}">${esc(d.status)}</span></td></tr>`)
    .join('') || '<tr><td colspan="5" class="muted">No giving records yet.</td></tr>';
}

// --- Boot ---
checkAuth();
