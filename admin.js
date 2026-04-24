const SUPABASE_URL = "https://dugzytiyhyafdrhisjqg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_nQN9DQBb7nwR1A6iYH52pQ_jCROHCGS";

const supabase = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

const ADMIN_TABLE = 'admin_users';
const ADMIN_INVITES_TABLE = 'admin_invites';
const REPORTS_TABLE = 'reports';

function showAdminAuth(defaultView = 'viewLogin') {
  const authShell = document.getElementById('adminAuthShell');
  const appShell = document.getElementById('adminAppShell');
  if (authShell) authShell.classList.remove('admin-app-hidden');
  if (appShell) appShell.classList.add('admin-app-hidden');
  if (document.getElementById(defaultView)) {
    showView(defaultView);
  }
}

function showAdminApp() {
  const authShell = document.getElementById('adminAuthShell');
  const appShell = document.getElementById('adminAppShell');
  if (authShell) authShell.classList.add('admin-app-hidden');
  if (appShell) appShell.classList.remove('admin-app-hidden');
}

async function getCurrentAdminSession() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session || null;
}

async function getCurrentAdminProfile() {
  const session = await getCurrentAdminSession();
  if (!session?.user) return null;

  const { data, error } = await supabase
    .from(ADMIN_TABLE)
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function requireAdminSession() {
  const session = await getCurrentAdminSession();
  if (!session?.user) {
    showAdminAuth('viewLogin');
    return null;
  }

  const profile = await getCurrentAdminProfile();
  if (!profile?.is_active) {
    await supabase.auth.signOut();
    showAdminAuth('viewLogin');
    return null;
  }

  showAdminApp();
  return { session, profile };
}


/* ═══════════════════════════════════════════════════════
   AKSYON! — Auth Module (admin.html)
   Handles: login, forgot password, password reset via Supabase
═══════════════════════════════════════════════════════ */

// ── VIEW MANAGER ─────────────────────────────────────
function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  clearAlerts();
  clearErrors();
}

function clearAlerts() {
  document.querySelectorAll('.alert').forEach(a => a.classList.remove('show'));
}

function clearErrors() {
  document.querySelectorAll('.field-error').forEach(e => e.classList.remove('show'));
  document.querySelectorAll('.form-input').forEach(i => i.classList.remove('input-error'));
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

// ── UI HELPERS ───────────────────────────────────────
function setLoading(btnId, isLoading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.classList.toggle('loading', isLoading);
}

function showAlert(alertId, msgId, message) {
  const el = document.getElementById(alertId);
  const msg = document.getElementById(msgId);
  if (el && msg) {
    msg.textContent = message;
    el.classList.add('show');
  }
}

function showFieldError(errorId, inputEl) {
  const el = document.getElementById(errorId);
  if (el) el.classList.add('show');
  if (inputEl) inputEl.classList.add('input-error');
}

function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  btn.textContent = isHidden ? '🙈' : '👁';
}

// ── PASSWORD STRENGTH ────────────────────────────────
function checkStrength(val) {
  const bars  = [document.getElementById('bar1'), document.getElementById('bar2'), document.getElementById('bar3')];
  const label = document.getElementById('pwLabel');

  const hasLength  = val.length >= 8;
  const hasMixed   = /[a-z]/.test(val) && /[A-Z]/.test(val);
  const hasSpecial = /[^a-zA-Z0-9]/.test(val) || /\d/.test(val);

  const score = [hasLength, hasMixed, hasSpecial].filter(Boolean).length;

  const levels = ['', 'weak', 'fair', 'strong'];
  const labels = ['', 'Weak', 'Fair', 'Strong'];

  bars.forEach((bar, i) => {
    bar.className = 'pw-bar';
    if (i < score) bar.classList.add('filled', levels[score]);
  });

  label.textContent   = val.length ? labels[score] : '';
  label.style.color   = score === 1 ? '#ef4444' : score === 2 ? '#f59e0b' : score === 3 ? '#22c55e' : 'var(--gray-400)';
}

// ── LOGIN ────────────────────────────────────────────
async function handleLogin() {
  clearAlerts();
  clearErrors();

  const emailEl = document.getElementById('emailInput');
  const pwEl    = document.getElementById('passwordInput');
  const email   = normalizeEmail(emailEl.value);
  const pw      = pwEl.value;

  let valid = true;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFieldError('emailError', emailEl);
    valid = false;
  }
  if (!pw) {
    showFieldError('passwordError', pwEl);
    valid = false;
  }
  if (!valid) return;

  setLoading('loginBtn', true);

  try {
    // ── Supabase Auth ──
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });

    if (error) {
      const msg = error.message.includes('Invalid') || error.message.includes('credentials')
        ? 'Invalid email or password. Please try again.'
        : error.message;
      showAlert('loginAlert', 'loginAlertMsg', msg);
      return;
    }

    // Check that this user is an admin
    const { data: adminRecord, error: adminErr } = await supabase
      .from('admin_users')
      .select('id, role, is_active')
      .eq('user_id', data.user.id)
      .single();

    if (adminErr || !adminRecord?.is_active) {
      await supabase.auth.signOut();
      showAlert('loginAlert', 'loginAlertMsg',
        'This account does not have administrator access. Contact the system administrator.');
      return;
    }

    // Success → go to dashboard
    window.location.href = 'admin.html';

  } catch (err) {
    showAlert('loginAlert', 'loginAlertMsg',
      'Unable to connect to the server. Please try again.');
    console.error('[AKSYON] Login error:', err);
  } finally {
    setLoading('loginBtn', false);
  }
}

