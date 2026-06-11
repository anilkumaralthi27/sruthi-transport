// ── Auth ──────────────────────────────────────────────
const USERS = {
  'Sruthi': { pass: '123456', role: 'admin',     name: 'Sruthi',  initials: 'ST' },
  'ramu':   { pass: '123456', role: 'accountant', name: 'Ramu',    initials: 'RM' }
};

// Both roles now have access to ALL pages
const ROLE_PAGES = {
  admin:      ['dashboard','credit','pending','loads','allloads','drivers'],
  accountant: ['dashboard','credit','pending','loads','allloads','drivers']
};

// No view-only roles — both can add, edit, delete
const VIEW_ONLY_ROLES = [];

const AUTH_KEY  = 'st-auth-user';   // stores username
let   currentUser = null;           // { id, role, name, initials }

function checkAuth() {
  const saved = sessionStorage.getItem(AUTH_KEY);
  if (!saved) return false;
  try {
    currentUser = JSON.parse(saved);
    return !!currentUser;
  } catch { return false; }
}

function getRole() { return currentUser?.role || 'admin'; }
function isAdmin()  { return getRole() === 'admin'; }

function doLogin() {
  const id   = document.getElementById('loginId').value.trim();
  const pass = document.getElementById('loginPass').value;
  const btn  = document.getElementById('loginBtn');
  const card = document.getElementById('loginCard');

  showLoginError('');

  if (!id || !pass) {
    showLoginError('⚠️ Please enter both ID and password');
    return;
  }

  btn.disabled = true;
  document.getElementById('loginBtnText').style.display = 'none';
  document.getElementById('loginBtnSpinner').style.display = 'flex';

  setTimeout(() => {
    const userDef = USERS[id];

    if (userDef && pass === userDef.pass) {
      // Valid login — store user info in session
      currentUser = { id, role: userDef.role, name: userDef.name, initials: userDef.initials };
      sessionStorage.setItem(AUTH_KEY, JSON.stringify(currentUser));

      const screen = document.getElementById('loginScreen');
      screen.style.transition = 'opacity .5s ease';
      screen.style.opacity = '0';
      document.getElementById('appWrap').classList.remove('d-none');
      setTimeout(() => { screen.style.display = 'none'; }, 500);
      initApp();
    } else {
      btn.disabled = false;
      document.getElementById('loginBtnText').style.display = 'flex';
      document.getElementById('loginBtnSpinner').style.display = 'none';
      card.style.animation = 'none';
      card.offsetHeight;
      card.style.animation = 'shake .45s ease';
      const msg = !USERS[id] ? '⚠️ Invalid User ID' : '⚠️ Incorrect password';
      showLoginError(msg);
      document.getElementById('loginPass').value = '';
      document.getElementById('loginPass').focus();
    }
  }, 750);
}

function showLoginError(msg) {
  const el = document.getElementById('loginError');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('show', !!msg);
}

function doLogout() {
  sessionStorage.removeItem(AUTH_KEY);
  currentUser = null;
  document.getElementById('appWrap').classList.add('d-none');
  const screen = document.getElementById('loginScreen');
  screen.style.display = 'flex';
  screen.style.opacity  = '1';
  // Clear fields
  document.getElementById('loginId').value   = '';
  document.getElementById('loginPass').value = '';
  showLoginError('');
  // Reset button
  const btn = document.getElementById('loginBtn');
  if(btn) btn.disabled = false;
  document.getElementById('loginBtnText').style.display  = 'flex';
  document.getElementById('loginBtnSpinner').style.display = 'none';
  closeSidebar();
  // Reset nav history
  navHistory.length = 0;
  navIndex = -1;
  updateNavArrows();

  // Reset bottom nav
  document.querySelectorAll('.mbn-item').forEach(b => {
    b.classList.remove('active');
    b.style.display = 'flex';
  });
  document.querySelector('.mbn-item[data-page="dashboard"]')?.classList.add('active');
  setTimeout(() => document.getElementById('loginId')?.focus(), 100);
}

function togglePw() {
  const input = document.getElementById('loginPass');
  const icon  = document.getElementById('eyeIcon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'bi bi-eye-slash-fill';
  } else {
    input.type = 'password';
    icon.className = 'bi bi-eye-fill';
  }
}

/* ════════════════════════════════════════════════════
   SRUTHI TRANSPORT — app.js  (v2)
   5 Modules: Credit · Spending · Loads · All Loads · Drivers
   Features: Firebase/LS · CRUD · PDF · Pagination · Live Clock
════════════════════════════════════════════════════ */
'use strict';

// ── State ────────────────────────────────────────────
let db = null;
let useLS = false;
let delCb = null;
let pdfModule = '';

const data = {
  credit:   [],
  pending:  [],
  loads:    [],
  allLoads: [],
  drivers:  []
};

const pg = {
  credit:   { cur:1, per:8, list:[] },
  pending:  { cur:1, per:8, list:[] },
  loads:    { cur:1, per:8, list:[] },
  allLoads: { cur:1, per:8, list:[] },
  drivers:  { cur:1, per:8, list:[] }
};

// ── Init ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  if (checkAuth()) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appWrap').classList.remove('d-none');
    initApp();
  } else {
    setTimeout(() => document.getElementById('loginId')?.focus(), 400);
  }
});

function initApp() {
  applyRole();       // hide/show nav items based on role FIRST
  initFirebase();    // loads data automatically
  initNav();
  initTheme();
  initSidebar();
  setDates();
}

// ── Role-based UI ─────────────────────────────────────
function applyRole() {
  const role      = getRole();
  const allowed   = ROLE_PAGES[role] || ROLE_PAGES.admin;
  const viewOnly  = VIEW_ONLY_ROLES.includes(role);

  // 1. Show/hide sidebar nav items
  document.querySelectorAll('.nav-item[data-page]').forEach(a => {
    const page = a.dataset.page;
    a.style.display = allowed.includes(page) ? 'flex' : 'none';
  });

  // Both roles have full access — no view-only hiding needed

  // 3. Update user chip and role badge in topbar
  const chip = document.getElementById('userChip');
  if (chip) chip.textContent = currentUser?.initials || 'ST';

  const roleBadge = document.getElementById('roleBadge');
  if (roleBadge) {
    roleBadge.textContent = role === 'admin' ? '👑 Admin' : '📋 Accountant';
    roleBadge.className   = 'role-badge ' + (role === 'admin' ? 'rb-admin' : 'rb-accountant');
  }

  // 4. Show/hide mobile bottom nav items based on role
  document.querySelectorAll('.mbn-item[data-page]').forEach(b => {
    const pg = b.dataset.page;
    b.style.display = allowed.includes(pg) ? 'flex' : 'none';
  });

  // 5. Navigate to first allowed page
  const firstPage = allowed[0] || 'dashboard';
  setTimeout(() => go(firstPage), 50);
}

