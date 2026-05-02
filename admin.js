window.__adminBooted = true;
const SUPABASE_URL = "https://dugzytiyhyafdrhisjqg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_nQN9DQBb7nwR1A6iYH52pQ_jCROHCGS";

const adminClient = window.supabase?.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
const ADMIN_TABLE = 'admin_users';

function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  document.querySelectorAll('.alert').forEach(a => a.classList.remove('show'));
}

function showAlert(alertId, msgId, message) {
  const el = document.getElementById(alertId), msg = document.getElementById(msgId);
  if (el && msg) { msg.textContent = message; el.classList.add('show'); }
}

async function handleLogin() {
  const email = document.getElementById('emailInput').value.trim(), pw = document.getElementById('passwordInput').value;
  if (!email || !pw) return;
  document.getElementById('loginBtn').classList.add('loading');
  try {
    const { data, error } = await adminClient.auth.signInWithPassword({ email, password: pw });
    if (error) { showAlert('loginAlert', 'loginAlertMsg', 'Invalid credentials.'); return; }
    const { data: adminRecord } = await adminClient.from(ADMIN_TABLE).select('is_active').eq('user_id', data.user.id).single();
    if (!adminRecord?.is_active) { await adminClient.auth.signOut(); showAlert('loginAlert', 'loginAlertMsg', 'Access Denied.'); return; }
    window.location.reload();
  } catch (err) { showAlert('loginAlert', 'loginAlertMsg', 'Server Error.'); } 
  finally { document.getElementById('loginBtn').classList.remove('loading'); }
}

let currentFilter = 'all', currentSort = 'newest', currentSearch = '', selectedId = null, modalCallback = null;
let incidents = [], currentAdmin = null, realtimeChannel = null, adminMapInstance = null;

window.addEventListener('DOMContentLoaded', async () => {
  if (!adminClient) return;
  const { data: { session } } = await adminClient.auth.getSession();
  if (!session) { document.getElementById('adminAppShell').style.display='none'; return; }
  currentAdmin = session.user;
  document.getElementById('adminAuthShell').style.display = 'none';
  document.getElementById('adminAppShell').classList.remove('admin-app-hidden');
  
  await loadIncidents();
  updateStats(); renderIncidents();
  subscribeRealtime();
});

async function loadIncidents() {
  const { data } = await adminClient.from('reports').select('*').order('created_at', { ascending: false });
  incidents = (data || []).map(r => {
    const loc = typeof r.location === 'object' ? r.location : {};
    return {
      id: r.id, type: (r.category || 'REPORT').toUpperCase(), priority: r.urgency === 'Mataas' ? 'high' : r.urgency === 'Mababa' ? 'low' : 'medium',
      status: r.status || 'pending', title: r.title || 'Incident', desc: r.detail || '',
      location: loc.address || '—', lat: Number(loc.lat||r.lat), lng: Number(loc.lng||r.lng),
      reporter: r.user_name || 'Anonymous', contact: r.user_email || '—',
      time: timeAgo(r.created_at), comments: r.comments || [], _raw: r
    };
  });
}

function subscribeRealtime() {
  realtimeChannel = adminClient.channel('reports-feed').on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, async () => {
    await loadIncidents(); updateStats(); renderIncidents();
    if (selectedId) openPanel(selectedId);
  }).subscribe();
}

function updateStats() {
  document.getElementById('statHigh').textContent = incidents.filter(i => i.priority === 'high' && i.status !== 'resolved').length;
  document.getElementById('statFalse').textContent = incidents.filter(i => i.status === 'false').length;
  document.getElementById('statProgress').textContent = incidents.filter(i => ['inreview','inprogress','forwarded'].includes(i.status)).length;
  document.getElementById('statResolved').textContent = incidents.filter(i => i.status === 'resolved').length;
  document.getElementById('liveCount').textContent = incidents.filter(i => i.status !== 'resolved' && i.status !== 'false').length;
  document.getElementById('pendingBadge').textContent = incidents.filter(i => i.status === 'pending').length;
  updateNotifications(); // Trigger dropdown content update
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
  const list = document.getElementById('notifList'), dot = document.getElementById('notifDot');
  if (!list || !dot) return;

  let notifs = [];
  // High Priority
  incidents.filter(i => i.priority === 'high' && !['resolved','false'].includes(i.status))
    .forEach(i => notifs.push({ text: `🚨 High Priority: ${i.title}`, time: new Date(i._raw.created_at).getTime(), id: i.id }));
  // New Pending
  incidents.filter(i => i.status === 'pending')
    .forEach(i => notifs.push({ text: `🆕 New Report: ${i.title}`, time: new Date(i._raw.created_at).getTime(), id: i.id }));
  // User Comments
  incidents.forEach(i => {
    if (i.comments?.length > 0) {
      const last = i.comments[i.comments.length - 1];
      if (!last.is_admin) notifs.push({ text: `💬 New reply on: ${i.title}`, time: new Date(last.created_at).getTime(), id: i.id });
    }
  });

  notifs.sort((a,b) => b.time - a.time);
  notifs = notifs.slice(0, 15);

  if (notifs.length > 0) {
    dot.style.display = 'block';
    list.innerHTML = notifs.map(n => `<div class="notif-item" onclick="openPanel('${n.id}')">${n.text}<span class="time">${timeAgo(new Date(n.time).toISOString())}</span></div>`).join('');
  } else {
    dot.style.display = 'none';
    list.innerHTML = `<div class="notif-empty">No new notifications</div>`;
  }
}