// ── FORGOT PASSWORD ───────────────────────────────────
async function handleForgot() {
  clearAlerts();
  clearErrors();

  const emailEl = document.getElementById('forgotEmail');
  const email   = normalizeEmail(emailEl.value);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFieldError('forgotEmailError', emailEl);
    return;
  }

  setLoading('resetBtn', true);

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // This URL should point to your login page; Supabase appends the token
      redirectTo: window.location.origin + window.location.pathname.replace(/[^/]+$/, 'admin.html'),
    });

    if (error) {
      showAlert('forgotAlert', 'forgotAlertMsg', error.message);
      return;
    }

    // Show success regardless (security best practice — don't reveal if email exists)
    document.getElementById('sentToEmail').textContent = email;
    showView('viewResetSent');

  } catch (err) {
    showAlert('forgotAlert', 'forgotAlertMsg', 'Something went wrong. Please try again.');
    console.error('[AKSYON] Password reset error:', err);
  } finally {
    setLoading('resetBtn', false);
  }
}

// ── NEW PASSWORD (after clicking email link) ──────────
async function handleNewPassword() {
  clearAlerts();
  clearErrors();

  const newPwEl     = document.getElementById('newPwInput');
  const confirmPwEl = document.getElementById('confirmPwInput');
  const newPw       = newPwEl.value;
  const confirmPw   = confirmPwEl.value;

  if (newPw.length < 8) {
    showAlert('newPwAlert', 'newPwAlertMsg', 'Password must be at least 8 characters.');
    return;
  }
  if (newPw !== confirmPw) {
    showFieldError('confirmPwError', confirmPwEl);
    return;
  }

  setLoading('newPwBtn', true);

  try {
    const { error } = await supabase.auth.updateUser({ password: newPw });

    if (error) {
      showAlert('newPwAlert', 'newPwAlertMsg', error.message);
      return;
    }

    // Success → go to dashboard
    showToastLogin('✅ Password updated! Redirecting…', 'success');
    setTimeout(() => window.location.href = 'admin.html', 1500);

  } catch (err) {
    showAlert('newPwAlert', 'newPwAlertMsg', 'Something went wrong. Please try again.');
    console.error('[AKSYON] Update password error:', err);
  } finally {
    setLoading('newPwBtn', false);
  }
}

// Mini toast just for the login page
function showToastLogin(message, type = 'info') {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:999;
    background:#1e2535; color:#fff; padding:12px 18px;
    border-radius:10px; font-size:13px; font-weight:500;
    box-shadow:0 4px 20px rgba(0,0,0,.2);
    border-left:3px solid ${type === 'success' ? '#4ade80' : '#60a5fa'};
    animation:slideInToast .3s ease;
    font-family:'DM Sans',sans-serif;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ── CHECK IF WE HAVE A RESET TOKEN IN URL ────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Supabase puts the access_token / type=recovery in the URL hash
  const hash   = window.location.hash;
  const params = new URLSearchParams(hash.replace('#', '?'));

  if (params.get('type') === 'recovery') {
    showView('viewNewPassword');
    return;
  }

  // If already logged in, bounce to dashboard
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      try {
        const { data: adminRecord } = await supabase
          .from('admin_users')
          .select('id, is_active')
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (adminRecord?.is_active) showAdminApp();
      } catch (_) {}
    } else {
      showAdminAuth('viewLogin');
    }
  } catch (_) {
    // ignore — supabase might not be configured yet
  }
});

async function handleRegisterAdmin() {
  clearAlerts();
  clearErrors();

  const nameEl = document.getElementById('registerName');
  const emailEl = document.getElementById('registerEmail');
  const inviteEl = document.getElementById('registerInviteCode');
  const pwEl = document.getElementById('registerPassword');

  const fullName = nameEl.value.trim();
  const email = normalizeEmail(emailEl.value);
  const inviteCode = inviteEl.value.trim();
  const password = pwEl.value;

  if (!fullName || !email || !inviteCode || password.length < 8) {
    showAlert('registerAlert', 'registerAlertMsg',
      'Complete all fields, and use a password with at least 8 characters.');
    return;
  }

  setLoading('registerBtn', true);

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          account_type: 'admin',
        },
      },
    });

    if (error) throw error;

    if (!data.session) {
      showAlert('registerAlert', 'registerAlertMsg',
        'Registration created, but no session was returned. In Supabase Auth, disable email confirmation or confirm the email first, then log in.');
      return;
    }

    const { error: inviteError } = await supabase.rpc('consume_admin_invite', {
      invite_code_input: inviteCode,
      admin_full_name: fullName,
    });

    if (inviteError) {
      await supabase.auth.signOut();
      showAlert('registerAlert', 'registerAlertMsg',
        inviteError.message || 'Invalid or expired admin invitation code.');
      return;
    }

    showToastLogin('Admin account created. Redirecting to dashboard...', 'success');
    setTimeout(() => window.location.href = 'admin.html', 1200);
  } catch (err) {
    showAlert('registerAlert', 'registerAlertMsg',
      err.message || 'Unable to register this admin account right now.');
    console.error('[AKSYON] Admin registration error:', err);
  } finally {
    setLoading('registerBtn', false);
  }
}

// ── ENTER KEY SUPPORT ────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const active = document.querySelector('.view.active')?.id;
  if (active === 'viewLogin')       handleLogin();
  else if (active === 'viewForgot') handleForgot();
  else if (active === 'viewNewPassword') handleNewPassword();
  else if (active === 'viewRegister') handleRegisterAdmin();
});


/* ═══════════════════════════════════════════════════════
   AKSYON! — Admin Dashboard · admin.js
   Supabase-connected: realtime incidents, auth guard,
   users, barangays, settings
═══════════════════════════════════════════════════════ */

// ── STATE ──────────────────────────────────────────
let currentFilter  = 'all';
let currentSort    = 'newest';
let currentSearch  = '';
let selectedId     = null;
let modalCallback  = null;
let incidents      = [];      // Live from Supabase (or demo data)
let currentAdmin   = null;
let realtimeChannel = null;

// ── INIT ───────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await initAdmin();
});

async function initAdmin() {
  try {
    const adminState = await requireAdminSession();
    if (!adminState) return;

    currentAdmin = adminState.session.user;
    await loadAdminProfile();

    // 2. Load data + subscribe realtime
    await loadIncidents();
    subscribeRealtime();

    // Render
    updateStats();
    renderIncidents();

  } catch (err) {
    console.warn('[AKSYON] Supabase not configured – using demo data.');
    showAdminAuth('viewLogin');
    incidents = DEMO_INCIDENTS;
    updateStats();
    renderIncidents();
    showToast('Running in demo mode. Configure Supabase in supabase_config.js 🔧', 'info');
  }
}