// ── Live Clock ────────────────────────────────────────
function initClock() {
  function tick() {
    const now = new Date();
    const de = document.getElementById('topDate');
    const te = document.getElementById('topTime');
    if (de) de.textContent = now.toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
    if (te) te.textContent = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true });
  }
  tick();
  setInterval(tick, 1000);
}

// ── Firebase ──────────────────────────────────────────
function initFirebase() {
  const cfg = window.__ST_FIREBASE_CONFIG__;
  const isDemo = !cfg || cfg.apiKey.includes('PASTE') || cfg.apiKey.trim() === '';
  if (isDemo) { fallbackLS(); return; }
  try {
    firebase.initializeApp(cfg);
    db = firebase.firestore();
    setDbStatus('firebase');
    toast('🔥 Firebase connected', 'ok');
    loadAll();
  } catch(e) {
    console.warn('Firebase error:', e);
    fallbackLS();
  }
}

function fallbackLS() {
  useLS = true;
  setDbStatus('local');
  toast('📦 Using local storage', 'warn');
  loadFromLS();
}

function setDbStatus(mode) {
  const el = document.getElementById('dbStatus');
  const lb = document.getElementById('dbLabel');
  if (!el || !lb) return;
  el.className = mode === 'firebase' ? 'db-status' : 'db-status local';
  lb.textContent = mode === 'firebase' ? 'Firebase Connected' : 'Local Storage';
}

// ── Navigation history (back/forward) ────────────────────────
const navHistory = [];
let   navIndex   = -1;

function navPush(page) {
  if (navIndex < navHistory.length - 1) navHistory.splice(navIndex + 1);
  if (navHistory[navIndex] !== page) {
    navHistory.push(page);
    navIndex = navHistory.length - 1;
  }
  updateNavArrows();
}

function navBack() {
  if (navIndex > 0) { navIndex--; go(navHistory[navIndex], true); updateNavArrows(); }
}

function navForward() {
  if (navIndex < navHistory.length - 1) { navIndex++; go(navHistory[navIndex], true); updateNavArrows(); }
}

function updateNavArrows() {
  const back    = document.getElementById('btnBack');
  const forward = document.getElementById('btnForward');
  if (back)    back.disabled    = navIndex <= 0;
  if (forward) forward.disabled = navIndex >= navHistory.length - 1;
}

// ── Navigation ────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-item').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      go(a.dataset.page);
      if (window.innerWidth < 992) closeSidebar();
    });
  });
}

function go(page, skipHistory = false) {
  // Guard: redirect unauthorised pages to first allowed page
  const allowed = ROLE_PAGES[getRole()] || ROLE_PAGES.admin;
  if (!allowed.includes(page)) {
    page = allowed[0] || 'dashboard';
  }

  document.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  document.querySelectorAll('.page').forEach(s => s.classList.toggle('active', s.id === `page-${page}`));
  const titles = {
    dashboard:'Dashboard', credit:'Credit Amount', pending:'Spending Amount',
    loads:'Loads to Saburi', allloads:'All Loads', drivers:'Driver Attendance'
  };
  document.getElementById('pageTitle').textContent = titles[page] || page;

  // Sync mobile bottom nav
  document.querySelectorAll('.mbn-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));

  // Push to navigation history
  if (!skipHistory) navPush(page);

  // Scroll to top on mobile page change
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (page === 'dashboard') refreshDash();
}

// ── Mobile bottom nav handler ─────────────────────────
function mbnGo(el, page) {
  go(page);
  closeSidebar();
}

// ── Sidebar ───────────────────────────────────────────
function initSidebar() {
  document.getElementById('hamburger')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('show');
  });
  document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);
}
function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('show');
}

// ── Theme ─────────────────────────────────────────────
function initTheme() {
  applyTheme(localStorage.getItem('st-theme') || 'light');
  document.getElementById('themeBtn')?.addEventListener('click', () =>
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
}
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('st-theme', t);
  const icon = document.getElementById('themeIcon');
  const lbl  = document.getElementById('themeLabel');
  if (t === 'dark') { icon?.classList.replace('bi-moon-stars-fill','bi-sun-fill'); if(lbl) lbl.textContent='Light Mode'; }
  else              { icon?.classList.replace('bi-sun-fill','bi-moon-stars-fill'); if(lbl) lbl.textContent='Dark Mode'; }
}

// ── Default dates ─────────────────────────────────────
function setDates() {
  const t = new Date().toISOString().slice(0,10);
  ['fCreditDate','fPendDate','fLoadsDate','fAllDate','fDriverDate'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = t;
  });
}
function today() { return new Date().toISOString().slice(0,10); }

// ── Load all ──────────────────────────────────────────
async function loadAll() {
  spin(true);
  await Promise.all(['credit','pending','loads','allLoads','drivers'].map(fetchCol));
  spin(false);
  refreshDash();
}

async function fetchCol(name) {
  try {
    const snap = await db.collection(name).orderBy('createdAt','desc').get();
    data[name] = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    render(name);
  } catch(e) { console.error(e); toast(`⚠️ Could not load ${name}`, 'err'); }
}