// ── NAVIGATION (FULL PAGE TOGGLE) ──
function setNav(el, section) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  const mainEl = document.querySelector('.main'), contentEl = document.querySelector('.content');
  closePanel();

  if (section === 'complaints') { 
    mainEl.classList.remove('layout-full'); currentFilter = 'all'; 
    renderMainFeed(); document.querySelector('.filter-chips .chip').click(); 
  } 
  else if (section === 'false') {
    mainEl.classList.remove('layout-full'); currentFilter = 'false'; 
    renderMainFeed(); document.querySelectorAll('.filter-chips .chip').forEach(c=>c.classList.remove('active'));
  }
  else if (section === 'users') { 
    mainEl.classList.add('layout-full'); renderSection(contentEl, `<div class="feed-title">System Users (Development)</div>`); 
  } 
  else if (section === 'settings') { 
    mainEl.classList.add('layout-full'); renderSection(contentEl, `<div class="feed-title">Account Settings</div><button onclick="adminClient.auth.signOut().then(()=>window.location.reload())" style="padding:10px;background:#c0392b;color:#fff;border:none;border-radius:5px;cursor:pointer;">Sign Out</button>`); 
  }
}

let MAIN_FEED_HTML = '';
window.addEventListener('DOMContentLoaded', () => { setTimeout(() => { MAIN_FEED_HTML = document.querySelector('.content')?.innerHTML || ''; }, 0); });
function renderMainFeed() {
  const contentEl = document.querySelector('.content');
  if (!document.getElementById('incidentsGrid')) contentEl.innerHTML = MAIN_FEED_HTML;
  updateStats(); renderIncidents();
}
function renderSection(container, html) { container.innerHTML = html; }