// ── ADMIN PROFILE ──────────────────────────────────
async function loadAdminProfile() {
  try {
    const { data } = await supabase
      .from('admin_users')
      .select('full_name, role, avatar_url')
      .eq('user_id', currentAdmin.id)
      .single();

    if (data) {
      document.querySelector('.dispatcher-name').textContent =
        data.full_name || currentAdmin.email;
      if (data.avatar_url) {
        const av = document.querySelector('.dispatcher-avatar');
        av.innerHTML = `<img src="${data.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      }
    }
  } catch (_) {}
}

// ── LOAD INCIDENTS ─────────────────────────────────
async function loadIncidents() {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  incidents = (data || []).map(normalizeIncident);
}

function normalizeIncident(row) {
  const statusMap = { pending: 'pending', inreview: 'inreview', resolved: 'resolved', false: 'false' };
  const priorityMap = { mataas: 'high', katamtaman: 'medium', mababa: 'low' };
  const locationText = typeof row.location === 'object'
    ? (row.location?.address || '—')
    : (row.location || '—');
  const latitude = typeof row.location === 'object' ? row.location?.lat : row.lat;
  const longitude = typeof row.location === 'object' ? row.location?.lng : row.lng;
  const attachments = Array.isArray(row.attachments) ? row.attachments : [];
  const primaryMedia = attachments.find(file => file?.url) || null;

  return {
    id        : row.id,
    type      : (row.category || row.type || 'REPORT').toUpperCase(),
    priority  : priorityMap[String(row.urgency || row.priority || 'medium').toLowerCase()] || 'medium',
    status    : statusMap[row.status] || 'pending',
    title     : row.title || 'Incident Report',
    desc      : row.detail || row.description || '',
    location  : locationText,
    barangay  : row.barangay || row.user_barangay || '—',
    reporter  : row.user_name || row.reporter_name || 'Anonymous',
    contact   : row.user_email || row.reporter_contact || '—',
    coords    : latitude && longitude
      ? `${Number(latitude).toFixed(4)}°N, ${Number(longitude).toFixed(4)}°E`
      : '—',
    time      : timeAgo(row.created_at),
    icon      : typeIcon(row.category || row.type),
    mediaClass: typeClass(row.category || row.type),
    photoUrl  : primaryMedia?.url || row.photo_url || null,
    comments  : Array.isArray(row.comments) ? row.comments : [],
    _raw      : row,
  };
}

// ── REALTIME SUBSCRIPTION ──────────────────────────
function subscribeRealtime() {
  realtimeChannel = supabase
    .channel('reports-feed')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'reports' },
      async (payload) => {
        if (payload.eventType === 'INSERT') {
          const inc = normalizeIncident(payload.new);
          incidents.unshift(inc);
          showToast(`🆕 New report: ${inc.title}`, 'info');
        } else if (payload.eventType === 'UPDATE') {
          const idx = incidents.findIndex(i => i.id === payload.new.id);
          if (idx !== -1) incidents[idx] = normalizeIncident(payload.new);
        } else if (payload.eventType === 'DELETE') {
          incidents = incidents.filter(i => i.id !== payload.old.id);
        }
        updateStats();
        renderIncidents();
      }
    )
    .subscribe();
}

// ── UPDATE INCIDENT IN DB ──────────────────────────
async function updateIncidentStatus(id, status) {
  if (!currentAdmin) {
    // demo mode — local only
    const inc = incidents.find(i => i.id === id);
    if (inc) inc.status = status;
    return;
  }

  const { error } = await supabase
    .from('reports')
    .update({
      status,
      updated_at: new Date().toISOString(),
      assigned_admin_id: currentAdmin.id,
      last_admin_action_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
}

// ── STATS ──────────────────────────────────────────
function updateStats() {
  document.getElementById('statHigh').textContent =
    incidents.filter(i => i.priority === 'high' && i.status !== 'resolved').length;
  document.getElementById('statFalse').textContent =
    incidents.filter(i => i.status === 'false').length;
  document.getElementById('statProgress').textContent =
    incidents.filter(i => i.status === 'inreview').length;
  document.getElementById('statResolved').textContent =
    incidents.filter(i => i.status === 'resolved').length;

  const live = incidents.filter(i => i.status === 'pending' || i.status === 'inreview').length;
  document.getElementById('liveCount').textContent = live;
  document.getElementById('liveBadgeCount').textContent = live + ' Live';
  document.getElementById('pendingBadge').textContent =
    incidents.filter(i => i.status === 'pending').length;
}

// ── FILTERING & SORTING ────────────────────────────
function getFiltered() {
  let list = [...incidents];

  if (currentFilter === 'pending')     list = list.filter(i => i.status === 'pending');
  else if (currentFilter === 'inreview') list = list.filter(i => i.status === 'inreview');
  else if (currentFilter === 'resolved')    list = list.filter(i => i.status === 'resolved');
  else if (currentFilter === 'false')       list = list.filter(i => i.status === 'false');

  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    list = list.filter(i =>
      i.title.toLowerCase().includes(q)    ||
      i.type.toLowerCase().includes(q)     ||
      i.location.toLowerCase().includes(q) ||
      i.reporter.toLowerCase().includes(q) ||
      i.barangay.toLowerCase().includes(q)
    );
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  if (currentSort === 'priority') {
    list.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  return list;
}

function filterByType(type, el) {
  currentFilter = type;
  document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderIncidents();
}

function sortBy(type, el) {
  currentSort = type;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderIncidents();
}

function filterIncidents() {
  currentSearch = document.getElementById('searchInput').value;
  renderIncidents();
}

// ── RENDER INCIDENTS ───────────────────────────────
function renderIncidents() {
  const grid = document.getElementById('incidentsGrid');
  const list = getFiltered();

  if (!list.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-text">No reports found matching your criteria.</div>
      </div>`;
    return;
  }

  grid.innerHTML = list.map((inc, idx) => `
    <div class="incident-card ${selectedId === inc.id ? 'selected' : ''}"
         style="animation-delay:${idx * 0.04}s"
         onclick="openPanel('${inc.id}')">
      <div class="card-media">
        <div class="media-img ${inc.mediaClass}" ${inc.photoUrl ? `style="background-image:url('${inc.photoUrl}');background-size:cover;background-position:center"` : ''}>
          <div class="card-type-badge">${inc.type}</div>
          ${!inc.photoUrl ? `<span style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))">${inc.icon}</span>` : ''}
        </div>
        <div class="media-img map" style="align-items:center;justify-content:center;gap:4px;flex-direction:column;">
          <span>🗺️</span>
          <span style="font-size:9px;font-weight:600;color:#2d7a3a;letter-spacing:.3px">${inc.barangay}</span>
        </div>
      </div>
      <div class="card-body">
        <div class="card-top">
          <div class="card-id-title">
            <div class="card-id">${inc.id}</div>
            <div class="card-title">${inc.title}</div>
          </div>
          <div class="badges">
            ${priorityBadge(inc.priority)}
            ${statusBadge(inc.status)}
          </div>
        </div>
        <div class="card-desc">${inc.desc}</div>
        <div class="card-footer">
          <div class="card-meta">⏱️ ${inc.time}</div>
          <button class="view-btn">View Details →</button>
        </div>
      </div>
    </div>
  `).join('');
}

function priorityBadge(p) {
  if (p === 'high')   return '<span class="badge high">High</span>';
  if (p === 'medium') return '<span class="badge medium">Medium</span>';
  return '<span class="badge low">Low</span>';
}

function statusBadge(s) {
  if (s === 'pending')     return '<span class="badge pending">Pending</span>';
  if (s === 'resolved')    return '<span class="badge resolved">Resolved</span>';
  if (s === 'inreview') return '<span class="badge in-progress">In Review</span>';
  if (s === 'false')       return '<span class="badge false">False Report</span>';
  return '';
}

// ── SIDEBAR NAV ────────────────────────────────────
function setNav(el, section) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');

  const contentEl = document.querySelector('.content');

  if (section === 'complaints') {
    currentFilter = 'all';
    renderMainFeed();
    document.querySelector('.filter-chips .chip').click();
  } else if (section === 'resolved') {
    currentFilter = 'resolved';
    renderMainFeed();
    document.querySelectorAll('.filter-chips .chip')[3]?.click();
  } else if (section === 'false') {
    currentFilter = 'false';
    renderMainFeed();
    // manually set chip active
    document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active'));
  } else if (section === 'users') {
    renderSection(contentEl, buildUsersSection());
  } else if (section === 'barangay') {
    renderSection(contentEl, buildBarangaySection());
  } else if (section === 'settings') {
    renderSection(contentEl, buildSettingsSection());
  }
}

function renderMainFeed() {
  // Rebuild original content if sections replaced it
  const contentEl = document.querySelector('.content');
  if (!document.getElementById('incidentsGrid')) {
    contentEl.innerHTML = MAIN_FEED_HTML;
    // re-attach chips
  }
  updateStats();
  renderIncidents();
}

// Cache the original feed HTML on load
let MAIN_FEED_HTML = '';
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    MAIN_FEED_HTML = document.querySelector('.content')?.innerHTML || '';
  }, 0);
});

function renderSection(container, html) {
  container.innerHTML = html;
}

// ── USERS SECTION ──────────────────────────────────
function buildUsersSection() {
  const usersFromState = _adminUsers || [];
  loadAdminUsers();

  return `
  <div>
    <div class="feed-header" style="margin-bottom:18px">
      <div class="feed-title">Admin Users</div>
      <button class="sort-btn active" style="margin-left:auto"
        onclick="showAddAdminModal()">+ Add Admin</button>
    </div>

    <div id="usersTable">
      <div style="padding:40px;text-align:center;color:var(--gray-400)">
        <div style="font-size:28px;margin-bottom:8px">👥</div>
        Loading users…
      </div>
    </div>
  </div>`;
}

let _adminUsers = [];

async function loadAdminUsers() {
  try {
    const { data, error } = await supabase
      .from('admin_users')
      .select('id, full_name, email, role, is_active, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    _adminUsers = data || [];
    renderUsersTable(_adminUsers);
  } catch (err) {
    const el = document.getElementById('usersTable');
    if (el) el.innerHTML = `<div style="padding:20px;color:var(--gray-500);text-align:center">
      Unable to load users. Check Supabase configuration.
    </div>`;
  }
}

function renderUsersTable(users) {
  const el = document.getElementById('usersTable');
  if (!el) return;

  if (!users.length) {
    el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--gray-400)">No admin users found.</div>`;
    return;
  }

  el.innerHTML = `
  <table style="width:100%;border-collapse:collapse;background:var(--white);
    border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow-sm)">
    <thead>
      <tr style="background:var(--gray-100);border-bottom:1.5px solid var(--gray-200)">
        <th style="${thStyle()}">Name</th>
        <th style="${thStyle()}">Email</th>
        <th style="${thStyle()}">Role</th>
        <th style="${thStyle()}">Status</th>
        <th style="${thStyle()}">Joined</th>
        <th style="${thStyle()}">Actions</th>
      </tr>
    </thead>
    <tbody>
      ${users.map(u => `
        <tr style="border-bottom:1px solid var(--gray-100)">
          <td style="${tdStyle()}"><strong>${u.full_name || '—'}</strong></td>
          <td style="${tdStyle()};color:var(--gray-500)">${u.email}</td>
          <td style="${tdStyle()}">
            <span style="background:var(--red-pale);color:var(--red);
              padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600">
              ${u.role || 'dispatcher'}
            </span>
          </td>
          <td style="${tdStyle()}">
            <span style="background:${u.is_active ? '#dcfce7' : '#f3f4f6'};
              color:${u.is_active ? '#15803d' : 'var(--gray-500)'};
              padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600">
              ${u.is_active ? '● Active' : '○ Inactive'}
            </span>
          </td>
          <td style="${tdStyle()};color:var(--gray-500);font-size:12px">
            ${u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
          </td>
          <td style="${tdStyle()}">
            <button class="view-btn" onclick="toggleAdminStatus('${u.id}', ${u.is_active})">
              ${u.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>`;
}

function thStyle() {
  return 'padding:11px 16px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500);text-align:left';
}
function tdStyle() {
  return 'padding:13px 16px;font-size:13px;color:var(--gray-800)';
}

async function toggleAdminStatus(adminId, currentActive) {
  try {
    const { error } = await supabase
      .from('admin_users')
      .update({ is_active: !currentActive })
      .eq('id', adminId);
    if (error) throw error;
    showToast(currentActive ? '🔒 Admin deactivated.' : '✅ Admin activated.', 'success');
    loadAdminUsers();
  } catch (err) {
    showToast('Failed to update admin status.', 'error');
  }
}

function showAddAdminModal() {
  showToast('To add an admin: invite the user via Supabase Auth, then add a row to admin_users. 📧', 'info');
}

// ── BARANGAY SECTION ───────────────────────────────
function buildBarangaySection() {
  loadBarangays();
  return `
  <div>
    <div class="feed-header" style="margin-bottom:18px">
      <div class="feed-title">Barangay Zones</div>
    </div>
    <div id="barangayGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px">
      <div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--gray-400)">
        <div style="font-size:28px;margin-bottom:8px">🏘️</div>
        Loading barangays…
      </div>
    </div>
  </div>`;
}

async function loadBarangays() {
  try {
    const { data, error } = await supabase
      .from('barangays')
      .select('id, name, zone, population, contact_person, contact_number')
      .order('name');

    if (error) throw error;
    renderBarangays(data || []);
  } catch (_) {
    // Fallback demo
    renderBarangays(DEMO_BARANGAYS);
  }
}

function renderBarangays(list) {
  const el = document.getElementById('barangayGrid');
  if (!el) return;
  if (!list.length) {
    el.innerHTML = `<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--gray-400)">No barangays configured.</div>`;
    return;
  }

  const total = incidents.length;
  el.innerHTML = list.map(b => {
    const count = incidents.filter(i => i.barangay === b.name).length;
    const pct   = total ? Math.round((count / total) * 100) : 0;
    return `
    <div style="background:var(--white);border-radius:var(--radius);
      padding:18px;box-shadow:var(--shadow-sm);border:1.5px solid var(--gray-200)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:14px">
          🏘️ ${b.name}
        </div>
        <span style="font-size:11px;color:var(--gray-500);
          background:var(--gray-100);padding:3px 9px;border-radius:12px">
          Zone ${b.zone || 'N/A'}
        </span>
      </div>
      <div style="font-size:12px;color:var(--gray-500);margin-bottom:8px">
        👤 ${b.contact_person || '—'} · ${b.contact_number || '—'}
      </div>
      <div style="background:var(--gray-100);border-radius:6px;height:6px;margin-bottom:6px">
        <div style="width:${pct}%;background:var(--red);height:100%;border-radius:6px;transition:width .4s"></div>
      </div>
      <div style="font-size:11px;color:var(--gray-500)">${count} incident${count !== 1 ? 's' : ''} reported</div>
    </div>`;
  }).join('');
}