function loadFromLS() {
  ['credit','pending','loads','allLoads','drivers'].forEach(n => {
    try { data[n] = JSON.parse(localStorage.getItem(`st-${n}`) || '[]'); } catch { data[n]=[]; }
    render(n);
  });
  refreshDash();
}
function saveLS(name) { try { localStorage.setItem(`st-${name}`, JSON.stringify(data[name])); } catch {} }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ── Open Modals ───────────────────────────────────────
function openModal(name, rec = null) {
  if (name === 'credit') {
    document.getElementById('creditId').value    = rec?.id || '';
    document.getElementById('fCreditCo').value   = rec?.company || '';
    document.getElementById('fCreditDate').value = rec?.date || today();
    document.getElementById('fCreditAmt').value  = rec?.amount || '';
    document.getElementById('fCreditAcc').value  = rec?.account || '';
    document.getElementById('creditModalTitle').textContent = rec ? 'Edit Credit Entry' : 'Add Credit Entry';
    new bootstrap.Modal(document.getElementById('creditModal')).show();

  } else if (name === 'pending') {
    document.getElementById('pendingId').value   = rec?.id || '';
    document.getElementById('fPendName').value   = rec?.name || '';
    document.getElementById('fPendAmt').value    = rec?.amount || '';
    document.getElementById('fPendDate').value   = rec?.date || today();
    document.getElementById('fPendReason').value = rec?.reason || '';
    document.getElementById('pendingModalTitle').textContent = rec ? 'Edit Spending Entry' : 'Add Spending Entry';
    new bootstrap.Modal(document.getElementById('pendingModal')).show();

  } else if (name === 'loads') {
    document.getElementById('loadsId').value     = rec?.id || '';
    document.getElementById('fLoadsDate').value  = rec?.date || today();
    document.getElementById('fLoadsVeh').value   = rec?.vehicle || '';
    document.getElementById('fLoadsWt').value    = rec?.weight || '';
    document.getElementById('fLoadsRate').value  = rec?.rate || '';
    document.getElementById('calcResult').textContent = rec ? '₹ '+fmt(rec.weight*rec.rate) : '₹ 0.00';
    document.getElementById('loadsModalTitle').textContent = rec ? 'Edit Load Entry' : 'Add Load Entry';
    new bootstrap.Modal(document.getElementById('loadsModal')).show();

  } else if (name === 'allLoads') {
    document.getElementById('allLoadsId').value        = rec?.id || '';
    document.getElementById('fAllDate').value          = rec?.date || today();
    document.getElementById('fAllVehicle').value       = rec?.vehicle || '';
    document.getElementById('fDriverName').value       = rec?.driverName || '';
    document.getElementById('fDriverBeta').value       = rec?.driverBeta || '';
    document.getElementById('fFromPlace').value        = rec?.fromPlace || '';
    document.getElementById('fToPlace').value          = rec?.toPlace || '';
    document.getElementById('fFuel').value             = rec?.fuel || '';
    document.getElementById('fPartyPerson').value      = rec?.partyPerson || '';
    document.getElementById('fLoadingPerson').value    = rec?.loadingPerson || '';
    document.getElementById('fAllWeight').value        = rec?.weight || '';
    document.getElementById('fAllRate').value          = rec?.rate || '';
    document.getElementById('calcAllResult').textContent = rec ? '₹ '+fmt(rec.weight*rec.rate) : '₹ 0.00';
    document.getElementById('allLoadsModalTitle').textContent = rec ? 'Edit Load Entry' : 'Add Load Entry';
    new bootstrap.Modal(document.getElementById('allLoadsModal')).show();

  } else if (name === 'drivers') {
    document.getElementById('driversId').value      = rec?.id || '';
    document.getElementById('fDriverDate').value    = rec?.date || today();
    document.getElementById('fDriverName2').value   = rec?.driverName || '';
    document.getElementById('fDriverStatus').value  = rec?.status || 'Present';
    document.getElementById('driversModalTitle').textContent = rec ? 'Edit Attendance' : 'Add Attendance';
    new bootstrap.Modal(document.getElementById('driversModal')).show();
  }
}

// ── SAVE — Credit ─────────────────────────────────────
async function saveCredit() {
  const id      = document.getElementById('creditId').value;
  const company = document.getElementById('fCreditCo').value;
  const date    = document.getElementById('fCreditDate').value;
  const amount  = parseFloat(document.getElementById('fCreditAmt').value);
  const account = document.getElementById('fCreditAcc').value.trim();
  if (!company || !date || isNaN(amount) || amount<=0 || !account) { toast('⚠️ Fill all required fields','warn'); return; }
  await upsert('credit', id, { company, date, amount, account, createdAt:new Date().toISOString() });
  bootstrap.Modal.getInstance(document.getElementById('creditModal'))?.hide();
}

// ── SAVE — Spending ───────────────────────────────────
async function savePending() {
  const id     = document.getElementById('pendingId').value;
  const name   = document.getElementById('fPendName').value.trim();
  const amount = parseFloat(document.getElementById('fPendAmt').value);
  const date   = document.getElementById('fPendDate').value;
  const reason = document.getElementById('fPendReason').value.trim();
  if (!name || isNaN(amount) || amount<=0 || !date || !reason) { toast('⚠️ Fill all required fields','warn'); return; }
  await upsert('pending', id, { name, amount, date, reason, createdAt:new Date().toISOString() });
  bootstrap.Modal.getInstance(document.getElementById('pendingModal'))?.hide();
}

// ── SAVE — Loads to Saburi ────────────────────────────
async function saveLoad() {
  const id      = document.getElementById('loadsId').value;
  const date    = document.getElementById('fLoadsDate').value;
  const vehicle = document.getElementById('fLoadsVeh').value.trim().toUpperCase();
  const weight  = parseFloat(document.getElementById('fLoadsWt').value);
  const rate    = parseFloat(document.getElementById('fLoadsRate').value);
  if (!date || !vehicle || isNaN(weight) || weight<=0 || isNaN(rate) || rate<=0) { toast('⚠️ Fill all required fields','warn'); return; }
  await upsert('loads', id, { date, vehicle, weight, rate, total:weight*rate, createdAt:new Date().toISOString() });
  bootstrap.Modal.getInstance(document.getElementById('loadsModal'))?.hide();
}