function filterByType(type, el) { currentFilter = type; document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active')); el?.classList.add('active'); renderIncidents(); }
function sortBy(type, el) { currentSort = type; document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active')); el.classList.add('active'); renderIncidents(); }
function filterIncidents() { currentSearch = document.getElementById('searchInput').value; renderIncidents(); }

function renderIncidents() {
  const grid = document.getElementById('incidentsGrid');
  let list = [...incidents];
  
  if (currentFilter === 'pending') list = list.filter(i => i.status === 'pending');
  else if (currentFilter === 'inreview') list = list.filter(i => ['inreview','inprogress','forwarded'].includes(i.status));
  else if (currentFilter === 'resolved') list = list.filter(i => i.status === 'resolved');
  else if (currentFilter === 'false') list = list.filter(i => i.status === 'false');

  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    list = list.filter(i => i.title.toLowerCase().includes(q) || i.id.toLowerCase().includes(q));
  }
  if (currentSort === 'priority') {
    const p = { high: 0, medium: 1, low: 2 };
    list.sort((a, b) => p[a.priority] - p[b.priority]);
  }

  if (!list.length) { grid.innerHTML = `<div class="empty-state">No reports found.</div>`; return; }
  
  grid.innerHTML = list.map(inc => `
    <div class="incident-card ${selectedId === inc.id ? 'selected' : ''}" onclick="openPanel('${inc.id}')">
      <div class="card-media"><div class="media-img scene">📋</div></div>
      <div class="card-body">
        <div class="card-id">${inc.id}</div><div class="card-title">${inc.title}</div>
        <div style="flex:1"></div>
        <div class="card-footer">
          <div class="card-meta">⏱️ ${inc.time}</div>
          <div class="badges">
            <span class="badge ${inc.priority}">${inc.priority}</span>
            <span class="badge ${inc.status}">${inc.status}</span>
          </div>
        </div>
      </div>
    </div>`).join('');
}

// ── DETAIL PANEL & MAP ──
function openPanel(id) {
  const inc = incidents.find(i => i.id === selectedId = id);
  if (!inc) return;
  renderIncidents();
  
  document.getElementById('panelId').textContent = inc.id;
  document.getElementById('panelTitle').textContent = inc.title;
  document.getElementById('panelCoords').textContent = inc.coords;
  document.getElementById('panelTime').textContent = inc.time;
  document.getElementById('panelDesc').textContent = inc.desc;
  document.getElementById('panelReporter').textContent = inc.reporter;
  document.getElementById('panelContact').textContent = inc.contact;
  document.getElementById('panelAddress').textContent = inc.location;
  
  // State Machine Buttons
  const wrapper = document.querySelector('.panel-actions');
  if (wrapper) {
    const s = inc.status, isPend = (s==='pending'), isAck = (s==='inreview'), isWork = (s==='inprogress'||s==='forwarded');
    if (s === 'resolved' || s === 'false') {
      wrapper.innerHTML = `<div class="action-row"><button onclick="closePanel()" style="flex:1;padding:12px;border-radius:9px;background:var(--gray-200);border:none;cursor:pointer;">✖ Close Panel</button></div>`;
    } else {
      wrapper.innerHTML = `
        <div class="action-row">
          <button class="btn-review ${isPend?'':'disabled'}" onclick="updateStatus('${inc.id}','inreview','Acknowledged')">👀 Acknowledge</button>
          <button class="btn-resolve ${isWork?'':'disabled'}" onclick="updateStatus('${inc.id}','resolved','Resolved')">✅ Resolve</button>
        </div>
        <div class="action-row" style="margin-top:10px;">
          <button class="btn-inprogress ${isAck?'':'disabled'}" onclick="updateStatus('${inc.id}','inprogress','In-Progress')">🚧 In-Progress</button>
          <button class="btn-forward ${isAck?'':'disabled'}" onclick="updateStatus('${inc.id}','forwarded','Forwarded')">🏢 Forward</button>
        </div>
        <div class="action-row" style="margin-top:10px;"><button class="btn-flag" onclick="updateStatus('${inc.id}','false','Flagged as False')">🚩 Flag False</button></div>
      `;
    }
  }

  // Comments
  document.getElementById('panelComments').innerHTML = inc.comments.length ? 
    inc.comments.map(c => `<div style="padding:10px;background:${c.is_admin?'#fdf2f2':'var(--gray-100)'};border-radius:8px;margin-bottom:8px;"><b>${c.is_admin?'LGU':c.user_name}</b><br>${c.text}</div>`).join('') 
    : 'No updates.';

  document.getElementById('detailOverlay').classList.add('open');
  document.getElementById('detailPanel').classList.add('open');

  // MAP
  if (adminMapInstance) { adminMapInstance.remove(); adminMapInstance = null; }
  document.getElementById('panelMedia').innerHTML = `<div id="adminMapCanvas" class="admin-map-canvas"></div>`;
  if (inc.lat && window.L) {
    setTimeout(() => {
      adminMapInstance = L.map('adminMapCanvas', { zoomControl:false }).setView([inc.lat, inc.lng], 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(adminMapInstance);
      L.marker([inc.lat, inc.lng]).addTo(adminMapInstance);
    }, 100);
  }
}

function closePanel() {
  selectedId = null; 
  document.getElementById('detailOverlay').classList.remove('open');
  document.getElementById('detailPanel').classList.remove('open');
  if (adminMapInstance) { adminMapInstance.remove(); adminMapInstance = null; }
  renderIncidents();
}

async function updateStatus(id, status, msg) {
  if (document.querySelector('.disabled:hover')) return; // Prevent clicks on disabled
  try {
    const inc = incidents.find(i => i.id === id);
    const comments = [...inc.comments, { user_id: currentAdmin.id, user_name: 'LGU', text: msg, is_admin: true, created_at: new Date().toISOString() }];
    await adminClient.from('reports').update({ status, comments }).eq('id', id);
    showToast(`Status updated: ${msg}`, 'success');
  } catch (err) { showToast('Error updating status', 'error'); }
}

async function sendAdminComment() {
  const input = document.getElementById('adminCommentInput'), text = input.value.trim();
  if (!text || !selectedId) return;
  try {
    const inc = incidents.find(i => i.id === selectedId);
    const comments = [...inc.comments, { user_id: currentAdmin.id, user_name: 'LGU', text, is_admin: true, created_at: new Date().toISOString() }];
    await adminClient.from('reports').update({ comments }).eq('id', selectedId);
    input.value = ''; showToast('Update sent', 'success');
  } catch (err) { showToast('Failed to send', 'error'); }
}

function showToast(msg, type='info') {
  const c = document.getElementById('toastContainer'), t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg; c.appendChild(t); setTimeout(()=>t.remove(), 3000);
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime(), m = Math.floor(diff/60000), h = Math.floor(diff/3600000);
  if (m < 1) return 'Just now'; if (m < 60) return `${m}m ago`; if (h < 24) return `${h}h ago`; return `${Math.floor(diff/86400000)}d ago`;
}