// ── SETTINGS SECTION ───────────────────────────────
function buildSettingsSection() {
  const adminEmail = currentAdmin?.email || '—';
  return `
  <div style="max-width:580px">
    <div class="feed-header" style="margin-bottom:20px">
      <div class="feed-title">Settings</div>
    </div>

    <!-- Account -->
    <div style="background:var(--white);border-radius:var(--radius);
      padding:22px;box-shadow:var(--shadow-sm);margin-bottom:16px;
      border:1.5px solid var(--gray-200)">
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:14px;
        margin-bottom:16px;display:flex;align-items:center;gap:8px">
        👤 Account Settings
      </div>

      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;
          letter-spacing:.5px;color:var(--gray-400);margin-bottom:5px">
          Logged in as
        </div>
        <div style="font-size:13.5px;font-weight:600;color:var(--gray-800)">${adminEmail}</div>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="sort-btn" onclick="showChangePasswordFlow()">
          🔑 Change Password
        </button>
        <button class="sort-btn active" onclick="handleSignOut()" style="background:#ef4444;border-color:#ef4444">
          🚪 Sign Out
        </button>
      </div>
    </div>

    <!-- Change password inline -->
    <div id="changePwSection" style="display:none;background:var(--white);
      border-radius:var(--radius);padding:22px;box-shadow:var(--shadow-sm);
      margin-bottom:16px;border:1.5px solid var(--gray-200)">
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:14px;margin-bottom:14px">
        🔑 Change Password
      </div>
      <div style="margin-bottom:12px">
        <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;
          color:var(--gray-400);display:block;margin-bottom:5px">New Password</label>
        <input id="settingNewPw" type="password" placeholder="••••••••"
          style="width:100%;padding:10px 12px;border:1.5px solid var(--gray-200);
          border-radius:9px;font-size:13.5px;font-family:'DM Sans',sans-serif;
          outline:none;background:var(--gray-100)">
      </div>
      <div style="margin-bottom:14px">
        <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;
          color:var(--gray-400);display:block;margin-bottom:5px">Confirm Password</label>
        <input id="settingConfirmPw" type="password" placeholder="••••••••"
          style="width:100%;padding:10px 12px;border:1.5px solid var(--gray-200);
          border-radius:9px;font-size:13.5px;font-family:'DM Sans',sans-serif;
          outline:none;background:var(--gray-100)">
      </div>
      <div style="display:flex;gap:10px">
        <button class="sort-btn active" onclick="saveNewPassword()">Save</button>
        <button class="sort-btn" onclick="document.getElementById('changePwSection').style.display='none'">Cancel</button>
      </div>
    </div>

    <!-- Notifications -->
    <div style="background:var(--white);border-radius:var(--radius);
      padding:22px;box-shadow:var(--shadow-sm);margin-bottom:16px;
      border:1.5px solid var(--gray-200)">
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:14px;margin-bottom:16px">
        🔔 Notifications
      </div>
      ${settingToggle('notifHighPriority', 'High Priority Alerts', 'Get notified for all high-priority incidents immediately.')}
      ${settingToggle('notifNewReport',    'New Report Alerts',    'Get notified whenever a new report is submitted.')}
      ${settingToggle('notifDispatch',     'Dispatch Confirmations','Confirmation when units are dispatched.')}
    </div>

    <!-- System -->
    <div style="background:var(--white);border-radius:var(--radius);
      padding:22px;box-shadow:var(--shadow-sm);border:1.5px solid var(--gray-200)">
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:14px;margin-bottom:16px">
        ⚙️ System
      </div>
      <div style="font-size:12.5px;color:var(--gray-500);line-height:1.7">
        <div>Dashboard Version: <strong>1.0.0</strong></div>
        <div>Supabase Connected: <strong id="supabaseStatus">Checking…</strong></div>
        <div>Realtime: <strong>${realtimeChannel ? '🟢 Active' : '🔴 Inactive'}</strong></div>
      </div>
    </div>
  </div>`;
}