// ── SAVE — All Loads ──────────────────────────────────
async function saveAllLoad() {
  const id          = document.getElementById('allLoadsId').value;
  const date        = document.getElementById('fAllDate').value;
  const vehicle     = document.getElementById('fAllVehicle').value.trim().toUpperCase();
  const driverName  = document.getElementById('fDriverName').value.trim();
  const driverBeta  = parseFloat(document.getElementById('fDriverBeta').value) || 0;
  const fromPlace   = document.getElementById('fFromPlace').value.trim();
  const toPlace     = document.getElementById('fToPlace').value.trim();
  const fuel        = parseFloat(document.getElementById('fFuel').value) || 0;
  const partyPerson    = document.getElementById('fPartyPerson').value.trim();
  const loadingPerson  = document.getElementById('fLoadingPerson').value.trim();
  const weight      = parseFloat(document.getElementById('fAllWeight').value);
  const rate        = parseFloat(document.getElementById('fAllRate').value);
  if (!date || !vehicle || !driverName || !fromPlace || !toPlace || isNaN(weight) || weight<=0 || isNaN(rate) || rate<=0) {
    toast('⚠️ Fill all required fields (Date, Vehicle, Driver, From, To, Weight, Rate)','warn'); return;
  }
  await upsert('allLoads', id, { date, vehicle, driverName, driverBeta, fromPlace, toPlace, fuel, partyPerson, loadingPerson, weight, rate, total:weight*rate, createdAt:new Date().toISOString() });
  bootstrap.Modal.getInstance(document.getElementById('allLoadsModal'))?.hide();
}

// ── SAVE — Drivers ────────────────────────────────────
async function saveDriver() {
  const id         = document.getElementById('driversId').value;
  const date       = document.getElementById('fDriverDate').value;
  const driverName = document.getElementById('fDriverName2').value.trim();
  const status     = document.getElementById('fDriverStatus').value;
  if (!date || !driverName || !status) { toast('⚠️ Fill all required fields','warn'); return; }
  await upsert('drivers', id, { date, driverName, status, createdAt:new Date().toISOString() });
  bootstrap.Modal.getInstance(document.getElementById('driversModal'))?.hide();
}

// ── Calc helpers ──────────────────────────────────────
function calcTotal() {
  const w = parseFloat(document.getElementById('fLoadsWt').value)||0;
  const r = parseFloat(document.getElementById('fLoadsRate').value)||0;
  document.getElementById('calcResult').textContent = '₹ '+fmt(w*r);
}
function calcAllTotal() {
  const w = parseFloat(document.getElementById('fAllWeight').value)||0;
  const r = parseFloat(document.getElementById('fAllRate').value)||0;
  document.getElementById('calcAllResult').textContent = '₹ '+fmt(w*r);
}

// ── Generic upsert ────────────────────────────────────
async function upsert(name, id, rec) {
  spin(true);
  try {
    if (useLS) {
      if (id) { const i=data[name].findIndex(r=>r.id===id); if(i!==-1) data[name][i]={...data[name][i],...rec}; }
      else data[name].unshift({ id:genId(), ...rec });
      saveLS(name);
    } else {
      if (id) { await db.collection(name).doc(id).update(rec); const i=data[name].findIndex(r=>r.id===id); if(i!==-1) data[name][i]={id,...rec}; }
      else { const ref=await db.collection(name).add(rec); data[name].unshift({ id:ref.id, ...rec }); }
    }
    render(name); refreshDash();
    toast(id ? '✏️ Updated successfully' : '✅ Saved successfully', 'ok');
  } catch(e) { console.error(e); toast('❌ Save failed — check console','err'); }
  finally { spin(false); }
}

// ── Delete ────────────────────────────────────────────
function askDelete(name, id) {
  delCb = () => doDelete(name, id);
  const m = new bootstrap.Modal(document.getElementById('deleteModal'));
  m.show();
  document.getElementById('confirmDelBtn').onclick = () => { m.hide(); delCb?.(); delCb=null; };
}
async function doDelete(name, id) {
  spin(true);
  try {
    if (useLS) { data[name]=data[name].filter(r=>r.id!==id); saveLS(name); }
    else { await db.collection(name).doc(id).delete(); data[name]=data[name].filter(r=>r.id!==id); }
    render(name); refreshDash();
    toast('🗑️ Deleted successfully','ok');
  } catch(e) { console.error(e); toast('❌ Delete failed','err'); }
  finally { spin(false); }
}

// ── Filter + render ───────────────────────────────────
function filterAndRender(name) { pg[name].cur=1; render(name); }

function filtered(name) {
  const q  = (document.getElementById(`${name}Search`)?.value||'').toLowerCase();
  const co = document.getElementById('creditCo')?.value||'';
  const ds = document.getElementById('driverStatusFilter')?.value||'';

  return data[name].filter(r => {
    let txt='';
    if(name==='credit')   txt=`${r.company} ${r.account} ${r.date} ${r.amount}`;
    if(name==='pending')  txt=`${r.name} ${r.reason} ${r.date} ${r.amount}`;
    if(name==='loads')    txt=`${r.vehicle} ${r.date} ${r.weight} ${r.rate}`;
    if(name==='allLoads') txt=`${r.vehicle} ${r.driverName} ${r.fromPlace} ${r.toPlace} ${r.partyPerson} ${r.loadingPerson} ${r.date}`;
    if(name==='drivers')  txt=`${r.driverName} ${r.status} ${r.date}`;
    let ok = txt.toLowerCase().includes(q);
    if(name==='credit'  && co) ok = ok && r.company===co;
    if(name==='drivers' && ds) ok = ok && r.status===ds;
    return ok;
  }).sort((a,b) => new Date(b.date)-new Date(a.date));
}

// ── Render tables ─────────────────────────────────────
function render(name) {
  const rows = filtered(name);
  pg[name].list = rows;
  const { cur, per } = pg[name];
  const slice = rows.slice((cur-1)*per, cur*per);
  const offset = (cur-1)*per;
  if(name==='credit')   renderCredit(slice, offset);
  if(name==='pending')  renderPending(slice, offset);
  if(name==='loads')    renderLoads(slice, offset);
  if(name==='allLoads') renderAllLoads(slice, offset);
  if(name==='drivers')  renderDrivers(slice, offset);
  renderPg(name, rows.length);
  renderTotals(name, rows);
}

