window.__adminBooted = true;

const SUPABASE_URL = "https://dugzytiyhyafdrhisjqg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_nQN9DQBb7nwR1A6iYH52pQ_jCROHCGS";

const adminClient = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'aksyon-admin-auth',
      },
    })
  : null;

const ADMIN_TABLE = 'admin_users';

function showAdminAuth(defaultView = 'viewLogin') {
  const authShell = document.getElementById('adminAuthShell');
  const appShell = document.getElementById('adminAppShell');
  if (authShell) authShell.classList.remove('admin-app-hidden');
  if (appShell) appShell.classList.add('admin-app-hidden');
  if (document.getElementById(defaultView)) showView(defaultView);
}

function showAdminApp() {
  const authShell = document.getElementById('adminAuthShell');
  const appShell = document.getElementById('adminAppShell');
  if (authShell) authShell.classList.add('admin-app-hidden');
  if (appShell) appShell.classList.remove('admin-app-hidden');
}

function getAdminPageUrl() { return window.location.origin + window.location.pathname; }

async function getCurrentAdminSession() {
  if (!adminClient) return null;
  const { data: { session } } = await adminClient.auth.getSession();
  return session || null;
}

async function getCurrentAdminProfile() {
  const session = await getCurrentAdminSession();
  if (!session?.user) return null;
  const { data, error } = await adminClient.from(ADMIN_TABLE).select('*').eq('user_id', session.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

async function requireAdminSession() {
  const session = await getCurrentAdminSession();
  if (!session?.user) { showAdminAuth('viewLogin'); return null; }
  const profile = await getCurrentAdminProfile();
  if (!profile?.is_active) {
    await adminClient.auth.signOut();
    showAdminAuth('viewLogin');
    return null;
  }
  showAdminApp();
  return { session, profile };
}

function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  clearAlerts(); clearErrors();
}

function clearAlerts() { document.querySelectorAll('.alert').forEach(a => a.classList.remove('show')); }
function clearErrors() {
  document.querySelectorAll('.field-error').forEach(e => e.classList.remove('show'));
  document.querySelectorAll('.form-input').forEach(i => i.classList.remove('input-error'));
}
function normalizeEmail(value) { return value.trim().toLowerCase(); }

function setLoading(btnId, isLoading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.classList.toggle('loading', isLoading);
}

function showAlert(alertId, msgId, message) {
  const el = document.getElementById(alertId);
  const msg = document.getElementById(msgId);
  if (el && msg) { msg.textContent = message; el.classList.add('show'); }
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

async function handleLogin() {
  clearAlerts(); clearErrors();
  const emailEl = document.getElementById('emailInput'), pwEl = document.getElementById('passwordInput');
  const email = normalizeEmail(emailEl.value), pw = pwEl.value;
  let valid = true;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showFieldError('emailError', emailEl); valid = false; }
  if (!pw) { showFieldError('passwordError', pwEl); valid = false; }
  if (!valid) return;

  setLoading('loginBtn', true);
  try {
    const { data, error } = await adminClient.auth.signInWithPassword({ email, password: pw });
    if (error) {
      const msg = error.message.includes('Invalid') || error.message.includes('credentials') ? 'Invalid email or password.' : error.message;
      showAlert('loginAlert', 'loginAlertMsg', msg);
      return;
    }
    const { data: adminRecord, error: adminErr } = await adminClient.from('admin_users').select('id, role, is_active').eq('user_id', data.user.id).single();
    if (adminErr || !adminRecord?.is_active) {
      await adminClient.auth.signOut();
      showAlert('loginAlert', 'loginAlertMsg', 'This account does not have administrator access.');
      return;
    }
    window.location.href = getAdminPageUrl();
  } catch (err) {
    showAlert('loginAlert', 'loginAlertMsg', 'Server connection failed.');
  } finally {
    setLoading('loginBtn', false);
  }
}

async function handleForgot() {
  clearAlerts(); clearErrors();
  const emailEl = document.getElementById('forgotEmail'), email = normalizeEmail(emailEl.value);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showFieldError('forgotEmailError', emailEl); return; }

  setLoading('resetBtn', true);
  try {
    const { error } = await adminClient.auth.resetPasswordForEmail(email, { redirectTo: getAdminPageUrl() });
    if (error) { showAlert('forgotAlert', 'forgotAlertMsg', error.message); return; }
    document.getElementById('sentToEmail').textContent = email;
    showView('viewResetSent');
  } catch (err) {
    showAlert('forgotAlert', 'forgotAlertMsg', 'Something went wrong.');
  } finally {
    setLoading('resetBtn', false);
  }
}

async function handleNewPassword() {
  clearAlerts(); clearErrors();
  const newPwEl = document.getElementById('newPwInput'), confirmPwEl = document.getElementById('confirmPwInput');
  const newPw = newPwEl.value, confirmPw = confirmPwEl.value;
  if (newPw.length < 8) { showAlert('newPwAlert', 'newPwAlertMsg', 'Password must be at least 8 characters.'); return; }
  if (newPw !== confirmPw) { showFieldError('confirmPwError', confirmPwEl); return; }

  setLoading('newPwBtn', true);
  try {
    const { error } = await adminClient.auth.updateUser({ password: newPw });
    if (error) { showAlert('newPwAlert', 'newPwAlertMsg', error.message); return; }
    showToastLogin('✅ Password updated! Redirecting…', 'success');
    setTimeout(() => window.location.href = getAdminPageUrl(), 1500);
  } catch (err) {
    showAlert('newPwAlert', 'newPwAlertMsg', 'Something went wrong.');
  } finally {
    setLoading('newPwBtn', false);
  }
}