function settingToggle(id, label, desc) {
  return `
  <div style="display:flex;align-items:flex-start;justify-content:space-between;
    padding:10px 0;border-bottom:1px solid var(--gray-100)">
    <div>
      <div style="font-size:13.5px;font-weight:600;color:var(--gray-800);margin-bottom:2px">${label}</div>
      <div style="font-size:12px;color:var(--gray-400)">${desc}</div>
    </div>
    <label style="position:relative;display:inline-block;width:38px;height:22px;margin-left:16px;flex-shrink:0">
      <input type="checkbox" id="${id}" checked style="opacity:0;width:0;height:0">
      <span onclick="this.previousElementSibling.checked=!this.previousElementSibling.checked"
        style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;
          background:#ccc;border-radius:22px;transition:.3s;
          background:${id === 'notifHighPriority' ? 'var(--red)' : 'var(--gray-300)'}">
        <span style="position:absolute;height:16px;width:16px;left:3px;bottom:3px;
          background:white;border-radius:50%;transition:.3s;
          transform:${id === 'notifHighPriority' ? 'translateX(16px)' : 'none'}"></span>
      </span>
    </label>
  </div>`;
}

function showChangePasswordFlow() {
  const el = document.getElementById('changePwSection');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function saveNewPassword() {
  const pw  = document.getElementById('settingNewPw')?.value;
  const cpw = document.getElementById('settingConfirmPw')?.value;
  if (!pw || pw.length < 8) { showToast('Password must be at least 8 characters.', 'error'); return; }
  if (pw !== cpw) { showToast('Passwords do not match.', 'error'); return; }

  try {
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) throw error;
    showToast('✅ Password updated!', 'success');
    document.getElementById('changePwSection').style.display = 'none';
  } catch (err) {
    showToast('Failed to update password: ' + err.message, 'error');
  }
}