function renderCredit(rows, off) {
  const b=document.getElementById('creditBody'); if(!b) return;
  if(!rows.length) { b.innerHTML=emptyRow(6); return; }
  b.innerHTML=rows.map((r,i)=>`<tr>
    <td class="mono" style="color:var(--muted)">${off+i+1}</td>
    <td><span class="badge-s ${r.company==='Saburi'?'bs-saburi':'bs-other'}">${r.company}</span></td>
    <td>${fmtDate(r.date)}</td>
    <td class="c-green">₹ ${fmt(r.amount)}</td>
    <td>${r.account}</td>
    <td><button class="abtn abtn-edit me-1" onclick='openModal("credit",${js(r)})'><i class="bi bi-pencil-fill"></i></button><button class="abtn abtn-del" onclick='askDelete("credit","${r.id}")'><i class="bi bi-trash3-fill"></i></button></td>
  </tr>`).join('');
}

function renderPending(rows, off) {
  const b=document.getElementById('pendingBody'); if(!b) return;
  if(!rows.length) { b.innerHTML=emptyRow(6); return; }
  b.innerHTML=rows.map((r,i)=>`<tr>
    <td class="mono" style="color:var(--muted)">${off+i+1}</td>
    <td><strong>${r.name}</strong></td>
    <td class="c-red">₹ ${fmt(r.amount)}</td>
    <td>${fmtDate(r.date)}</td>
    <td style="max-width:180px;white-space:normal;font-size:12.5px;color:var(--muted)">${r.reason}</td>
    <td><button class="abtn abtn-edit me-1" onclick='openModal("pending",${js(r)})'><i class="bi bi-pencil-fill"></i></button><button class="abtn abtn-del" onclick='askDelete("pending","${r.id}")'><i class="bi bi-trash3-fill"></i></button></td>
  </tr>`).join('');
}

function renderLoads(rows, off) {
  const b=document.getElementById('loadsBody'); if(!b) return;
  if(!rows.length) { b.innerHTML=emptyRow(7); return; }
  b.innerHTML=rows.map((r,i)=>`<tr>
    <td class="mono" style="color:var(--muted)">${off+i+1}</td>
    <td>${fmtDate(r.date)}</td>
    <td class="mono" style="letter-spacing:.06em">${r.vehicle}</td>
    <td class="mono">${r.weight} T</td>
    <td class="mono">₹ ${fmt(r.rate)}</td>
    <td class="c-green">₹ ${fmt(r.total||r.weight*r.rate)}</td>
    <td><button class="abtn abtn-edit me-1" onclick='openModal("loads",${js(r)})'><i class="bi bi-pencil-fill"></i></button><button class="abtn abtn-del" onclick='askDelete("loads","${r.id}")'><i class="bi bi-trash3-fill"></i></button></td>
  </tr>`).join('');
}

function renderAllLoads(rows, off) {
  const b=document.getElementById('allLoadsBody'); if(!b) return;
  if(!rows.length) { b.innerHTML=emptyRow(9); return; }
  b.innerHTML=rows.map((r,i)=>`<tr>
    <td class="mono" style="color:var(--muted)">${off+i+1}</td>
    <td>${fmtDate(r.date)}</td>
    <td class="mono" style="letter-spacing:.06em">${r.vehicle}</td>
    <td><strong>${r.driverName}</strong></td>
    <td style="color:var(--muted);font-size:12.5px">${r.fromPlace}</td>
    <td style="color:var(--muted);font-size:12.5px">${r.toPlace}</td>
    <td class="mono">${r.weight} T</td>
    <td class="c-green">₹ ${fmt(r.total||r.weight*r.rate)}</td>
    <td><button class="abtn abtn-edit me-1" onclick='openModal("allLoads",${js(r)})'><i class="bi bi-pencil-fill"></i></button><button class="abtn abtn-del" onclick='askDelete("allLoads","${r.id}")'><i class="bi bi-trash3-fill"></i></button></td>
  </tr>`).join('');
}

function renderDrivers(rows, off) {
  const b=document.getElementById('driversBody'); if(!b) return;
  if(!rows.length) { b.innerHTML=emptyRow(5); return; }
  b.innerHTML=rows.map((r,i)=>`<tr>
    <td class="mono" style="color:var(--muted)">${off+i+1}</td>
    <td>${fmtDate(r.date)}</td>
    <td><strong>${r.driverName}</strong></td>
    <td>${statusBadge(r.status)}</td>
    <td><button class="abtn abtn-edit me-1" onclick='openModal("drivers",${js(r)})'><i class="bi bi-pencil-fill"></i></button><button class="abtn abtn-del" onclick='askDelete("drivers","${r.id}")'><i class="bi bi-trash3-fill"></i></button></td>
  </tr>`).join('');
}

function statusBadge(s) {
  const cls = s==='Present' ? 'sb-present' : s==='Absent' ? 'sb-absent' : 'sb-available';
  const icon = s==='Present' ? '✅' : s==='Absent' ? '❌' : '🔵';
  return `<span class="status-badge ${cls}">${icon} ${s}</span>`;
}