function showToastLogin(message, type = 'info') {
  const toast = document.createElement('div');
  toast.style.cssText = `position:fixed; bottom:24px; right:24px; z-index:999; background:#1e2535; color:#fff; padding:12px 18px; border-radius:10px; font-size:13px; font-weight:500; box-shadow:0 4px 20px rgba(0,0,0,.2); border-left:3px solid ${type === 'success' ? '#4ade80' : '#60a5fa'}; animation:slideInToast .3s ease; font-family:'DM Sans',sans-serif;`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

window.addEventListener('DOMContentLoaded', async () => {
  const hash = window.location.hash;
  const params = new URLSearchParams(hash.replace('#', '?'));
  if (params.get('type') === 'recovery') { showView('viewNewPassword'); return; }
  try {
    const { data: { session } } = await adminClient.auth.getSession();
    if (session) {
      try {
        const { data: adminRecord } = await adminClient.from('admin_users').select('id, is_active').eq('user_id', session.user.id).maybeSingle();
        if (adminRecord?.is_active) showAdminApp();
      } catch (_) {}
    } else { showAdminAuth('viewLogin'); }
  } catch (_) {}
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const active = document.querySelector('.view.active')?.id;
  if (active === 'viewLogin') handleLogin();
  else if (active === 'viewForgot') handleForgot();
  else if (active === 'viewNewPassword') handleNewPassword();
});

// ── ADMIN DASHBOARD ──────────────────────────────────────────
let currentFilter = 'all', currentSort = 'newest', currentSearch = '', selectedId = null, modalCallback = null;
let incidents = [], currentAdmin = null, realtimeChannel = null, adminMapInstance = null;

window.addEventListener('DOMContentLoaded', async () => { await initAdmin(); });

async function initAdmin() {
  try {
    const adminState = await requireAdminSession();
    if (!adminState) return;
    currentAdmin = adminState.session.user;
    await loadAdminProfile();
    await loadIncidents();
    subscribeRealtime();
    updateStats(); renderIncidents();
  } catch (err) {
    console.warn('[AKSYON] Using demo data.');
    showAdminAuth('viewLogin');
    incidents = DEMO_INCIDENTS;
    updateStats(); renderIncidents();
    showToast('Running in demo mode.', 'info');
  }
}

async function loadAdminProfile() {
  try {
    const { data } = await adminClient.from('admin_users').select('full_name, role, avatar_url').eq('user_id', currentAdmin.id).single();
    if (data) {
      document.querySelector('.dispatcher-name').textContent = data.full_name || currentAdmin.email;
      if (data.avatar_url) {
        const av = document.querySelector('.dispatcher-avatar');
        av.innerHTML = `<img src="${data.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      }
    }
  } catch (_) {}
}

async function loadIncidents() {
  const { data, error } = await adminClient.from('reports').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  incidents = (data || []).map(normalizeIncident);
}

function normalizeIncident(row) {
  const statusMap = { pending: 'pending', inreview: 'inreview', inprogress: 'inprogress', forwarded: 'forwarded', resolved: 'resolved', false: 'false' };
  const priorityMap = { mataas: 'high', katamtaman: 'medium', mababa: 'low' };
  const locationText = typeof row.location === 'object' ? (row.location?.address || '—') : (row.location || '—');
  const latitude = typeof row.location === 'object' ? Number(row.location?.lat) : Number(row.lat);
  const longitude = typeof row.location === 'object' ? Number(row.location?.lng) : Number(row.lng);
  const attachments = Array.isArray(row.attachments) ? row.attachments : [];
  const primaryMedia = attachments.find(file => file?.url) || null;

  return {
    id: row.id, type: (row.category || row.type || 'REPORT').toUpperCase(),
    priority: priorityMap[String(row.urgency || row.priority || 'medium').toLowerCase()] || 'medium',
    status: statusMap[row.status] || 'pending',
    title: row.title || 'Incident Report', desc: row.detail || row.description || '',
    location: locationText, barangay: row.barangay || row.user_barangay || '—',
    reporter: row.user_name || row.reporter_name || 'Anonymous',
    contact: row.user_email || row.reporter_contact || '—',
    lat: Number.isFinite(latitude) ? latitude : null, lng: Number.isFinite(longitude) ? longitude : null,
    coords: Number.isFinite(latitude) && Number.isFinite(longitude) ? `${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E` : '—',
    time: timeAgo(row.created_at), icon: typeIcon(row.category || row.type), mediaClass: typeClass(row.category || row.type),
    photoUrl: primaryMedia?.url || row.photo_url || null,
    comments: Array.isArray(row.comments) ? row.comments : [], _raw: row,
  };
}

function subscribeRealtime() {
  realtimeChannel = adminClient.channel('reports-feed').on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, async (payload) => {
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
    updateStats(); renderIncidents();
  }).subscribe();
}

async function updateIncidentStatus(id, status) {
  if (!currentAdmin) {
    const inc = incidents.find(i => i.id === id);
    if (inc) inc.status = status;
    return;
  }
  const { error } = await adminClient.from('reports').update({
    status, updated_at: new Date().toISOString(),
    assigned_admin_id: currentAdmin.id, last_admin_action_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

function updateStats() {
  document.getElementById('statHigh').textContent = incidents.filter(i => i.priority === 'high' && i.status !== 'resolved').length;
  document.getElementById('statFalse').textContent = incidents.filter(i => i.status === 'false').length;
  document.getElementById('statProgress').textContent = incidents.filter(i => i.status === 'inreview' || i.status === 'inprogress' || i.status === 'forwarded').length;
  document.getElementById('statResolved').textContent = incidents.filter(i => i.status === 'resolved').length;

  const live = incidents.filter(i => i.status === 'pending' || i.status === 'inreview' || i.status === 'inprogress' || i.status === 'forwarded').length;
  document.getElementById('liveCount').textContent = live;
  document.getElementById('liveBadgeCount').textContent = live + ' Live';
  document.getElementById('pendingBadge').textContent = incidents.filter(i => i.status === 'pending').length;
  
  updateNotifications();
}

// ── NOTIFICATIONS LOGIC ──
function toggleNotifDropdown(e) {
  e.stopPropagation();
  document.getElementById('notifDropdown').classList.toggle('show');
}

document.addEventListener('click', (e) => {
  const dd = document.getElementById('notifDropdown');
  if (dd && dd.classList.contains('show') && !e.target.closest('.notif-container')) {
    dd.classList.remove('show');
  }
});

function updateNotifications() {
  const list = document.getElementById('notifList');
  const dot = document.getElementById('notifDot');
  if (!list || !dot) return;

  let notifs = [];
  incidents.forEach(i => {
    if (i.priority === 'high' && !['resolved', 'false'].includes(i.status)) {
      notifs.push({ text: `🚨 High Priority: ${i.title}`, time: new Date(i._raw.created_at).getTime(), id: i.id });
    }
    if (i.status === 'pending') {
      notifs.push({ text: `🆕 New Report: ${i.title}`, time: new Date(i._raw.created_at).getTime(), id: i.id });
    }
    if (i.comments && i.comments.length > 0) {
      const last = i.comments[i.comments.length - 1];
      if (!last.is_admin) {
        notifs.push({ text: `💬 New reply on: ${i.title}`, time: new Date(last.created_at).getTime(), id: i.id });
      }
    }
  });

  notifs.sort((a, b) => b.time - a.time);
  notifs = notifs.slice(0, 15);

  if (notifs.length > 0) {
    dot.style.display = 'block';
    list.innerHTML = notifs.map(n => `<div class="notif-item" onclick="openPanel('${n.id}')">${escapeHtml(n.text)}<span class="time">${timeAgo(new Date(n.time).toISOString())}</span></div>`).join('');
  } else {
    dot.style.display = 'none';
    list.innerHTML = `<div class="notif-empty">No new notifications</div>`;
  }
}

function getFiltered() {
  let list = [...incidents];
  
  if (currentFilter === 'pending') {
    list = list.filter(i => i.status === 'pending');
  } else if (currentFilter === 'inreview') {
    list = list.filter(i => ['inreview','inprogress','forwarded'].includes(i.status));
  } else if (currentFilter === 'resolved') {
    list = list.filter(i => i.status === 'resolved');
  } else if (currentFilter === 'false') {
    list = list.filter(i => i.status === 'false');
  } else {
    // If 'all', hide 'resolved' and 'false' from the main active feed
    list = list.filter(i => !['resolved', 'false'].includes(i.status));
  }

  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    list = list.filter(i => i.title.toLowerCase().includes(q) || i.type.toLowerCase().includes(q) || i.location.toLowerCase().includes(q) || i.reporter.toLowerCase().includes(q) || i.barangay.toLowerCase().includes(q));
  }
  
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  if (currentSort === 'priority') {
    list.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }
  
  return list;
}

function filterByType(type, el) { currentFilter = type; document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active')); el?.classList.add('active'); renderIncidents(); }
function sortBy(type, el) { currentSort = type; document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active')); el.classList.add('active'); renderIncidents(); }
function filterIncidents() { currentSearch = document.getElementById('searchInput').value; renderIncidents(); }

function renderIncidents() {
  const grid = document.getElementById('incidentsGrid');
  const list = getFiltered();
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-text">No reports found matching your criteria.</div></div>`;
    return;
  }
  
  grid.innerHTML = list.map((inc, idx) => `
    <div class="incident-card ${selectedId === inc.id ? 'selected' : ''}" style="animation-delay:${idx * 0.04}s" onclick="openPanel('${inc.id}')">
      <div class="card-media">
        <div class="media-img ${inc.mediaClass}" ${inc.photoUrl ? `style="background-image:url('${inc.photoUrl}');background-size:cover;background-position:center"` : ''}>
          <div class="card-type-badge">${inc.type}</div>
          ${!inc.photoUrl ? `<span style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))">${inc.icon}</span>` : ''}
        </div>
      </div>
      <div class="card-body">
        <div class="card-id-title">
          <div class="card-id">${inc.id}</div>
          <div class="card-title">${inc.title}</div>
        </div>
        <div style="flex: 1;"></div> 
        <div class="card-footer">
          <div class="card-meta">⏱️ ${inc.time}</div>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="badges">${priorityBadge(inc.priority)}${statusBadge(inc.status)}</div>
            <button class="view-btn">View Details →</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function priorityBadge(p) {
  if (p === 'high') return '<span class="badge high">High</span>';
  if (p === 'medium') return '<span class="badge medium">Medium</span>';
  return '<span class="badge low">Low</span>';
}

function statusBadge(s) {
  if (s === 'pending') return '<span class="badge pending">Pending</span>';
  if (s === 'resolved') return '<span class="badge resolved">Resolved</span>';
  if (s === 'inreview') return '<span class="badge inreview">Reviewed</span>';
  if (s === 'inprogress') return '<span class="badge inprogress">In Progress</span>';
  if (s === 'forwarded') return '<span class="badge forwarded">Forwarded</span>';
  if (s === 'false') return '<span class="badge false">False Report</span>';
  return '';
}

function setNav(el, section) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  
  const contentEl = document.querySelector('.content');
  const mainEl = document.querySelector('.main'); 

  closePanel();

  if (section === 'complaints') { 
    if(mainEl) mainEl.classList.remove('layout-full'); 
    currentFilter = 'all'; 
    document.getElementById('incidentsGridContainer').style.display = 'block';
    document.getElementById('customPageContainer').style.display = 'none';
    renderMainFeed(); 
    const firstChip = document.querySelector('.filter-chips .chip');
    if(firstChip) firstChip.click(); 
  } 
  else if (section === 'resolved') {
    if(mainEl) mainEl.classList.remove('layout-full'); 
    currentFilter = 'resolved'; 
    document.getElementById('incidentsGridContainer').style.display = 'block';
    document.getElementById('customPageContainer').style.display = 'none';
    renderMainFeed(); 
  }
  else if (section === 'false') {
    if(mainEl) mainEl.classList.remove('layout-full'); 
    currentFilter = 'false'; 
    document.getElementById('incidentsGridContainer').style.display = 'block';
    document.getElementById('customPageContainer').style.display = 'none';
    renderMainFeed(); 
  }
  else if (section === 'users') { 
    if(mainEl) mainEl.classList.add('layout-full');
    document.getElementById('incidentsGridContainer').style.display = 'none';
    document.getElementById('customPageContainer').style.display = 'block';
    renderSection(document.getElementById('customPageContainer'), buildUsersSection()); 
  } 
  else if (section === 'settings') { 
    if(mainEl) mainEl.classList.add('layout-full'); 
    document.getElementById('incidentsGridContainer').style.display = 'none';
    document.getElementById('customPageContainer').style.display = 'block';
    renderSection(document.getElementById('customPageContainer'), buildSettingsSection()); 
  }
}

let MAIN_FEED_HTML = '';
window.addEventListener('DOMContentLoaded', () => { setTimeout(() => { MAIN_FEED_HTML = document.querySelector('.content')?.innerHTML || ''; }, 0); });

function renderMainFeed() {
  const feedTitle = document.getElementById('mainFeedTitle');
  const filterChips = document.getElementById('mainFilterChips');
  
  if (currentFilter === 'resolved') {
    if(feedTitle) feedTitle.textContent = "Resolved Reports";
    if(filterChips) filterChips.style.display = "none";
  } else if (currentFilter === 'false') {
    if(feedTitle) feedTitle.textContent = "False / Invalid Reports";
    if(filterChips) filterChips.style.display = "none";
  } else {
    if(feedTitle) feedTitle.textContent = "Community Incident Reports";
    if(filterChips) filterChips.style.display = "flex";
  }

  updateStats(); renderIncidents();
}
function renderSection(container, html) { container.innerHTML = html; }

function buildUsersSection() { loadAdminUsers(); return `<div><div class="feed-header" style="margin-bottom:18px"><div class="feed-title">System Users (Development)</div></div><div id="usersTable"><div style="padding:40px;text-align:center;color:var(--gray-400)"><div style="font-size:28px;margin-bottom:8px">👥</div>Loading users…</div></div></div>`; }
let _adminUsers = [];
async function loadAdminUsers() {
  try {
    const { data, error } = await adminClient.from('admin_users').select('id, full_name, email, role, is_active, created_at').order('created_at', { ascending: false });
    if (error) throw error;
    _adminUsers = data || []; renderUsersTable(_adminUsers);
  } catch (err) { const el = document.getElementById('usersTable'); if (el) el.innerHTML = `<div style="padding:20px;color:var(--gray-500);text-align:center">Add admin via Database manually for now.</div>`; }
}
function renderUsersTable(users) {
  const el = document.getElementById('usersTable'); if (!el) return;
  if (!users.length) { el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--gray-400)">No admin users found.</div>`; return; }
  el.innerHTML = `<table style="width:100%;border-collapse:collapse;background:var(--white);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow-sm)"><thead><tr style="background:var(--gray-100);border-bottom:1.5px solid var(--gray-200)"><th style="${thStyle()}">Name</th><th style="${thStyle()}">Email</th><th style="${thStyle()}">Role</th><th style="${thStyle()}">Status</th><th style="${thStyle()}">Joined</th></tr></thead><tbody>${users.map(u => `<tr style="border-bottom:1px solid var(--gray-100)"><td style="${tdStyle()}"><strong>${u.full_name || '—'}</strong></td><td style="${tdStyle()};color:var(--gray-500)">${u.email}</td><td style="${tdStyle()}"><span style="background:var(--red-pale);color:var(--red);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600">${u.role || 'dispatcher'}</span></td><td style="${tdStyle()}"><span style="background:${u.is_active ? '#dcfce7' : '#f3f4f6'};color:${u.is_active ? '#15803d' : 'var(--gray-500)'};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600">${u.is_active ? '● Active' : '○ Inactive'}</span></td><td style="${tdStyle()};color:var(--gray-500);font-size:12px">${u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td></tr>`).join('')}</tbody></table>`;
}
function thStyle() { return 'padding:11px 16px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-500);text-align:left'; }
function tdStyle() { return 'padding:13px 16px;font-size:13px;color:var(--gray-800)'; }

function buildSettingsSection() {
  const adminEmail = currentAdmin?.email || '—';
  return `<div style="max-width:580px"><div class="feed-header" style="margin-bottom:20px"><div class="feed-title">Account Settings</div></div><div style="background:var(--white);border-radius:var(--radius);padding:22px;box-shadow:var(--shadow-sm);margin-bottom:16px;border:1.5px solid var(--gray-200)"><div style="font-family:'Syne',sans-serif;font-weight:700;font-size:14px;margin-bottom:16px;display:flex;align-items:center;gap:8px">👤 Account Info</div><div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-400);margin-bottom:5px">Logged in as</div><div style="font-size:13.5px;font-weight:600;color:var(--gray-800)">${adminEmail}</div></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="sort-btn active" onclick="handleSignOut()" style="background:#ef4444;border-color:#ef4444">🚪 Sign Out</button></div></div></div>`;
}

async function handleSignOut() {
  showModal('🚪', 'Sign Out?', 'Return to the login page.', 'Sign Out', '#ef4444', async () => {
    try { await adminClient.auth.signOut(); } catch (_) {}
    Object.keys(localStorage).forEach(key => { if (key.includes('aksyon-admin') || key.startsWith('sb-')) localStorage.removeItem(key); });
    window.location.reload();
  });
}

function openPanel(id) {
  const inc = incidents.find(i => i.id === id);
  if (!inc) return;

  selectedId = id;
  renderIncidents();

  document.getElementById('panelIcon').textContent   = inc.icon;
  document.getElementById('panelId').textContent     = inc.id + ' · ' + inc.type;
  document.getElementById('panelTitle').textContent  = inc.title;
  document.getElementById('panelBadges').innerHTML   = priorityBadge(inc.priority) + ' ' + statusBadge(inc.status);

  document.getElementById('panelCoords').textContent   = inc.coords;
  document.getElementById('panelTime').textContent     = inc.time;
  document.getElementById('panelDesc').textContent     = inc.desc;
  document.getElementById('panelReporter').textContent = inc.reporter;
  document.getElementById('panelContact').textContent  = inc.contact;
  document.getElementById('panelAddress').textContent  = inc.location;
  
  renderPanelMedia(inc);
  renderPanelComments(inc);
  
  const commentInput = document.getElementById('adminCommentInput');
  const commentBtn = commentInput?.nextElementSibling;

  // ── PHILIPPINE LGU WORKFLOW: STATE MACHINE BUTTONS ──
  const actionWrapper = document.querySelector('.panel-actions');
  if (actionWrapper) {
    const s = inc.status;
    const isPending = (s === 'pending');
    const isAck = (s === 'inreview'); 
    const isWorking = (s === 'inprogress' || s === 'forwarded');
    const isClosed = (s === 'resolved' || s === 'false');

    if (commentInput && commentBtn) {
      if (isClosed) {
        commentInput.disabled = true;
        commentInput.placeholder = "Comments are disabled for closed reports.";
        commentInput.style.background = "var(--gray-200)";
        commentBtn.style.display = "none";
      } else {
        commentInput.disabled = false;
        commentInput.placeholder = "Reply to the resident or post an update...";
        commentInput.style.background = "transparent";
        commentBtn.style.display = "block";
      }
      commentInput.value = '';
    }

    if (isClosed) {
      actionWrapper.innerHTML = `
        <div class="action-row" style="margin-top:8px;">
          <button onclick="closePanel()" style="flex:1; padding:12px; border-radius:9px; background:var(--gray-200); color:var(--gray-600); font-weight:600; font-size:13.5px; font-family:'DM Sans', sans-serif; border:none; cursor:pointer;">✖ Close Panel</button>
          <button onclick="deleteReport()" style="flex:1; padding:12px; border-radius:9px; background:var(--red-pale); color:var(--red); font-weight:600; font-size:13.5px; font-family:'DM Sans', sans-serif; border:1.5px solid var(--red); cursor:pointer;">🗑 Delete Report</button>
        </div>
        <div class="btn-dispatch-note" style="margin-top:8px;">This report is closed and locked for auditing.</div>
      `;
    } else {
      const btnAckHtml = `<button class="btn-review ${isPending ? '' : 'disabled'}" onclick="reviewIncident()">👀 Acknowledge Report</button>`;
      const btnProgHtml = `<button class="btn-inprogress ${isAck ? '' : 'disabled'}" onclick="markInProgress()">🚧 Mark as In-Progress</button>`;
      const btnFwdHtml = `<button class="btn-forward ${isAck ? '' : 'disabled'}" onclick="forwardAgency()">🏢 Forward to Agency</button>`;
      const btnResHtml = `<button class="btn-resolve ${isWorking ? '' : 'disabled'}" onclick="resolveIncident()">✅ Mark as Resolved</button>`;
      const btnFalseHtml = `<button class="btn-flag" onclick="flagIncident()">🚩 Flag as False</button>`;
      const btnDeleteHtml = `<button class="btn-delete" onclick="deleteReport()">🗑 Delete Report</button>`;

      actionWrapper.innerHTML = `
        <div class="action-row">${btnAckHtml} ${btnResHtml}</div>
        <div class="action-row" style="margin-top: 10px;">${btnProgHtml} ${btnFwdHtml}</div>
        <div class="action-row" style="margin-top: 10px;">${btnFalseHtml} ${btnDeleteHtml}</div>
        <div class="btn-dispatch-note" style="margin-top:12px;">Step-by-step enforcement active. You cannot skip standard operating procedures.</div>
      `;
    }
  }

  document.getElementById('detailOverlay').classList.add('open');
  document.getElementById('detailPanel').classList.add('open');
}

function closePanel() {
  selectedId = null; destroyAdminMap();
  document.getElementById('detailOverlay').classList.remove('open');
  document.getElementById('detailPanel').classList.remove('open');
  if (document.getElementById('incidentsGrid')) renderIncidents();
}
function destroyAdminMap() { if (adminMapInstance) { try { adminMapInstance.remove(); } catch (_) {} adminMapInstance = null; } }

function renderPanelMedia(inc) {
  const panelMedia = document.getElementById('panelMedia'), panelPhotos = document.getElementById('panelPhotos');
  if (!panelMedia) return;
  destroyAdminMap(); panelMedia.className = 'panel-media';

  if (Number.isFinite(inc.lat) && Number.isFinite(inc.lng) && window.L) {
    panelMedia.innerHTML = `<div id="adminMapCanvas" class="admin-map-canvas"></div><div class="map-placeholder" onclick="openSelectedMap()">🗺️ Open full map</div>`;
    requestAnimationFrame(() => {
      adminMapInstance = L.map('adminMapCanvas', { zoomControl: true, attributionControl: false, scrollWheelZoom: false }).setView([inc.lat, inc.lng], 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(adminMapInstance);
      L.marker([inc.lat, inc.lng]).addTo(adminMapInstance);
      L.circle([inc.lat, inc.lng], { radius: 45, color: '#7B1113', fillColor: '#7B1113', fillOpacity: 0.12, weight: 2 }).addTo(adminMapInstance);
      setTimeout(() => adminMapInstance?.invalidateSize(), 80);
    });
  } else { panelMedia.innerHTML = `<span style="font-size:52px;filter:drop-shadow(0 2px 8px rgba(0,0,0,.3))">${inc.icon}</span>`; }

  if (!panelPhotos) return;
  const attachments = Array.isArray(inc._raw?.attachments) ? inc._raw.attachments : [];
  const singlePhoto = !attachments.length && inc.photoUrl ? [{ url: inc.photoUrl, type: 'image/jpeg', name: 'Photo' }] : [];
  const allMedia = attachments.length ? attachments : singlePhoto;

  if (!allMedia.length) { panelPhotos.style.display = 'none'; panelPhotos.innerHTML = ''; return; }
  panelPhotos.style.display = 'block';
  panelPhotos.innerHTML = `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--gray-400);margin-bottom:10px;">📎 Attachments (${allMedia.length})</div><div style="display:flex;gap:10px;flex-wrap:wrap;padding-bottom:4px;">${allMedia.map((att, i) => {
    const isImg = att.type && String(att.type).startsWith('image/');
    const isVid = att.type && String(att.type).startsWith('video/');
    return `<div onclick="openAdminMediaViewer('${escapeHtml(att.url)}','${escapeHtml(att.type||'image/jpeg')}')" style="cursor:pointer;position:relative;width:90px;height:90px;border-radius:12px;overflow:hidden;border:2px solid var(--gray-200);background:var(--gray-100);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:var(--shadow-sm);transition:transform .15s;">${isImg ? `<img src="${escapeHtml(att.url)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='📎'">` : isVid ? `<div style="width:100%;height:100%;background:#1a1a1a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;"><span style="font-size:28px;">🎥</span><span style="font-size:9px;color:#aaa;font-weight:600;">VIDEO</span></div>` : `<span style="font-size:28px;">📎</span>`}<div style="position:absolute;inset:0;background:rgba(0,0,0,0);transition:background .15s;" onmouseenter="this.style.background='rgba(0,0,0,0.12)'" onmouseleave="this.style.background='rgba(0,0,0,0)'"></div></div>`;
  }).join('')}</div>`;
}

function openAdminMediaViewer(url, type) {
  const viewer = document.getElementById('adminMediaViewer'), content = document.getElementById('adminMediaViewerContent');
  if (!viewer || !content || !url) return;
  const isVid = String(type || '').startsWith('video/');
  content.innerHTML = isVid ? `<video controls autoplay playsinline src="${url}" style="max-width:100%;max-height:88vh;border-radius:12px;background:#111;"></video>` : `<img src="${url}" style="max-width:100%;max-height:88vh;border-radius:12px;background:#111;" onerror="window.open('${url}','_blank')">`;
  viewer.style.display = 'flex';
}
function closeAdminMediaViewer() {
  const viewer = document.getElementById('adminMediaViewer'), content = document.getElementById('adminMediaViewerContent');
  if (viewer) viewer.style.display = 'none';
  if (content) content.innerHTML = '';
}
function openSelectedMap() {
  if (!selectedId) return;
  const inc = incidents.find(i => i.id === selectedId);
  if (!inc || !Number.isFinite(inc.lat) || !Number.isFinite(inc.lng)) return;
  window.open(`https://maps.google.com/?q=${inc.lat},${inc.lng}`, '_blank');
}

function renderPanelComments(inc) {
  const panel = document.getElementById('panelComments');
  if (!panel) return;
  if (!Array.isArray(inc.comments) || !inc.comments.length) { panel.innerHTML = '<div style="padding:10px 12px;border-radius:10px;background:var(--gray-100);">No updates yet.</div>'; return; }
  panel.innerHTML = inc.comments.slice().sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)).map(comment => {
    const author = comment.is_admin ? 'LGU Admin' : (comment.user_name || 'Resident');
    const tone = comment.is_admin ? 'background:#fdf2f2;border:1px solid #fecaca;color:#7B1113;' : 'background:var(--gray-100);border:1px solid var(--gray-200);color:var(--gray-800);';
    return `<div style="${tone}padding:10px 12px;border-radius:10px;"><div style="font-weight:700;font-size:12px;margin-bottom:4px;">${author}</div><div style="line-height:1.5;">${escapeHtml(comment.text || '')}</div><div style="margin-top:6px;font-size:11px;opacity:.75;">${timeAgo(comment.created_at)}</div></div>`;
  }).join('');
}

async function sendAdminComment() {
  if (!selectedId || !currentAdmin) return;
  const input = document.getElementById('adminCommentInput');
  const text = input?.value.trim();
  if (!text) { showToast('Write an update first.', 'info'); return; }
  const inc = incidents.find(i => i.id === selectedId);
  if (!inc) return;

  const comments = Array.isArray(inc.comments) ? [...inc.comments] : [];
  comments.push({ user_id: currentAdmin.id, user_name: currentAdmin.email, text, is_admin: true, created_at: new Date().toISOString() });

  try {
    const { error } = await adminClient.from('reports').update({ comments, updated_at: new Date().toISOString(), assigned_admin_id: currentAdmin.id, last_admin_action_at: new Date().toISOString() }).eq('id', selectedId);
    if (error) throw error;
    inc.comments = comments; renderPanelComments(inc); input.value = ''; showToast('Update sent.', 'success');
  } catch (err) { showToast('Failed to send update.', 'error'); }
}

async function addAdminSystemComment(reportId, text) {
  const inc = incidents.find(item => item.id === reportId);
  if (!inc || !currentAdmin) return;
  const comments = Array.isArray(inc.comments) ? [...inc.comments] : [];
  comments.push({ user_id: currentAdmin.id, user_name: currentAdmin.email, text, is_admin: true, created_at: new Date().toISOString() });
  const { error } = await adminClient.from('reports').update({ comments, updated_at: new Date().toISOString(), assigned_admin_id: currentAdmin.id, last_admin_action_at: new Date().toISOString() }).eq('id', reportId);
  if (error) throw error;
  inc.comments = comments;
}

// ── STATE MACHINE ACTIONS ───────────────────────────────

function reviewIncident() {
  if (!selectedId) return;
  const inc = incidents.find(i => i.id === selectedId);
  if (!inc) return;

  showModal('👀', 'Acknowledge Report?',
    `Mark "${inc.title}" as verified and acknowledged by the Barangay.`,
    'Acknowledge', '#1a5276',
    async () => {
      try {
        await updateIncidentStatus(inc.id, 'inreview');
        await addAdminSystemComment(inc.id, 'Barangay has verified and acknowledged the report.');
        inc.status = 'inreview';
        updateStats(); renderIncidents(); openPanel(inc.id);
        showToast('👀 Report Acknowledged.', 'success');
      } catch (err) { showToast('Failed: ' + err.message, 'error'); }
    }
  );
}

function markInProgress() {
  if (!selectedId) return;
  const inc = incidents.find(i => i.id === selectedId);
  if (!inc) return;

  showModal('🚧', 'Mark as In-Progress?',
    `Deploy Barangay Personnel to take action on "${inc.title}".`,
    'Deploy Personnel', '#d97706',
    async () => {
      try {
        await updateIncidentStatus(inc.id, 'inprogress');
        await addAdminSystemComment(inc.id, 'Barangay personnel have been deployed. Work is currently in progress.');
        inc.status = 'inprogress';
        updateStats(); renderIncidents(); openPanel(inc.id); 
        showToast('🚧 Status updated to In-Progress.', 'success');
      } catch (err) { showToast('Update failed: ' + err.message, 'error'); }
    }
  );
}

function forwardAgency() {
  if (!selectedId) return;
  const inc = incidents.find(i => i.id === selectedId);
  if (!inc) return;

  showModal('🏢', 'Forward to Agency?',
    `Forward "${inc.title}" to higher agencies (City Engr, Meralco, Maynilad, etc.).`,
    'Forward Report', '#7e22ce',
    async () => {
      try {
        await updateIncidentStatus(inc.id, 'forwarded');
        await addAdminSystemComment(inc.id, 'Report forwarded to the appropriate municipal agency/utility provider.');
        inc.status = 'forwarded';
        updateStats(); renderIncidents(); openPanel(inc.id); 
        showToast('🏢 Report forwarded to agency.', 'success');
      } catch (err) { showToast('Update failed: ' + err.message, 'error'); }
    }
  );
}

function resolveIncident() {
  if (!selectedId) return;
  const inc = incidents.find(i => i.id === selectedId);

  showModal('✅', 'Resolve Incident?',
    `Confirm that "${inc.title}" has been completely resolved.`,
    'Yes, Resolve', '#2d7a3a',
    async () => {
      try {
        await updateIncidentStatus(inc.id, 'resolved');
        await addAdminSystemComment(inc.id, 'The issue has been marked as resolved. Thank you for your patience!');
        inc.status = 'resolved';
        updateStats(); renderIncidents(); openPanel(inc.id);
        showToast('✅ Resolved: ' + inc.id, 'success');
      } catch (err) { showToast('Failed to update.', 'error'); }
    }
  );
}

function flagIncident() {
  if (!selectedId) return;
  const inc = incidents.find(i => i.id === selectedId);
  showModal('🚩', 'Flag as False Report?',
    `Flag "${inc.title}" as a false or prank report?`,
    'Yes, Flag It', '#7e22ce',
    async () => {
      try {
        await updateIncidentStatus(inc.id, 'false');
        await addAdminSystemComment(inc.id, 'This report was flagged as invalid or a false alarm.');
        inc.status = 'false';
        updateStats(); renderIncidents(); openPanel(inc.id);
        showToast('🚩 Flagged: ' + inc.id, 'info');
      } catch (err) { showToast('Failed to update.', 'error'); }
    }
  );
}

function deleteReport() {
  if (!selectedId) return;
  const inc = incidents.find(i => i.id === selectedId);
  if (!inc) return;

  showModal('🗑️', 'Delete Report?',
    `Delete "${inc.title}" permanently? This action cannot be undone.`,
    'Delete', '#7B1113',
    async () => {
      try {
        const { error } = await adminClient.from('reports').delete().eq('id', inc.id);
        if (error) throw error;
        
        incidents = incidents.filter(i => i.id !== inc.id);
        updateStats(); 
        renderIncidents(); 
        closePanel();
        showToast('🗑️ Report deleted successfully.', 'success');
      } catch (err) { 
        showToast('Failed to delete report: ' + err.message, 'error'); 
      }
    }
  );
}

function showModal(icon, title, desc, confirmLabel, confirmColor, callback) {
  document.getElementById('modalIcon').textContent  = icon;
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalDesc').textContent  = desc;
  const btn = document.getElementById('modalConfirmBtn');
  btn.textContent = confirmLabel; btn.style.background = confirmColor; btn.style.color = '#fff';
  modalCallback = callback;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); modalCallback = null; }
function executeModalAction() { const act = modalCallback; closeModal(); if (act) act(); }
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`; toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
function escapeHtml(value) { return String(value || '').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"').replace(/'/g, ''); }
function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000), hr = Math.floor(diff / 3600000), day = Math.floor(diff / 86400000);
  if (min < 1) return 'Just now'; if (min < 60) return `${min} min${min > 1 ? 's' : ''} ago`;
  if (hr < 24) return `${hr} hour${hr > 1 ? 's' : ''} ago`; return `${day} day${day > 1 ? 's' : ''} ago`;
}
function typeIcon(type) {
  const t = (type || '').toUpperCase();
  if (t.includes('FIRE')) return '🔥'; if (t.includes('FLOOD') || t.includes('TUBIG') || t.includes('BAHA')) return '🌊';
  if (t.includes('MEDICAL')) return '🏥'; if (t.includes('TRAFFIC') || t.includes('ROAD') || t.includes('KALSADA')) return '🚧';
  if (t.includes('POWER') || t.includes('ILAW')) return '💡'; if (t.includes('GARBAGE') || t.includes('BASURA')) return '🗑️';
  return '📌';
}
function typeClass(type) {
  const t = (type || '').toUpperCase();
  if (t.includes('FIRE')) return 'scene'; if (t.includes('FLOOD')|| t.includes('TUBIG') || t.includes('BAHA')) return 'flood';
  if (t.includes('MEDICAL')) return 'flood'; if (t.includes('TRAFFIC') || t.includes('ROAD') || t.includes('KALSADA')) return 'road';
  if (t.includes('POWER') || t.includes('ILAW')) return 'power'; if (t.includes('GARBAGE') || t.includes('BASURA')) return 'garbage';
  return 'scene';
}
const DEMO_INCIDENTS = [];
const DEMO_BARANGAYS = [];