async function handleSignOut() {
  showModal('🚪', 'Sign Out?', 'You will be returned to the login page.', 'Sign Out', '#ef4444', async () => {
    await supabase.auth.signOut();
    showAdminAuth('viewLogin');
  });
}

// ── DETAIL PANEL ───────────────────────────────────
function openPanel(id) {
  const inc = incidents.find(i => i.id === id);
  if (!inc) return;

  selectedId = id;
  renderIncidents();

  document.getElementById('panelIcon').textContent   = inc.icon;
  document.getElementById('panelId').textContent     = inc.id + ' · ' + inc.type;
  document.getElementById('panelTitle').textContent  = inc.title;
  document.getElementById('panelBadges').innerHTML   = priorityBadge(inc.priority) + ' ' + statusBadge(inc.status);

  const panelMedia = document.getElementById('panelMedia');
  panelMedia.className = 'panel-media media-img ' + inc.mediaClass;
  panelMedia.innerHTML = inc.photoUrl
    ? `<img src="${inc.photoUrl}" style="width:100%;height:100%;object-fit:cover">
       <div class="map-placeholder">🗺️ View on Map</div>`
    : `<span style="font-size:52px;filter:drop-shadow(0 2px 8px rgba(0,0,0,.3))">${inc.icon}</span>
       <div class="map-placeholder" onclick="openMap('${inc.coords}')">🗺️ View on Map</div>`;

  document.getElementById('panelCoords').textContent   = inc.coords;
  document.getElementById('panelTime').textContent     = inc.time;
  document.getElementById('panelDesc').textContent     = inc.desc;
  document.getElementById('panelReporter').textContent = inc.reporter;
  document.getElementById('panelContact').textContent  = inc.contact;
  document.getElementById('panelAddress').textContent  = inc.location;
  document.getElementById('panelBarangay').textContent = inc.barangay;
  renderPanelComments(inc);
  const commentInput = document.getElementById('adminCommentInput');
  if (commentInput) commentInput.value = '';

  document.getElementById('detailOverlay').classList.add('open');
  document.getElementById('detailPanel').classList.add('open');
}

function closePanel() {
  selectedId = null;
  document.getElementById('detailOverlay').classList.remove('open');
  document.getElementById('detailPanel').classList.remove('open');
  if (document.getElementById('incidentsGrid')) renderIncidents();
}

function openMap(coords) {
  if (!coords || coords === '—') return;
  const [lat, lng] = coords.replace(/[°NE]/g, '').split(', ');
  window.open(`https://maps.google.com/?q=${lat},${lng}`, '_blank');
}