function emptyRow(cols) {
  return `<tr class="empty-row"><td colspan="${cols}"><i class="bi bi-inbox"></i><br/>No records found</td></tr>`;
}
function js(r) { return JSON.stringify(r).replace(/'/g,"&#39;"); }

// ── Totals ────────────────────────────────────────────
function renderTotals(name, rows) {
  if(name==='credit') {
    set('creditTotal','₹ '+fmt(rows.reduce((s,r)=>s+(+r.amount||0),0)));
  } else if(name==='pending') {
    set('pendingTotal','₹ '+fmt(rows.reduce((s,r)=>s+(+r.amount||0),0)));
  } else if(name==='loads') {
    set('loadsTotalW', rows.reduce((s,r)=>s+(+r.weight||0),0).toFixed(2)+' T');
    set('loadsTotalA','₹ '+fmt(rows.reduce((s,r)=>s+(+(r.total||r.weight*r.rate)||0),0)));
  } else if(name==='allLoads') {
    set('allLoadsTotalW', rows.reduce((s,r)=>s+(+r.weight||0),0).toFixed(2)+' T');
    set('allLoadsTotalA','₹ '+fmt(rows.reduce((s,r)=>s+(+(r.total||r.weight*r.rate)||0),0)));
  } else if(name==='drivers') {
    set('countPresent', rows.filter(r=>r.status==='Present').length);
    set('countAbsent',  rows.filter(r=>r.status==='Absent').length);
  }
}

// ── Pagination ────────────────────────────────────────
function renderPg(name, total) {
  const el=document.getElementById(`${name}Pg`); if(!el) return;
  const {cur,per}=pg[name];
  const pages=Math.ceil(total/per);
  if(pages<=1) { el.innerHTML=''; return; }
  const range=pageRange(cur,pages);
  let h=`<button class="pgbtn" ${cur===1?'disabled':''} onclick="goPage('${name}',${cur-1})"><i class="bi bi-chevron-left"></i></button>`;
  range.forEach(p=>{
    if(p==='…') h+=`<button class="pgbtn" disabled>…</button>`;
    else h+=`<button class="pgbtn ${p===cur?'active':''}" onclick="goPage('${name}',${p})">${p}</button>`;
  });
  h+=`<button class="pgbtn" ${cur===pages?'disabled':''} onclick="goPage('${name}',${cur+1})"><i class="bi bi-chevron-right"></i></button>`;
  el.innerHTML=h;
}
function pageRange(cur,total) {
  if(total<=7) return Array.from({length:total},(_,i)=>i+1);
  if(cur<=4)  return [1,2,3,4,5,'…',total];
  if(cur>=total-3) return [1,'…',total-4,total-3,total-2,total-1,total];
  return [1,'…',cur-1,cur,cur+1,'…',total];
}
function goPage(name,p) {
  pg[name].cur=p; render(name);
  document.getElementById(`${name}Body`)?.closest('.glass-card')?.scrollIntoView({behavior:'smooth',block:'start'});
}

// ── Dashboard ─────────────────────────────────────────
function refreshDash() {
  set('d-credit',  '₹ '+fmt(data.credit.reduce((s,r)=>s+(+r.amount||0),0)));
  // Saburi loads amount (from loads collection where all are Saburi)
  const saburiAmt = data.loads.reduce((s,r)=>s+(+(r.total||r.weight*r.rate)||0),0);
  set('d-saburi-amt','₹ '+fmt(saburiAmt));
  set('d-pending', '₹ '+fmt(data.pending.reduce((s,r)=>s+(+r.amount||0),0)));
  set('d-loads',   data.loads.length);
  set('d-weight',  data.loads.reduce((s,r)=>s+(+r.weight||0),0).toFixed(2)+' T');
  set('d-allloads',data.allLoads.length);

  // Present today
  const todayStr = new Date().toISOString().slice(0,10);
  set('d-drivers', data.drivers.filter(r=>r.date===todayStr && r.status==='Present').length);

  // Recent credits
  const rc=document.getElementById('d-recent-credit');
  if(rc) {
    const items=data.credit.slice(0,5);
    rc.innerHTML = items.length
      ? items.map(r=>`<div class="ri"><div><div class="ri-name">${r.account}</div><div class="ri-sub">${r.company} · ${fmtDate(r.date)}</div></div><div class="ri-amt">₹ ${fmt(r.amount)}</div></div>`).join('')
      : '<div class="empty-ri">No credit records yet</div>';
  }

  // Recent all loads
  const rl=document.getElementById('d-recent-allloads');
  if(rl) {
    const items=data.allLoads.slice(0,5);
    rl.innerHTML = items.length
      ? items.map(r=>`<div class="ri"><div><div class="ri-name">${r.vehicle} <span style="font-weight:400;color:var(--muted)">— ${r.driverName}</span></div><div class="ri-sub">${fmtDate(r.date)} · ${r.fromPlace} → ${r.toPlace}</div></div><div class="ri-amt">₹ ${fmt(r.total||r.weight*r.rate)}</div></div>`).join('')
      : '<div class="empty-ri">No load records yet</div>';
  }
}

// ── PDF Filter ────────────────────────────────────────
function openPdfFilter(name) {
  pdfModule = name;
  // Set modal label
  const labels = {
    credit:'Credit Amount', pending:'Spending Amount',
    loads:'Loads to Saburi', allLoads:'All Loads', drivers:'Driver Attendance'
  };
  const lbl = document.getElementById('pdfModalLabel');
  if(lbl) lbl.textContent = labels[name] || name;
  // Reset to current month selected
  document.querySelectorAll('.pdf-opt').forEach(el => {
    el.classList.toggle('selected', el.dataset.val === 'current');
  });
  document.getElementById('customDates').classList.remove('show');
  new bootstrap.Modal(document.getElementById('pdfModal')).show();
}

function selectPdfOpt(el) {
  document.querySelectorAll('.pdf-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  const cd = document.getElementById('customDates');
  if(el.dataset.val === 'custom') cd.classList.add('show');
  else cd.classList.remove('show');
}

// toggleCustomDates replaced by selectPdfOpt card UI

function downloadFilteredPDF() {
  // Read selected card value
  const selected = document.querySelector('.pdf-opt.selected');
  const type = selected ? selected.dataset.val : 'all';
  let rows = filtered(pdfModule);
  const now = new Date();

  if(type === 'current') {
    rows = rows.filter(r => {
      const d = new Date(r.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  } else if(type === 'lastmonth') {
    const lm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const ly = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    rows = rows.filter(r => {
      const d = new Date(r.date);
      return d.getMonth() === lm && d.getFullYear() === ly;
    });
  } else if(type === 'custom') {
    const fv = document.getElementById('fromDate').value;
    const tv = document.getElementById('toDate').value;
    if(!fv || !tv) { toast('⚠️ Select both From and To dates','warn'); return; }
    const from = new Date(fv);
    const to   = new Date(tv); to.setHours(23,59,59);
    rows = rows.filter(r => { const d = new Date(r.date); return d >= from && d <= to; });
  }
  // all = no filter

  if(!rows.length) { toast('⚠️ No records found for selected range','warn'); return; }
  bootstrap.Modal.getInstance(document.getElementById('pdfModal'))?.hide();
  exportPDF(pdfModule, rows);
}

// ── PDF Export ────────────────────────────────────────
function exportPDF(name, customRows=null) {
  const { jsPDF } = window.jspdf;
  const doc   = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const rows  = customRows || filtered(name);
  const now   = new Date();
  const dStr  = now.toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});

  // Header
  doc.setFillColor(11,20,55); doc.rect(0,0,210,34,'F');
  doc.setTextColor(245,158,11); doc.setFontSize(20); doc.setFont('helvetica','bold');
  doc.text('SRUTHI TRANSPORT',14,13);
  doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text('Management System',14,20);
  const titles={credit:'Credit Amount Report',pending:'Spending Amount Report',loads:'Loads to Saburi Report',allLoads:'All Loads Report',drivers:'Driver Attendance Report'};
  doc.setFontSize(12); doc.setFont('helvetica','bold');
  doc.text(titles[name]||name, 14,28);
  doc.setTextColor(180,190,210); doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text(`Generated: ${dStr}`, 196,28,{align:'right'});

  // Summary
  doc.setFillColor(240,242,250); doc.roundedRect(14,38,182,16,3,3,'F');
  doc.setTextColor(11,20,55); doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text(`Total Records: ${rows.length}`, 20,47);
  if(name==='credit')   doc.text(`Grand Total: INR ${fmt(rows.reduce((s,r)=>s+(+r.amount||0),0))}`,110,47);
  if(name==='pending')  doc.text(`Total Spending: INR ${fmt(rows.reduce((s,r)=>s+(+r.amount||0),0))}`,110,47);
  if(name==='loads'||name==='allLoads') {
    const tw=rows.reduce((s,r)=>s+(+r.weight||0),0);
    const ta=rows.reduce((s,r)=>s+(+(r.total||r.weight*r.rate)||0),0);
    doc.text(`Total Weight: ${tw.toFixed(2)} T`, 70,47);
    doc.text(`Total Amt: INR ${fmt(ta)}`, 130,47);
  }
  if(name==='drivers') {
    doc.text(`Present: ${rows.filter(r=>r.status==='Present').length}`, 80,47);
    doc.text(`Absent: ${rows.filter(r=>r.status==='Absent').length}`, 130,47);
  }

  // Table
  let cols, body;
  if(name==='credit')  { cols=['#','Company','Date','Amount (INR)','To Whom']; body=rows.map((r,i)=>[i+1,r.company,fmtDate(r.date),fmt(r.amount),r.account]); }
  else if(name==='pending') { cols=['#','Name','Amount (INR)','Date','Reason']; body=rows.map((r,i)=>[i+1,r.name,fmt(r.amount),fmtDate(r.date),r.reason]); }
  else if(name==='loads') { cols=['#','Date','Vehicle','Weight (T)','Rate/Ton','Total (INR)']; body=rows.map((r,i)=>[i+1,fmtDate(r.date),r.vehicle,r.weight,fmt(r.rate),fmt(r.total||r.weight*r.rate)]); }
  else if(name==='allLoads') { cols=['#','Date','Vehicle','Driver','From','To','Wt (T)','Total (INR)']; body=rows.map((r,i)=>[i+1,fmtDate(r.date),r.vehicle,r.driverName,r.fromPlace,r.toPlace,r.weight,fmt(r.total||r.weight*r.rate)]); }
  else if(name==='drivers') { cols=['#','Date','Driver Name','Status']; body=rows.map((r,i)=>[i+1,fmtDate(r.date),r.driverName,r.status]); }

  doc.autoTable({
    head:[cols], body, startY:58, margin:{left:14,right:14},
    headStyles:{ fillColor:[11,20,55], textColor:[245,158,11], fontStyle:'bold', fontSize:8.5 },
    bodyStyles:{ fontSize:8.5, textColor:[20,30,60] },
    alternateRowStyles:{ fillColor:[247,249,253] },
    styles:{ cellPadding:3.5, lineColor:[215,220,235], lineWidth:.2 },
    columnStyles:{ 0:{ halign:'center', cellWidth:10 } }
  });

  // Footer
  const pc=doc.internal.getNumberOfPages();
  for(let i=1;i<=pc;i++) {
    doc.setPage(i);
    doc.setFillColor(11,20,55); doc.rect(0,287,210,10,'F');
    doc.setTextColor(170,180,205); doc.setFontSize(7);
    doc.text('Sruthi Transport Management System',14,293);
    doc.text(`Page ${i} of ${pc}`,196,293,{align:'right'});
  }
  const fname={credit:'credit',pending:'spending',loads:'loads-saburi',allLoads:'all-loads',drivers:'driver-attendance'};
  doc.save(`sruthi-${fname[name]||name}-${now.toISOString().slice(0,10)}.pdf`);
  toast('📄 PDF exported!','ok');
}

// ── Helpers ───────────────────────────────────────────
function fmt(n) { return parseFloat(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtDate(d) {
  if(!d) return '—';
  try { const [y,m,day]=d.split('-'); return `${day} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]} ${y}`; }
  catch { return d; }
}
function set(id,val) { const e=document.getElementById(id); if(e) e.textContent=val; }
function spin(show)  { document.getElementById('spinner')?.classList.toggle('d-none',!show); }
function toast(msg, type='ok') {
  const el=document.getElementById('toast'), body=document.getElementById('toastBody');
  if(!el||!body) return;
  const color={ok:'var(--green)',warn:'var(--amber)',err:'var(--red)'}[type]||'var(--green)';
  el.style.borderLeft=`4px solid ${color}`;
  body.innerHTML=msg;
  bootstrap.Toast.getOrCreateInstance(el,{delay:3200}).show();
}


// ── Dashboard card navigation ──────────────────────────
function dashGo(page) {
  const allowed = ROLE_PAGES[getRole()] || ROLE_PAGES.admin;
  if (allowed.includes(page)) go(page);
}


// ══════════════════════════════════════════════════════
//  SABURI LOADS BAR CHART — month-wise
// ══════════════════════════════════════════════════════
let saburiChartInst = null;
let chartMetric = 'amount';   // 'amount' | 'weight' | 'trips'
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Called from refreshDash and year/metric selectors
function buildChart() {
  const canvas = document.getElementById('saburiChart');
  const wrap   = document.getElementById('chartWrap');
  const emptyMsg = document.getElementById('chartEmptyMsg');
  if (!canvas) return;

  const loads = data.loads || [];

  // ── Populate year dropdown ──
  const yearSel = document.getElementById('chartYearSelect');
  if (yearSel) {
    const years = [...new Set(loads.map(r => r.date?.slice(0,4)).filter(Boolean))].sort().reverse();
    if (years.length === 0) years.push(String(new Date().getFullYear()));
    // Only rebuild options if they differ
    const existing = [...yearSel.options].map(o => o.value);
    if (JSON.stringify(existing) !== JSON.stringify(years)) {
      yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    }
  }

  const selectedYear = yearSel ? yearSel.value : String(new Date().getFullYear());

  // ── Filter by selected year ──
  const yearLoads = loads.filter(r => r.date?.startsWith(selectedYear));

  // ── Aggregate by month ──
  const byMonth = Array(12).fill(null).map(() => ({ amount:0, weight:0, trips:0 }));
  yearLoads.forEach(r => {
    const m = parseInt((r.date || '').slice(5,7), 10) - 1;
    if (m < 0 || m > 11) return;
    byMonth[m].amount += parseFloat(r.total || (r.weight * r.rate) || 0);
    byMonth[m].weight += parseFloat(r.weight || 0);
    byMonth[m].trips  += 1;
  });

  // ── Check empty ──
  const hasData = byMonth.some(m => m[chartMetric] > 0);
  if (!hasData) {
    if (wrap)     wrap.style.display = 'none';
    if (emptyMsg) emptyMsg.style.display = 'block';
    if (saburiChartInst) { saburiChartInst.destroy(); saburiChartInst = null; }
    return;
  }
  if (wrap)     wrap.style.display = 'block';
  if (emptyMsg) emptyMsg.style.display = 'none';

  // ── Build datasets ──
  const metricLabels = { amount:'Amount (₹)', weight:'Weight (T)', trips:'Trips' };
  const rawValues    = byMonth.map(m => parseFloat(m[chartMetric].toFixed(2)));

  // Color: amber gradient using opacity per bar (lighter on zero, fuller on peak)
  const maxVal  = Math.max(...rawValues, 1);
  const bgColors = rawValues.map(v => {
    const alpha = v === 0 ? 0.06 : 0.18 + (v / maxVal) * 0.72;
    return `rgba(245,158,11,${alpha.toFixed(2)})`;
  });
  const borderColors = rawValues.map(v =>
    v === 0 ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.85)'
  );

  // Theme detection for text/grid colours
  const isDark  = document.documentElement.dataset.theme === 'dark';
  const txtCol  = isDark ? 'rgba(180,195,230,0.75)' : 'rgba(60,80,120,0.70)';
  const gridCol = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const zeroCol = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';

  // ── Format axis tick ──
  function fmtTick(v) {
    if (chartMetric === 'amount') {
      if (v >= 1_00_000) return '₹' + (v/1_00_000).toFixed(1) + 'L';
      if (v >= 1000)     return '₹' + (v/1000).toFixed(0) + 'K';
      return '₹' + v;
    }
    if (chartMetric === 'weight') return v + ' T';
    return v;
  }

  // ── Format tooltip ──
  function fmtTooltip(v) {
    if (chartMetric === 'amount')  return '₹ ' + parseFloat(v).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2});
    if (chartMetric === 'weight')  return v + ' Tonnes';
    return v + ' trips';
  }

  const chartConfig = {
    type: 'bar',
    data: {
      labels: MONTHS,
      datasets: [{
        label: metricLabels[chartMetric],
        data: rawValues,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500, easing: 'easeInOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? '#0f1e3a' : '#ffffff',
          titleColor: isDark ? '#e2e8f0' : '#0f172a',
          bodyColor: isDark ? '#94a3b8' : '#475569',
          borderColor: isDark ? '#1c2d50' : '#dde1ef',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            title: ctx => MONTHS[ctx[0].dataIndex] + ' ' + selectedYear,
            label: ctx => '  ' + metricLabels[chartMetric] + ': ' + fmtTooltip(ctx.raw)
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: txtCol,
            font: { family: "'Outfit',sans-serif", size: 12, weight: '500' },
            autoSkip: false,
            maxRotation: 0,
          }
        },
        y: {
          grid: { color: gridCol, lineWidth: 1 },
          border: { display: false, dash: [4,4] },
          beginAtZero: true,
          ticks: {
            color: txtCol,
            font: { family: "'Outfit',sans-serif", size: 11 },
            maxTicksLimit: 6,
            callback: v => fmtTick(v)
          }
        }
      },
      interaction: { intersect: false, mode: 'index' }
    }
  };

  // ── Create or update chart ──
  if (saburiChartInst) {
    saburiChartInst.data = chartConfig.data;
    saburiChartInst.options = chartConfig.options;
    saburiChartInst.update('none');
  } else {
    saburiChartInst = new Chart(canvas, chartConfig);
  }

  // ── Build summary legend below chart ──
  buildChartLegend(byMonth, selectedYear);
}

function buildChartLegend(byMonth, year) {
  const el = document.getElementById('chartLegend');
  if (!el) return;
  const totalAmt    = byMonth.reduce((s,m) => s+m.amount, 0);
  const totalWeight = byMonth.reduce((s,m) => s+m.weight, 0);
  const totalTrips  = byMonth.reduce((s,m) => s+m.trips, 0);
  const peakIdx     = byMonth.reduce((bi,m,i,arr) => m[chartMetric] > arr[bi][chartMetric] ? i : bi, 0);

  el.innerHTML = `
    <span class="cleg-pill cleg-amber">₹ ${(totalAmt/100000).toFixed(2)}L total</span>
    <span class="cleg-pill cleg-blue">${totalWeight.toFixed(1)} T</span>
    <span class="cleg-pill cleg-green">${totalTrips} trips</span>
    ${totalTrips > 0 ? `<span class="cleg-pill cleg-purple">Peak: ${MONTHS[peakIdx]}</span>` : ''}
  `;
}

function switchMetric(btn, metric) {
  chartMetric = metric;
  document.querySelectorAll('.chart-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  buildChart();
}

// Re-build chart when theme changes
const _origApplyTheme = applyTheme;
applyTheme = function(t) {
  _origApplyTheme(t);
  if (saburiChartInst) {
    setTimeout(buildChart, 50);
  }
};