function renderPanelComments(inc) {
  const panel = document.getElementById('panelComments');
  if (!panel) return;

  if (!Array.isArray(inc.comments) || !inc.comments.length) {
    panel.innerHTML = '<div style="padding:10px 12px;border-radius:10px;background:var(--gray-100);">No updates yet.</div>';
    return;
  }

  panel.innerHTML = inc.comments
    .slice()
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    .map(comment => {
      const author = comment.is_admin ? 'Dispatcher' : (comment.user_name || 'Resident');
      const tone = comment.is_admin
        ? 'background:#fdf2f2;border:1px solid #fecaca;color:#7B1113;'
        : 'background:var(--gray-100);border:1px solid var(--gray-200);color:var(--gray-800);';
      return `<div style="${tone}padding:10px 12px;border-radius:10px;">
        <div style="font-weight:700;font-size:12px;margin-bottom:4px;">${author}</div>
        <div style="line-height:1.5;">${escapeHtml(comment.text || '')}</div>
        <div style="margin-top:6px;font-size:11px;opacity:.75;">${timeAgo(comment.created_at)}</div>
      </div>`;
    })
    .join('');
}

async function sendAdminComment() {
  if (!selectedId || !currentAdmin) return;

  const input = document.getElementById('adminCommentInput');
  const text = input?.value.trim();
  if (!text) {
    showToast('Write a short update first.', 'info');
    return;
  }

  const inc = incidents.find(i => i.id === selectedId);
  if (!inc) return;

  const comments = Array.isArray(inc.comments) ? [...inc.comments] : [];
  comments.push({
    user_id: currentAdmin.id,
    user_name: currentAdmin.email,
    text,
    is_admin: true,
    created_at: new Date().toISOString(),
  });

  try {
    const { error } = await supabase
      .from('reports')
      .update({
        comments,
        updated_at: new Date().toISOString(),
        assigned_admin_id: currentAdmin.id,
        last_admin_action_at: new Date().toISOString(),
      })
      .eq('id', selectedId);

    if (error) throw error;

    inc.comments = comments;
    renderPanelComments(inc);
    input.value = '';
    showToast('Dispatcher update sent.', 'success');
  } catch (err) {
    showToast('Failed to send update: ' + err.message, 'error');
  }
}

async function addAdminSystemComment(reportId, text) {
  const inc = incidents.find(item => item.id === reportId);
  if (!inc || !currentAdmin) return;

  const comments = Array.isArray(inc.comments) ? [...inc.comments] : [];
  comments.push({
    user_id: currentAdmin.id,
    user_name: currentAdmin.email,
    text,
    is_admin: true,
    created_at: new Date().toISOString(),
  });

  const { error } = await supabase
    .from('reports')
    .update({
      comments,
      updated_at: new Date().toISOString(),
      assigned_admin_id: currentAdmin.id,
      last_admin_action_at: new Date().toISOString(),
    })
    .eq('id', reportId);

  if (error) throw error;
  inc.comments = comments;
}

// ── INCIDENT ACTIONS ───────────────────────────────
function resolveIncident() {
  if (!selectedId) return;
  const inc = incidents.find(i => i.id === selectedId);
  if (inc.status === 'resolved') { showToast('Already resolved.', 'info'); return; }

  showModal('✅', 'Resolve Incident?',
    `Confirm that "${inc.title}" has been resolved.`,
    'Yes, Resolve', '#2d7a3a',
    async () => {
      try {
        await updateIncidentStatus(inc.id, 'resolved');
        await addAdminSystemComment(inc.id, 'Your report has been marked as resolved by the dispatcher.');
        inc.status = 'resolved';
        updateStats();
        renderIncidents();
        closePanel();
        showToast('✅ Resolved: ' + inc.id, 'success');
      } catch (err) {
        showToast('Failed to update: ' + err.message, 'error');
      }
    }
  );
}

function flagIncident() {
  if (!selectedId) return;
  const inc = incidents.find(i => i.id === selectedId);

  showModal('🚩', 'Flag as False Report?',
    `Flag "${inc.title}" as a false report? The reporter will be notified.`,
    'Yes, Flag It', '#7e22ce',
    async () => {
      try {
        await updateIncidentStatus(inc.id, 'false');
        await addAdminSystemComment(inc.id, 'This report was flagged by the dispatcher for verification.');
        inc.status = 'false';
        updateStats();
        renderIncidents();
        closePanel();
        showToast('🚩 Flagged: ' + inc.id, 'info');
      } catch (err) {
        showToast('Failed to update: ' + err.message, 'error');
      }
    }
  );
}

function dispatchUnits() {
  if (!selectedId) return;
  const inc = incidents.find(i => i.id === selectedId);

  showModal('🚁', 'Dispatch Response Units?',
    `Send the nearest response units to "${inc.title}". All relevant agencies will be notified.`,
    'Yes, Dispatch', '#7B1113',
    async () => {
      try {
        const newStatus = inc.status === 'pending' ? 'inreview' : inc.status;
        await updateIncidentStatus(inc.id, newStatus);
        await addAdminSystemComment(inc.id, 'Response units were dispatched and your report is now under review.');

        // Also log dispatch in Supabase
        if (currentAdmin) {
          await supabase.from('dispatches').insert({
            report_id    : inc.id,
            dispatched_by: currentAdmin.id,
            dispatched_at: new Date().toISOString(),
          }).catch(() => {}); // non-critical
        }

        inc.status = newStatus;
        updateStats();
        renderIncidents();
        openPanel(selectedId);
        showToast('🚁 Units dispatched to ' + inc.barangay + '!', 'success');
      } catch (err) {
        showToast('Dispatch failed: ' + err.message, 'error');
      }
    }
  );
}

// ── MODAL ──────────────────────────────────────────
function showModal(icon, title, desc, confirmLabel, confirmColor, callback) {
  document.getElementById('modalIcon').textContent  = icon;
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalDesc').textContent  = desc;

  const btn = document.getElementById('modalConfirmBtn');
  btn.textContent      = confirmLabel;
  btn.style.background = confirmColor;
  btn.style.color      = '#fff';

  modalCallback = callback;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  modalCallback = null;
}

function executeModalAction() {
  closeModal();
  if (modalCallback) modalCallback();
}

// ── TOAST ──────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className   = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── HELPERS ────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const min  = Math.floor(diff / 60000);
  const hr   = Math.floor(diff / 3600000);
  const day  = Math.floor(diff / 86400000);
  if (min < 1)  return 'Just now';
  if (min < 60) return `${min} min${min > 1 ? 's' : ''} ago`;
  if (hr < 24)  return `${hr} hour${hr > 1 ? 's' : ''} ago`;
  return `${day} day${day > 1 ? 's' : ''} ago`;
}

function typeIcon(type) {
  const t = (type || '').toUpperCase();
  if (t.includes('FIRE'))       return '🔥';
  if (t.includes('FLOOD'))      return '🌊';
  if (t.includes('MEDICAL'))    return '🏥';
  if (t.includes('TRAFFIC') || t.includes('COLLISION')) return '🚗';
  if (t.includes('POWER'))      return '⚡';
  if (t.includes('GARBAGE'))    return '🗑️';
  if (t.includes('ROAD'))       return '🛣️';
  if (t.includes('DISTURBANCE'))return '📢';
  return '📋';
}

function typeClass(type) {
  const t = (type || '').toUpperCase();
  if (t.includes('FIRE'))       return 'scene';
  if (t.includes('FLOOD'))      return 'flood';
  if (t.includes('MEDICAL'))    return 'flood';
  if (t.includes('TRAFFIC') || t.includes('COLLISION') || t.includes('ROAD')) return 'road';
  if (t.includes('POWER'))      return 'power';
  if (t.includes('GARBAGE'))    return 'garbage';
  return 'scene';
}

// ── DEMO DATA ──────────────────────────────────────
const DEMO_INCIDENTS = [
  { id:'INC-7721', type:'STRUCTURE FIRE',    priority:'high',   status:'pending',
    title:'Building Fire in Industrial Area',
    desc:'Heavy smoke reported from the second floor of a manufacturing facility.',
    location:'Tierracasa St., Gumaoc, San Jose del Monte', barangay:'Gumaoc',
    reporter:'Security Central', contact:'0917-012-9888', coords:'14.8145°N, 121.0478°E',
    time:'2 mins ago', icon:'🔥', mediaClass:'scene' },
  { id:'INC-8890', type:'MEDICAL EMERGENCY', priority:'low',    status:'resolved',
    title:'Unconscious Person at Market',
    desc:'Elderly male found unconscious outside the public market.',
    location:'Sapang Palay Market, San Jose del Monte', barangay:'Sapang Palay',
    reporter:'Lendehl Diray', contact:'0926-334-1122', coords:'14.8201°N, 121.0512°E',
    time:'5 mins ago', icon:'🏥', mediaClass:'flood' },
  { id:'INC-3342', type:'TRAFFIC COLLISION', priority:'medium', status:'false',
    title:'Road Accident Report',
    desc:'Multi-vehicle collision report suspected to be exaggerated.',
    location:'Gaya-gaya, San Jose del Monte', barangay:'Gaya-gaya',
    reporter:'Jhai Mercado', contact:'0932-556-7890', coords:'14.8099°N, 121.0534°E',
    time:'12 mins ago', icon:'🚗', mediaClass:'road' },
  { id:'INC-4401', type:'FLOOD REPORT',      priority:'high',   status:'inreview',
    title:'Rising Floodwater in Subdivision',
    desc:'Water levels are rising. Several families need evacuation assistance.',
    location:'Muzon, San Jose del Monte', barangay:'Muzon',
    reporter:'Barangay Tanod', contact:'0955-789-0011', coords:'14.8231°N, 121.0389°E',
    time:'25 mins ago', icon:'🌊', mediaClass:'flood' },
  { id:'INC-5588', type:'ROAD DAMAGE',       priority:'medium', status:'pending',
    title:'Damaged Road Surface',
    desc:'Large pothole on the main road posing a hazard to vehicles.',
    location:'Tierracasa St., Gumaoc, San Jose del Monte', barangay:'Gumaoc',
    reporter:'Jetlee Yonque', contact:'0919-445-6677', coords:'14.8120°N, 121.0467°E',
    time:'2 days ago', icon:'🛣️', mediaClass:'road' },
  { id:'INC-6612', type:'GARBAGE OVERFLOW',  priority:'low',    status:'pending',
    title:'Uncollected Garbage for a Week',
    desc:'Garbage has not been collected for over a week. Health hazard.',
    location:'San Manuel, San Jose del Monte', barangay:'San Manuel',
    reporter:'Maria Santos', contact:'0909-123-4567', coords:'14.8187°N, 121.0501°E',
    time:'3 hours ago', icon:'🗑️', mediaClass:'garbage' },
  { id:'INC-7730', type:'POWER OUTAGE',      priority:'medium', status:'inreview',
    title:'Block-wide Power Outage',
    desc:'Several households have had no electricity. Power line severed.',
    location:'Tungkong Mangga, San Jose del Monte', barangay:'Tungkong Mangga',
    reporter:'Pedro Cruz', contact:'0922-987-6543', coords:'14.8255°N, 121.0420°E',
    time:'1 hour ago', icon:'⚡', mediaClass:'power' },
];

const DEMO_BARANGAYS = [
  { id:1, name:'Gumaoc',         zone:'1', population:4200, contact_person:'Kagawad Reyes',  contact_number:'0917-111-0001' },
  { id:2, name:'Sapang Palay',   zone:'2', population:8900, contact_person:'Kagawad dela Cruz',contact_number:'0917-111-0002' },
  { id:3, name:'Gaya-gaya',      zone:'2', population:3100, contact_person:'Kagawad Santos',  contact_number:'0917-111-0003' },
  { id:4, name:'Muzon',          zone:'3', population:6700, contact_person:'Kagawad Flores',  contact_number:'0917-111-0004' },
  { id:5, name:'San Manuel',     zone:'3', population:5200, contact_person:'Kagawad Garcia',  contact_number:'0917-111-0005' },
  { id:6, name:'Tungkong Mangga',zone:'4', population:7400, contact_person:'Kagawad Bautista',contact_number:'0917-111-0006' },
  { id:7, name:'Poblacion',      zone:'1', population:9100, contact_person:'Kagawad Mendoza', contact_number:'0917-111-0007' },
];

