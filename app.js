'use strict';
/* ═══════════════════════════════════════════════════════════
   SRUTHI TRANSPORT — app.js  (clean, bug-free build)
   Modules: Credit · Spending · Loads · All Loads · Drivers · Driver Expenses
   Auth: Admin (Sruthi) · Accountant (ramu)
═══════════════════════════════════════════════════════════ */

// ── Record cache (safe edit — no JSON-in-HTML) ─────────────
const _editCache = {};

// ── Users & roles ──────────────────────────────────────────
const USERS = {
  'Sruthi': { pass: '2266',   role: 'admin',      name: 'Sruthi', initials: 'ST' },
  'ramu':   { pass: '123456', role: 'accountant',  name: 'Ramu',   initials: 'RM' }
};
const ROLE_PAGES = {
  admin:      ['dashboard','credit','pending','loads','allloads','drivers','driverexp'],
  accountant: ['allloads','drivers','driverexp']
};
const AUTH_KEY   = 'st-auth-user';
let   currentUser = null;

function checkAuth() {
  const s = sessionStorage.getItem(AUTH_KEY);
  if (!s) return false;
  try { currentUser = JSON.parse(s); return !!currentUser; } catch { return false; }
}
function getRole()  { return currentUser?.role || 'admin'; }
function isAdmin()  { return getRole() === 'admin'; }
function firstPage(){ return getRole() === 'admin' ? 'dashboard' : 'allloads'; }

// ── App state ──────────────────────────────────────────────
let db  = null;
let useLS = false;
let delCb = null;
let pdfModule = '';
let allLoadsPdfView = 'both';

const data = { credit:[], pending:[], loads:[], allLoads:[], drivers:[], driverexp:[] };
const pg   = {
  credit:   { cur:1, per:8, list:[] },
  pending:  { cur:1, per:8, list:[] },
  loads:    { cur:1, per:8, list:[] },
  allLoads: { cur:1, per:8, list:[] },
  drivers:  { cur:1, per:8, list:[] },
  driverexp:{ cur:1, per:8, list:[] }
};

// ── Constants ──────────────────────────────────────────────
const DRIVER_NAMES    = ['P Satish','A Sanker','B Srinu','D Srinu','K Surinarayana','N Santhosh','G Kanaka'];
const BASE_SALARY     = 10000;
const DAILY_ALLOWANCE = 500;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Saburi chart ───────────────────────────────────────────
let saburiChartInst = null;
let chartMetric = 'amount';

// ── Nav history ────────────────────────────────────────────
const navHistory = [];
let   navIndex   = -1;

// ══════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initRememberMe();
  if (checkAuth()) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appWrap').classList.remove('d-none');
    initApp();
  } else {
    setTimeout(() => document.getElementById('loginId')?.focus(), 400);
  }
});

function initApp() {
  applyRole();
  initFirebase();
  initNav();
  initTheme();
  initSidebar();
  setDates();
}

// ══════════════════════════════════════════════════════════
//  AUTH — LOGIN / LOGOUT
// ══════════════════════════════════════════════════════════
function doLogin() {
  const id   = document.getElementById('loginId').value.trim();
  const pass = document.getElementById('loginPass').value;
  const btn  = document.getElementById('loginBtn');
  const card = document.getElementById('loginCard');

  showLoginError('');
  if (!id || !pass) { showLoginError('⚠️ Please enter both ID and password'); return; }

  btn.disabled = true;
  document.getElementById('loginBtnText').style.display    = 'none';
  document.getElementById('loginBtnSpinner').style.display = 'flex';

  setTimeout(() => {
    const userDef = USERS[id];
    if (userDef && pass === userDef.pass) {
      currentUser = { id, role: userDef.role, name: userDef.name, initials: userDef.initials };
      sessionStorage.setItem(AUTH_KEY, JSON.stringify(currentUser));

      if (document.getElementById('rememberMe')?.checked) {
        localStorage.setItem('st-remember', JSON.stringify({ id, pass }));
      } else {
        localStorage.removeItem('st-remember');
      }

      const screen = document.getElementById('loginScreen');
      screen.style.transition = 'opacity .5s ease';
      screen.style.opacity    = '0';
      document.getElementById('appWrap').classList.remove('d-none');
      setTimeout(() => { screen.style.display = 'none'; }, 500);
      initApp();
    } else {
      btn.disabled = false;
      document.getElementById('loginBtnText').style.display    = 'flex';
      document.getElementById('loginBtnSpinner').style.display = 'none';
      card.style.animation = 'none';
      void card.offsetHeight; // trigger reflow
      card.style.animation = 'shake .45s ease';
      showLoginError(!USERS[id] ? '⚠️ Invalid User ID' : '⚠️ Incorrect password');
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
  screen.style.display  = 'flex';
  screen.style.opacity  = '1';
  document.getElementById('loginId').value   = '';
  document.getElementById('loginPass').value = '';
  showLoginError('');
  const btn = document.getElementById('loginBtn');
  if (btn) btn.disabled = false;
  document.getElementById('loginBtnText').style.display    = 'flex';
  document.getElementById('loginBtnSpinner').style.display = 'none';
  navHistory.length = 0; navIndex = -1; updateNavArrows();
  document.querySelectorAll('.mbn-item').forEach(b => { b.classList.remove('active'); b.style.display='flex'; });
  document.querySelector('.mbn-item[data-page="dashboard"]')?.classList.add('active');
  closeSidebar();
  setTimeout(() => document.getElementById('loginId')?.focus(), 100);
}

function togglePw() {
  const input = document.getElementById('loginPass');
  const icon  = document.getElementById('eyeIcon');
  if (input.type === 'password') { input.type='text';     icon.className='bi bi-eye-slash-fill'; }
  else                           { input.type='password'; icon.className='bi bi-eye-fill'; }
}

function initRememberMe() {
  const saved = localStorage.getItem('st-remember');
  if (!saved) return;
  try {
    const { id, pass } = JSON.parse(saved);
    if (id) {
      const idEl = document.getElementById('loginId');
      const passEl= document.getElementById('loginPass');
      const cbEl = document.getElementById('rememberMe');
      const hint = document.getElementById('savedHint');
      if (idEl)   idEl.value   = id;
      if (passEl) passEl.value = pass;
      if (cbEl)   cbEl.checked = true;
      if (hint)   hint.textContent = `✓ ${id} saved`;
    }
  } catch {}
}

function toggleRemember() {
  const cb   = document.getElementById('rememberMe');
  const hint = document.getElementById('savedHint');
  if (!cb.checked) { localStorage.removeItem('st-remember'); if (hint) hint.textContent=''; }
}

// ══════════════════════════════════════════════════════════
//  ROLE
// ══════════════════════════════════════════════════════════
function applyRole() {
  const role    = getRole();
  const allowed = ROLE_PAGES[role] || ROLE_PAGES.admin;

  document.querySelectorAll('.nav-item[data-page]').forEach(a => {
    a.style.display = allowed.includes(a.dataset.page) ? 'flex' : 'none';
  });
  document.querySelectorAll('.mbn-item[data-page]').forEach(b => {
    b.style.display = allowed.includes(b.dataset.page) ? 'flex' : 'none';
  });

  const chip = document.getElementById('userChip');
  if (chip) chip.textContent = currentUser?.initials || 'ST';
  const badge = document.getElementById('roleBadge');
  if (badge) {
    badge.textContent = role === 'admin' ? '👑 Admin' : '📋 Accountant';
    badge.className   = 'role-badge ' + (role === 'admin' ? 'rb-admin' : 'rb-accountant');
  }

  setTimeout(() => go(firstPage()), 50);
}

// ══════════════════════════════════════════════════════════
//  CLOCK
// ══════════════════════════════════════════════════════════
function initClock() {
  function tick() {
    const now = new Date();
    const de  = document.getElementById('topDate');
    const te  = document.getElementById('topTime');
    if (de) de.textContent = now.toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
    if (te) te.textContent = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true });
  }
  tick();
  setInterval(tick, 1000);
}

// ══════════════════════════════════════════════════════════
//  FIREBASE / LOCAL STORAGE
// ══════════════════════════════════════════════════════════
function initFirebase() {
  const cfg = window.__ST_FIREBASE_CONFIG__;
  const isDemo = !cfg || cfg.apiKey.includes('PASTE') || !cfg.apiKey.trim();
  if (isDemo) { fallbackLS(); return; }
  try {
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    db = firebase.firestore();
    setDbStatus('firebase');
    toast('🔥 Firebase connected', 'ok');
    loadAll();
  } catch(e) { console.warn('Firebase error:', e); fallbackLS(); }
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
  el.className   = mode === 'firebase' ? 'db-status' : 'db-status local';
  lb.textContent = mode === 'firebase' ? 'Firebase Connected' : 'Local Storage';
}

// ══════════════════════════════════════════════════════════
//  NAV HISTORY
// ══════════════════════════════════════════════════════════
function navPush(page) {
  if (navIndex < navHistory.length - 1) navHistory.splice(navIndex + 1);
  if (navHistory[navIndex] !== page) { navHistory.push(page); navIndex = navHistory.length - 1; }
  updateNavArrows();
}
function navBack()    { if (navIndex > 0) { navIndex--; go(navHistory[navIndex], true); updateNavArrows(); } }
function navForward() { if (navIndex < navHistory.length-1) { navIndex++; go(navHistory[navIndex], true); updateNavArrows(); } }
function updateNavArrows() {
  const bk = document.getElementById('btnBack');
  const fw = document.getElementById('btnForward');
  if (bk) bk.disabled = navIndex <= 0;
  if (fw) fw.disabled  = navIndex >= navHistory.length - 1;
}

// ══════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════
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
  const allowed = ROLE_PAGES[getRole()] || ROLE_PAGES.admin;
  if (!allowed.includes(page)) page = firstPage();

  document.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  document.querySelectorAll('.page').forEach(s  => s.classList.toggle('active',  s.id === `page-${page}`));
  document.querySelectorAll('.mbn-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));

  const titles = {
    dashboard:'Dashboard', credit:'Credit Amount', pending:'Spending Amount',
    loads:'Loads to Saburi', allloads:'All Loads', drivers:'Driver Attendance', driverexp:'Driver Expenses'
  };
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = titles[page] || page;

  if (!skipHistory) navPush(page);
  window.scrollTo({ top:0, behavior:'smooth' });
  if (page === 'dashboard') refreshDash();
}

function mbnGo(el, page) { go(page); closeSidebar(); }
function dashGo(page)     {
  if ((ROLE_PAGES[getRole()] || []).includes(page)) go(page);
}

// ══════════════════════════════════════════════════════════
//  SIDEBAR / THEME
// ══════════════════════════════════════════════════════════
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
function initTheme() {
  applyTheme(localStorage.getItem('st-theme') || 'light');
  document.getElementById('themeBtn')?.addEventListener('click', () =>
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')
  );
}
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('st-theme', t);
  const icon = document.getElementById('themeIcon');
  const lbl  = document.getElementById('themeLabel');
  if (t === 'dark') { icon?.classList.replace('bi-moon-stars-fill','bi-sun-fill'); if(lbl) lbl.textContent='Light Mode'; }
  else              { icon?.classList.replace('bi-sun-fill','bi-moon-stars-fill'); if(lbl) lbl.textContent='Dark Mode'; }
  if (saburiChartInst) setTimeout(buildChart, 50);
}

// ══════════════════════════════════════════════════════════
//  DATA LOAD
// ══════════════════════════════════════════════════════════
function setDates() {
  const t = new Date().toISOString().slice(0,10);
  ['fCreditDate','fPendDate','fLoadsDate','fAllDate','fDriverDate','fDexpDate'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = t;
  });
}
function today() { return new Date().toISOString().slice(0,10); }

async function loadAll() {
  spin(true);
  await Promise.all(['credit','pending','loads','allLoads','drivers','driverexp'].map(fetchCol));
  spin(false);
  refreshDash();
}

async function fetchCol(name) {
  try {
    const snap = await db.collection(name).orderBy('createdAt','desc').get();
    data[name] = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    render(name);
  } catch(e) { console.error(e); toast(`⚠️ Could not load ${name}`,'err'); }
}

function loadFromLS() {
  ['credit','pending','loads','allLoads','drivers','driverexp'].forEach(n => {
    try { data[n] = JSON.parse(localStorage.getItem(`st-${n}`) || '[]'); } catch { data[n]=[]; }
    render(n);
  });
  refreshDash();
}
function saveLS(name) { try { localStorage.setItem(`st-${name}`, JSON.stringify(data[name])); } catch {} }
function genId()      { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ══════════════════════════════════════════════════════════
//  OPEN MODALS
// ══════════════════════════════════════════════════════════
function openModal(name, rec = null) {
  if (name === 'credit') {
    V('creditId', rec?.id||'');          V('fCreditCo', rec?.company||'');
    V('fCreditDate', rec?.date||today()); V('fCreditAmt', rec?.amount||'');
    V('fCreditAcc', rec?.account||'');
    T('creditModalTitle', rec ? 'Edit Credit Entry' : 'Add Credit Entry');
    showModal('creditModal');

  } else if (name === 'pending') {
    V('pendingId', rec?.id||'');         V('fPendName', rec?.name||'');
    V('fPendAmt', rec?.amount||'');      V('fPendDate', rec?.date||today());
    V('fPendReason', rec?.reason||'');
    T('pendingModalTitle', rec ? 'Edit Spending Entry' : 'Add Spending Entry');
    showModal('pendingModal');

  } else if (name === 'loads') {
    V('loadsId', rec?.id||'');           V('fLoadsDate', rec?.date||today());
    V('fLoadsVeh', rec?.vehicle||'');    V('fLoadsWt', rec?.weight||'');
    V('fLoadsRate', rec?.rate||'');
    T('calcResult', rec ? '₹ '+fmt(rec.weight*rec.rate) : '₹ 0.00');
    T('loadsModalTitle', rec ? 'Edit Load Entry' : 'Add Load Entry');
    showModal('loadsModal');

  } else if (name === 'allLoads') {
    V('allLoadsId', rec?.id||'');        V('fAllDate', rec?.date||today());
    V('fAllVehicle', rec?.vehicle||''); V('fDriverName', rec?.driverName||'');
    V('fDriverBeta', rec?.driverBeta||''); V('fFromPlace', rec?.fromPlace||'');
    V('fToPlace', rec?.toPlace||'');     V('fFuel', rec?.fuel||'');
    V('fPartyPerson', rec?.partyPerson||''); V('fLoadingPerson', rec?.loadingPerson||'');
    V('fAllWeight', rec?.weight||'');    V('fAllRate', rec?.rate||'');
    V('fAllSellRate', rec?.sellRate||''); V('fAllFuelCost', rec?.fuelCost||'');
    V('fAllOtherCost', rec?.otherCost||'');
    T('calcAllResult', rec ? '₹ '+fmt((rec.weight||0)*(rec.rate||0)) : '₹ 0.00');
    T('allLoadsModalTitle', rec ? 'Edit Load Entry' : 'Add Load Entry');
    showModal('allLoadsModal');
    setTimeout(calcAllTotal, 60);

  } else if (name === 'driverexp') {
    V('driverexpId', rec?.id||'');       V('fDexpDriver', rec?.driverName||'');
    V('fDexpDate', rec?.date||today()); V('fDexpBeta', rec?.beta||'');
    V('fDexpMeals', rec?.meals||'');     V('fDexpHalf', rec?.halfLoading||'');
    V('fDexpOther', rec?.other||'');     V('fDexpComment', rec?.comment||'');
    V('fDexpAllowance', rec?.dailyAllowance !== undefined ? rec.dailyAllowance : DAILY_ALLOWANCE);
    const tot = (parseFloat(rec?.beta||0)+parseFloat(rec?.meals||0)+parseFloat(rec?.halfLoading||0)+parseFloat(rec?.other||0));
    T('dexpCalcTotal', '₹ '+fmt(tot));
    T('driverexpModalTitle', rec ? 'Edit Expense' : 'Add Driver Expense');
    showModal('driverexpModal');
    setTimeout(calcDexpNet, 60);

  } else if (name === 'drivers') {
    V('driversId', rec?.id||'');         V('fDriverDate', rec?.date||today());
    V('fDriverName2', rec?.driverName||''); V('fDriverStatus', rec?.status||'Present');
    T('driversModalTitle', rec ? 'Edit Attendance' : 'Add Attendance');
    showModal('driversModal');
  }
}

function V(id, val) { const el=document.getElementById(id); if(el) el.value=val; }
function T(id, txt) { const el=document.getElementById(id); if(el) el.textContent=txt; }
function showModal(id) { new bootstrap.Modal(document.getElementById(id)).show(); }
function hideModal(id) { bootstrap.Modal.getInstance(document.getElementById(id))?.hide(); }

// ── Safe edit cache ─────────────────────────────────────
function cacheEdit(name, r) {
  const key = name + '_' + r.id;
  _editCache[key] = r;
  return key;
}
function editFromCache(key) {
  const r = _editCache[key];
  if (!r) { toast('⚠️ Record not found, please refresh','warn'); return; }
  const name = key.split('_')[0];
  openModal(name, r);
}

// ══════════════════════════════════════════════════════════
//  SAVE FUNCTIONS
// ══════════════════════════════════════════════════════════
async function saveCredit() {
  const id      = document.getElementById('creditId').value;
  const company = document.getElementById('fCreditCo').value;
  const date    = document.getElementById('fCreditDate').value;
  const amount  = parseFloat(document.getElementById('fCreditAmt').value);
  const account = document.getElementById('fCreditAcc').value.trim();
  if (!company||!date||isNaN(amount)||amount<=0||!account) { toast('⚠️ Fill all required fields','warn'); return; }
  await upsert('credit', id, { company, date, amount, account, createdAt:new Date().toISOString() });
  hideModal('creditModal');
}

async function savePending() {
  const id     = document.getElementById('pendingId').value;
  const name   = document.getElementById('fPendName').value.trim();
  const amount = parseFloat(document.getElementById('fPendAmt').value);
  const date   = document.getElementById('fPendDate').value;
  const reason = document.getElementById('fPendReason').value.trim();
  if (!name||isNaN(amount)||amount<=0||!date||!reason) { toast('⚠️ Fill all required fields','warn'); return; }
  await upsert('pending', id, { name, amount, date, reason, createdAt:new Date().toISOString() });
  hideModal('pendingModal');
}

async function saveLoad() {
  const id      = document.getElementById('loadsId').value;
  const date    = document.getElementById('fLoadsDate').value;
  const vehicle = document.getElementById('fLoadsVeh').value.trim().toUpperCase();
  const weight  = parseFloat(document.getElementById('fLoadsWt').value);
  const rate    = parseFloat(document.getElementById('fLoadsRate').value);
  if (!date||!vehicle||isNaN(weight)||weight<=0||isNaN(rate)||rate<=0) { toast('⚠️ Fill all required fields','warn'); return; }
  await upsert('loads', id, { date, vehicle, weight, rate, total:weight*rate, createdAt:new Date().toISOString() });
  hideModal('loadsModal');
}

async function saveAllLoad() {
  const id           = document.getElementById('allLoadsId').value;
  const date         = document.getElementById('fAllDate').value;
  const vehicle      = document.getElementById('fAllVehicle').value.trim().toUpperCase();
  const driverName   = document.getElementById('fDriverName').value.trim();
  const driverBeta   = parseFloat(document.getElementById('fDriverBeta').value)   || 0;
  const fromPlace    = document.getElementById('fFromPlace').value.trim();
  const toPlace      = document.getElementById('fToPlace').value.trim();
  const fuel         = parseFloat(document.getElementById('fFuel').value)          || 0;
  const partyPerson  = document.getElementById('fPartyPerson').value.trim();
  const loadingPerson= document.getElementById('fLoadingPerson').value.trim();
  const weight       = parseFloat(document.getElementById('fAllWeight').value);
  const rate         = parseFloat(document.getElementById('fAllRate').value);
  const sellRate     = parseFloat(document.getElementById('fAllSellRate').value)   || 0;
  const fuelCost     = parseFloat(document.getElementById('fAllFuelCost').value)   || 0;
  const otherCost    = parseFloat(document.getElementById('fAllOtherCost').value)  || 0;

  if (!date||!vehicle||!driverName||!fromPlace||!toPlace||isNaN(weight)||weight<=0||isNaN(rate)||rate<=0) {
    toast('⚠️ Fill required: Date, Vehicle, Driver, From, To, Weight, Rate','warn'); return;
  }
  const buyTotal  = weight * rate;
  const sellTotal = weight * sellRate;
  const profit    = sellTotal - buyTotal - fuelCost - driverBeta - otherCost;
  await upsert('allLoads', id, {
    date, vehicle, driverName, driverBeta, fromPlace, toPlace, fuel, partyPerson, loadingPerson,
    weight, rate, sellRate, fuelCost, otherCost,
    total:buyTotal, sellTotal, profit,
    createdAt:new Date().toISOString()
  });
  hideModal('allLoadsModal');
}

async function saveDriver() {
  const id         = document.getElementById('driversId').value;
  const date       = document.getElementById('fDriverDate').value;
  const driverName = document.getElementById('fDriverName2').value.trim();
  const status     = document.getElementById('fDriverStatus').value;
  if (!date||!driverName||!status) { toast('⚠️ Fill all required fields','warn'); return; }
  await upsert('drivers', id, { date, driverName, status, createdAt:new Date().toISOString() });
  hideModal('driversModal');
}

async function saveDriverExp() {
  const id           = document.getElementById('driverexpId').value;
  const driverName   = document.getElementById('fDexpDriver').value;
  const date         = document.getElementById('fDexpDate').value;
  const beta         = parseFloat(document.getElementById('fDexpBeta').value)      || 0;
  const meals        = parseFloat(document.getElementById('fDexpMeals').value)     || 0;
  const halfLoading  = parseFloat(document.getElementById('fDexpHalf').value)      || 0;
  const other        = parseFloat(document.getElementById('fDexpOther').value)     || 0;
  const comment      = document.getElementById('fDexpComment').value.trim();
  const dailyAllowance = parseFloat(document.getElementById('fDexpAllowance').value) || DAILY_ALLOWANCE;

  if (!driverName||!date) { toast('⚠️ Select driver and date','warn'); return; }

  const total         = beta + meals + halfLoading + other;
  const netAdjustment = total - dailyAllowance;
  await upsert('driverexp', id, {
    driverName, date, beta, meals, halfLoading, other, comment,
    total, dailyAllowance, netAdjustment,
    createdAt:new Date().toISOString()
  });
  hideModal('driverexpModal');
  renderSalarySummary();
}

// ══════════════════════════════════════════════════════════
//  CALC HELPERS
// ══════════════════════════════════════════════════════════
function calcTotal() {
  const w = parseFloat(document.getElementById('fLoadsWt').value)   || 0;
  const r = parseFloat(document.getElementById('fLoadsRate').value) || 0;
  T('calcResult', '₹ '+fmt(w*r));
}

function calcAllTotal() {
  const w    = parseFloat(document.getElementById('fAllWeight').value)   || 0;
  const buy  = parseFloat(document.getElementById('fAllRate').value)     || 0;
  const sell = parseFloat(document.getElementById('fAllSellRate').value) || 0;
  const fuel = parseFloat(document.getElementById('fAllFuelCost').value) || 0;
  const beta = parseFloat(document.getElementById('fDriverBeta').value)  || 0;
  const oth  = parseFloat(document.getElementById('fAllOtherCost').value)|| 0;

  const buyAmt  = w * buy;
  const sellAmt = w * sell;
  const profit  = sellAmt - buyAmt - fuel - beta - oth;

  T('calcAllResult', '₹ '+fmt(buyAmt));
  set('psSell',  '₹ '+fmt(sellAmt));
  set('psBuy',   '₹ '+fmt(buyAmt));
  set('psFuel',  '₹ '+fmt(fuel));
  set('psBeta',  '₹ '+fmt(beta));
  set('psOther', '₹ '+fmt(oth));

  const profEl = document.getElementById('psProfit');
  if (profEl) {
    profEl.textContent = (profit >= 0 ? '₹ ' : '- ₹ ') + fmt(Math.abs(profit));
    profEl.className   = 'ps-profit-val ' + (profit >= 0 ? 'profit-pos' : 'profit-neg');
  }
}

function calcDexpTotal() {
  const b = parseFloat(document.getElementById('fDexpBeta').value)  || 0;
  const m = parseFloat(document.getElementById('fDexpMeals').value) || 0;
  const h = parseFloat(document.getElementById('fDexpHalf').value)  || 0;
  const o = parseFloat(document.getElementById('fDexpOther').value) || 0;
  T('dexpCalcTotal', '₹ '+fmt(b+m+h+o));
  calcDexpNet();
}

function calcDexpNet() {
  const b   = parseFloat(document.getElementById('fDexpBeta').value)       || 0;
  const m   = parseFloat(document.getElementById('fDexpMeals').value)      || 0;
  const h   = parseFloat(document.getElementById('fDexpHalf').value)       || 0;
  const o   = parseFloat(document.getElementById('fDexpOther').value)      || 0;
  const all = parseFloat(document.getElementById('fDexpAllowance').value)  || DAILY_ALLOWANCE;
  const spent = b+m+h+o;
  const net   = spent - all;

  const lbl  = document.getElementById('dexpNetLabel');
  const val  = document.getElementById('dexpNetVal');
  const box  = document.getElementById('dexpNetBox');
  if (!val) return;

  if (net > 0) {
    if (lbl) lbl.innerHTML = '<i class="bi bi-arrow-up-circle-fill" style="color:var(--red)"></i> Extra (adds to salary)';
    val.textContent = '+ ₹ '+fmt(net);
    val.style.color = 'var(--red)';
    if (box) box.style.borderColor = 'rgba(239,68,68,0.35)';
  } else if (net < 0) {
    if (lbl) lbl.innerHTML = '<i class="bi bi-arrow-down-circle-fill" style="color:var(--green)"></i> Saving (deducts from salary)';
    val.textContent = '− ₹ '+fmt(Math.abs(net));
    val.style.color = 'var(--green)';
    if (box) box.style.borderColor = 'rgba(16,185,129,0.35)';
  } else {
    if (lbl) lbl.innerHTML = '<i class="bi bi-check-circle-fill" style="color:var(--blue)"></i> Exact allowance';
    val.textContent = '₹ 0.00';
    val.style.color = 'var(--blue)';
    if (box) box.style.borderColor = 'rgba(59,130,246,0.35)';
  }
}

// ══════════════════════════════════════════════════════════
//  GENERIC UPSERT / DELETE
// ══════════════════════════════════════════════════════════
async function upsert(name, id, rec) {
  spin(true);
  try {
    if (useLS) {
      if (id) { const i=data[name].findIndex(r=>r.id===id); if(i!==-1) data[name][i]={...data[name][i],...rec}; }
      else data[name].unshift({ id:genId(), ...rec });
      saveLS(name);
    } else {
      if (id) {
        await db.collection(name).doc(id).update(rec);
        const i=data[name].findIndex(r=>r.id===id);
        if(i!==-1) data[name][i]={id,...rec};
      } else {
        const ref=await db.collection(name).add(rec);
        data[name].unshift({ id:ref.id, ...rec });
      }
    }
    render(name); refreshDash();
    toast(id ? '✏️ Updated successfully' : '✅ Saved successfully','ok');
  } catch(e) { console.error(e); toast('❌ Save failed — check console','err'); }
  finally { spin(false); }
}

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

// ══════════════════════════════════════════════════════════
//  FILTER
// ══════════════════════════════════════════════════════════
function filterAndRender(name) { pg[name].cur=1; render(name); }

function filtered(name) {
  const q  = (document.getElementById(`${name}Search`)?.value||'').toLowerCase();
  const co = document.getElementById('creditCo')?.value||'';
  const ds = document.getElementById('driverStatusFilter')?.value||'';

  return data[name].filter(r => {
    let txt='';
    if(name==='credit')    txt=`${r.company} ${r.account} ${r.date} ${r.amount}`;
    if(name==='pending')   txt=`${r.name} ${r.reason} ${r.date} ${r.amount}`;
    if(name==='loads')     txt=`${r.vehicle} ${r.date} ${r.weight} ${r.rate}`;
    if(name==='allLoads')  txt=`${r.vehicle} ${r.driverName} ${r.fromPlace} ${r.toPlace} ${r.partyPerson||''} ${r.loadingPerson||''} ${r.date}`;
    if(name==='drivers')   txt=`${r.driverName} ${r.status} ${r.date}`;
    if(name==='driverexp') txt=`${r.driverName} ${r.date} ${r.comment||''}`;
    let ok = txt.toLowerCase().includes(q);
    if(name==='credit'  && co) ok = ok && r.company===co;
    if(name==='drivers' && ds) ok = ok && r.status===ds;
    if(name==='driverexp') {
      const df = document.getElementById('dexpDriverFilter')?.value||'';
      const mf = document.getElementById('dexpMonthFilter')?.value||'';
      if(df) ok = ok && r.driverName===df;
      if(mf) ok = ok && (r.date||'').startsWith(mf);
    }
    return ok;
  }).sort((a,b) => new Date(b.date)-new Date(a.date));
}

// ══════════════════════════════════════════════════════════
//  RENDER TABLES
// ══════════════════════════════════════════════════════════
function render(name) {
  const rows = filtered(name);
  pg[name].list = rows;
  const {cur,per} = pg[name];
  const slice  = rows.slice((cur-1)*per, cur*per);
  const offset = (cur-1)*per;
  if(name==='credit')    renderCredit(slice, offset);
  if(name==='pending')   renderPending(slice, offset);
  if(name==='loads')     renderLoads(slice, offset);
  if(name==='allLoads')  renderAllLoads(slice, offset);
  if(name==='drivers')   renderDrivers(slice, offset);
  if(name==='driverexp') renderDriverExp(slice, offset);
  renderPg(name, rows.length);
  renderTotals(name, rows);
}

function emptyRow(cols) {
  return `<tr class="empty-row"><td colspan="${cols}"><i class="bi bi-inbox"></i><br/>No records found</td></tr>`;
}

function renderCredit(rows, off) {
  const b=document.getElementById('creditBody'); if(!b) return;
  if(!rows.length){b.innerHTML=emptyRow(6);return;}
  b.innerHTML=rows.map((r,i)=>`<tr>
    <td class="mono" style="color:var(--muted)">${off+i+1}</td>
    <td><span class="badge-s ${r.company==='Saburi'?'bs-saburi':'bs-other'}">${r.company}</span></td>
    <td>${fmtDate(r.date)}</td>
    <td class="c-green">₹ ${fmt(r.amount)}</td>
    <td>${r.account}</td>
    <td>
      <button class="abtn abtn-edit me-1" onclick='editFromCache("${cacheEdit("credit",r)}")'><i class="bi bi-pencil-fill"></i></button>
      <button class="abtn abtn-del"       onclick='askDelete("credit","${r.id}")'><i class="bi bi-trash3-fill"></i></button>
    </td>
  </tr>`).join('');
}

function renderPending(rows, off) {
  const b=document.getElementById('pendingBody'); if(!b) return;
  if(!rows.length){b.innerHTML=emptyRow(6);return;}
  b.innerHTML=rows.map((r,i)=>`<tr>
    <td class="mono" style="color:var(--muted)">${off+i+1}</td>
    <td><strong>${r.name}</strong></td>
    <td class="c-red">₹ ${fmt(r.amount)}</td>
    <td>${fmtDate(r.date)}</td>
    <td style="max-width:180px;white-space:normal;font-size:12.5px;color:var(--muted)">${r.reason}</td>
    <td>
      <button class="abtn abtn-edit me-1" onclick='editFromCache("${cacheEdit("pending",r)}")'><i class="bi bi-pencil-fill"></i></button>
      <button class="abtn abtn-del"       onclick='askDelete("pending","${r.id}")'><i class="bi bi-trash3-fill"></i></button>
    </td>
  </tr>`).join('');
}

function renderLoads(rows, off) {
  const b=document.getElementById('loadsBody'); if(!b) return;
  if(!rows.length){b.innerHTML=emptyRow(7);return;}
  b.innerHTML=rows.map((r,i)=>`<tr>
    <td class="mono" style="color:var(--muted)">${off+i+1}</td>
    <td>${fmtDate(r.date)}</td>
    <td class="mono">${r.vehicle}</td>
    <td class="mono">${r.weight} T</td>
    <td class="mono">₹ ${fmt(r.rate)}</td>
    <td class="c-green">₹ ${fmt(r.total||r.weight*r.rate)}</td>
    <td>
      <button class="abtn abtn-edit me-1" onclick='editFromCache("${cacheEdit("loads",r)}")'><i class="bi bi-pencil-fill"></i></button>
      <button class="abtn abtn-del"       onclick='askDelete("loads","${r.id}")'><i class="bi bi-trash3-fill"></i></button>
    </td>
  </tr>`).join('');
}

function renderAllLoads(rows, off) {
  const b=document.getElementById('allLoadsBody'); if(!b) return;
  if(!rows.length){b.innerHTML=emptyRow(11);return;}
  b.innerHTML=rows.map((r,i)=>{
    const buyAmt  = r.total || (r.weight*(r.rate||0))   || 0;
    const sellAmt = r.sellTotal||(r.weight*(r.sellRate||0))||0;
    const profit  = r.profit!==undefined ? r.profit : (sellAmt-buyAmt-(r.fuelCost||0)-(r.driverBeta||0)-(r.otherCost||0));  // fuelCost always subtracted
    const pCls    = profit>0?'c-green':profit<0?'c-red':'mono';
    const key     = cacheEdit('allLoads', r);
    return `<tr>
    <td class="mono" style="color:var(--muted)">${off+i+1}</td>
    <td>${fmtDate(r.date)}</td>
    <td class="mono">${r.vehicle}</td>
    <td><strong>${r.driverName}</strong></td>
    <td style="color:var(--muted);font-size:12.5px">${r.fromPlace}</td>
    <td style="color:var(--muted);font-size:12.5px">${r.toPlace}</td>
    <td class="mono">${r.weight} T</td>
    <td class="mono" style="color:var(--muted)">₹ ${fmt(buyAmt)}</td>
    <td class="c-green">₹ ${fmt(sellAmt)}</td>
    <td class="${pCls}"><strong>${profit>=0?'':'−'}₹ ${fmt(Math.abs(profit))}</strong></td>
    <td>
      <button class="abtn abtn-edit me-1" onclick='editFromCache("${key}")'><i class="bi bi-pencil-fill"></i></button>
      <button class="abtn abtn-del"       onclick='askDelete("allLoads","${r.id}")'><i class="bi bi-trash3-fill"></i></button>
    </td>
    </tr>`;
  }).join('');
}

function renderDrivers(rows, off) {
  const b=document.getElementById('driversBody'); if(!b) return;
  if(!rows.length){b.innerHTML=emptyRow(5);return;}
  b.innerHTML=rows.map((r,i)=>`<tr>
    <td class="mono" style="color:var(--muted)">${off+i+1}</td>
    <td>${fmtDate(r.date)}</td>
    <td><strong>${r.driverName}</strong></td>
    <td>${statusBadge(r.status)}</td>
    <td>
      <button class="abtn abtn-edit me-1" onclick='editFromCache("${cacheEdit("drivers",r)}")'><i class="bi bi-pencil-fill"></i></button>
      <button class="abtn abtn-del"       onclick='askDelete("drivers","${r.id}")'><i class="bi bi-trash3-fill"></i></button>
    </td>
  </tr>`).join('');
}

function renderDriverExp(rows, off) {
  const b=document.getElementById('driverexpBody'); if(!b) return;
  if(!rows.length){b.innerHTML=emptyRow(10);return;}
  b.innerHTML=rows.map((r,i)=>`<tr>
    <td class="mono" style="color:var(--muted)">${off+i+1}</td>
    <td>${fmtDate(r.date)}</td>
    <td><strong>${r.driverName}</strong></td>
    <td class="mono">${r.beta>0?'₹ '+fmt(r.beta):'—'}</td>
    <td class="mono">${r.meals>0?'₹ '+fmt(r.meals):'—'}</td>
    <td class="mono">${r.halfLoading>0?'₹ '+fmt(r.halfLoading):'—'}</td>
    <td class="mono">${r.other>0?'₹ '+fmt(r.other):'—'}</td>
    <td style="font-size:12px;color:var(--muted);max-width:110px;white-space:normal">${r.comment||'—'}</td>
    <td class="c-red"><strong>₹ ${fmt(r.total||0)}</strong></td>
    <td>
      <button class="abtn abtn-edit me-1" onclick='editFromCache("${cacheEdit("driverexp",r)}")'><i class="bi bi-pencil-fill"></i></button>
      <button class="abtn abtn-del"       onclick='askDelete("driverexp","${r.id}")'><i class="bi bi-trash3-fill"></i></button>
    </td>
  </tr>`).join('');
}

function statusBadge(s) {
  const cls  = s==='Present'?'sb-present':s==='Absent'?'sb-absent':'sb-available';
  const icon = s==='Present'?'✅':s==='Absent'?'❌':'🔵';
  return `<span class="status-badge ${cls}">${icon} ${s}</span>`;
}

// ══════════════════════════════════════════════════════════
//  TOTALS
// ══════════════════════════════════════════════════════════
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
  } else if(name==='driverexp') {
    set('dexpTotal','₹ '+fmt(rows.reduce((s,r)=>s+(+r.total||0),0)));
    renderSalarySummary();
  }
}

// ══════════════════════════════════════════════════════════
//  PAGINATION
// ══════════════════════════════════════════════════════════
function renderPg(name, total) {
  const el=document.getElementById(`${name}Pg`); if(!el) return;
  const {cur,per}=pg[name];
  const pages=Math.ceil(total/per);
  if(pages<=1){el.innerHTML='';return;}
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
  if(cur<=4)   return [1,2,3,4,5,'…',total];
  if(cur>=total-3) return [1,'…',total-4,total-3,total-2,total-1,total];
  return [1,'…',cur-1,cur,cur+1,'…',total];
}
function goPage(name,p) {
  pg[name].cur=p; render(name);
  document.getElementById(`${name}Body`)?.closest('.glass-card')?.scrollIntoView({behavior:'smooth',block:'start'});
}

// ══════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════
function refreshDash() {
  set('d-credit',    '₹ '+fmt(data.credit.reduce((s,r)=>s+(+r.amount||0),0)));
  set('d-pending',   '₹ '+fmt(data.pending.reduce((s,r)=>s+(+r.amount||0),0)));
  set('d-loads',     data.loads.length);
  set('d-weight',    data.loads.reduce((s,r)=>s+(+r.weight||0),0).toFixed(2)+' T');
  set('d-saburi-amt','₹ '+fmt(data.loads.reduce((s,r)=>s+(+(r.total||r.weight*r.rate)||0),0)));
  set('d-allloads',  data.allLoads.length);
  const todayStr = new Date().toISOString().slice(0,10);
  set('d-drivers', data.drivers.filter(r=>r.date===todayStr&&r.status==='Present').length);

  const rc=document.getElementById('d-recent-credit');
  if(rc){
    const items=data.credit.slice(0,5);
    rc.innerHTML=items.length
      ?items.map(r=>`<div class="ri"><div><div class="ri-name">${r.account}</div><div class="ri-sub">${r.company} · ${fmtDate(r.date)}</div></div><div class="ri-amt">₹ ${fmt(r.amount)}</div></div>`).join('')
      :'<div class="empty-ri">No credit records yet</div>';
  }
  const rl=document.getElementById('d-recent-allloads');
  if(rl){
    const items=data.allLoads.slice(0,5);
    rl.innerHTML=items.length
      ?items.map(r=>`<div class="ri"><div><div class="ri-name">${r.vehicle} <span style="font-weight:400;color:var(--muted)">— ${r.driverName}</span></div><div class="ri-sub">${fmtDate(r.date)} · ${r.fromPlace} → ${r.toPlace}</div></div><div class="ri-amt">₹ ${fmt(r.total||r.weight*r.rate)}</div></div>`).join('')
      :'<div class="empty-ri">No load records yet</div>';
  }
  if (typeof buildChart==='function') buildChart();
}

// ══════════════════════════════════════════════════════════
//  PDF
// ══════════════════════════════════════════════════════════
function togglePdfView(mode) {
  if(allLoadsPdfView===mode){ allLoadsPdfView='both'; document.getElementById('togBuying')?.classList.remove('active'); document.getElementById('togSelling')?.classList.remove('active'); }
  else { allLoadsPdfView=mode; document.getElementById('togBuying')?.classList.toggle('active',mode==='buying'); document.getElementById('togSelling')?.classList.toggle('active',mode==='selling'); }
}

function openPdfFilter(name) {
  pdfModule=name;
  const labels={credit:'Credit Amount',pending:'Spending Amount',loads:'Loads to Saburi',allLoads:'All Loads',drivers:'Driver Attendance',driverexp:'Driver Expenses'};
  const lbl=document.getElementById('pdfModalLabel');
  let text=labels[name]||name;
  if(name==='allLoads'&&allLoadsPdfView!=='both') text+=' ('+(allLoadsPdfView==='buying'?'Buying only':'Selling only')+')';
  if(lbl) lbl.textContent=text;
  document.querySelectorAll('.pdf-opt').forEach(el=>el.classList.toggle('selected',el.dataset.val==='current'));
  document.getElementById('customDates').classList.remove('show');
  showModal('pdfModal');
}

function selectPdfOpt(el) {
  document.querySelectorAll('.pdf-opt').forEach(o=>o.classList.remove('selected'));
  el.classList.add('selected');
  const cd=document.getElementById('customDates');
  if(el.dataset.val==='custom') cd.classList.add('show'); else cd.classList.remove('show');
}

function downloadFilteredPDF() {
  const sel  = document.querySelector('.pdf-opt.selected');
  const type = sel ? sel.dataset.val : 'all';
  let rows   = filtered(pdfModule);
  const now  = new Date();

  if(type==='current') {
    rows=rows.filter(r=>{const d=new Date(r.date);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();});
  } else if(type==='lastmonth') {
    const lm=now.getMonth()===0?11:now.getMonth()-1, ly=now.getMonth()===0?now.getFullYear()-1:now.getFullYear();
    rows=rows.filter(r=>{const d=new Date(r.date);return d.getMonth()===lm&&d.getFullYear()===ly;});
  } else if(type==='custom') {
    const fv=document.getElementById('fromDate').value, tv=document.getElementById('toDate').value;
    if(!fv||!tv){toast('⚠️ Select both dates','warn');return;}
    const fr=new Date(fv), to=new Date(tv); to.setHours(23,59,59);
    rows=rows.filter(r=>{const d=new Date(r.date);return d>=fr&&d<=to;});
  }
  if(!rows.length){toast('⚠️ No records in selected range','warn');return;}
  hideModal('pdfModal');
  exportPDF(pdfModule, rows);
}

function exportPDF(name, customRows=null) {
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const rows=customRows||filtered(name);
  const now=new Date();
  const dStr=now.toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});

  doc.setFillColor(11,20,55); doc.rect(0,0,210,34,'F');
  doc.setTextColor(245,158,11); doc.setFontSize(20); doc.setFont('helvetica','bold');
  doc.text('SRUTHI TRANSPORT',14,13);
  doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text('Management System',14,20);
  const titles={credit:'Credit Amount Report',pending:'Spending Amount Report',loads:'Loads to Saburi Report',allLoads:'All Loads Report',drivers:'Driver Attendance Report',driverexp:'Driver Expenses Report'};
  doc.setFontSize(12); doc.setFont('helvetica','bold');
  doc.text(titles[name]||name, 14,28);
  doc.setTextColor(180,190,210); doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text(`Generated: ${dStr}`,196,28,{align:'right'});

  doc.setFillColor(240,242,250); doc.roundedRect(14,38,182,16,3,3,'F');
  doc.setTextColor(11,20,55); doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text(`Total Records: ${rows.length}`,20,47);
  if(name==='credit')  doc.text(`Grand Total: INR ${fmt(rows.reduce((s,r)=>s+(+r.amount||0),0))}`,110,47);
  if(name==='pending') doc.text(`Total Spending: INR ${fmt(rows.reduce((s,r)=>s+(+r.amount||0),0))}`,110,47);
  if(name==='loads')   { const tw=rows.reduce((s,r)=>s+(+r.weight||0),0); const ta=rows.reduce((s,r)=>s+(+(r.total||r.weight*r.rate)||0),0); doc.text(`Total Weight: ${tw.toFixed(2)} T`,70,47); doc.text(`Total Amt: INR ${fmt(ta)}`,130,47); }
  if(name==='allLoads'){
    const view=allLoadsPdfView||'both';
    const tw=rows.reduce((s,r)=>s+(+r.weight||0),0);
    const tB=rows.reduce((s,r)=>s+(+(r.total||r.weight*r.rate)||0),0);
    const tS=rows.reduce((s,r)=>s+(+(r.sellTotal||r.weight*(r.sellRate||0))||0),0);
    if(view==='buying')  { doc.text(`Weight: ${tw.toFixed(2)} T`,60,47); doc.text(`Total Buying: INR ${fmt(tB)}`,120,47); }
    else if(view==='selling'){ doc.text(`Weight: ${tw.toFixed(2)} T`,60,47); doc.text(`Total Selling: INR ${fmt(tS)}`,120,47); }
    else { doc.text(`Buy: INR ${fmt(tB)}`,50,47); doc.text(`Sell: INR ${fmt(tS)}`,105,47); doc.text(`Profit: INR ${fmt(tS-tB)}`,160,47); }
  }
  if(name==='drivers'){doc.text(`Present: ${rows.filter(r=>r.status==='Present').length}`,80,47);doc.text(`Absent: ${rows.filter(r=>r.status==='Absent').length}`,130,47);}

  let cols,body;
  if(name==='credit')  {cols=['#','Company','Date','Amount (INR)','To Whom'];body=rows.map((r,i)=>[i+1,r.company,fmtDate(r.date),fmt(r.amount),r.account]);}
  else if(name==='pending'){cols=['#','Name','Amount (INR)','Date','Reason'];body=rows.map((r,i)=>[i+1,r.name,fmt(r.amount),fmtDate(r.date),r.reason]);}
  else if(name==='loads'){cols=['#','Date','Vehicle','Weight (T)','Rate/Ton','Total (INR)'];body=rows.map((r,i)=>[i+1,fmtDate(r.date),r.vehicle,r.weight,fmt(r.rate),fmt(r.total||r.weight*r.rate)]);}
  else if(name==='allLoads'){
    const view=allLoadsPdfView||'both';
    if(view==='buying'){
      cols=['#','Date','Vehicle','Driver','From','To','Weight (T)','Buy Rate','Buying Total'];
      body=rows.map((r,i)=>[i+1,fmtDate(r.date),r.vehicle,r.driverName,r.fromPlace,r.toPlace,r.weight+'T','₹'+fmt(r.rate||0),fmt(r.total||r.weight*r.rate)]);
    } else if(view==='selling'){
      cols=['#','Date','Vehicle','Driver','From','To','Weight (T)','Sell Rate','Selling Total'];
      body=rows.map((r,i)=>[i+1,fmtDate(r.date),r.vehicle,r.driverName,r.fromPlace,r.toPlace,r.weight+'T','₹'+fmt(r.sellRate||0),fmt(r.sellTotal||r.weight*(r.sellRate||0))]);
    } else {
      cols=['#','Date','Vehicle','Driver','From','To','Wt (T)','Buy (INR)','Sell (INR)','Profit (INR)'];
      body=rows.map((r,i)=>{const b=r.total||(r.weight*r.rate)||0;const s=r.sellTotal||(r.weight*(r.sellRate||0))||0;const p=r.profit!==undefined?r.profit:(s-b-(r.fuelCost||0)-(r.driverBeta||0)-(r.otherCost||0));  /* fuelCost deducted */return [i+1,fmtDate(r.date),r.vehicle,r.driverName,r.fromPlace,r.toPlace,r.weight,fmt(b),fmt(s),fmt(p)];});
    }
  }
  else if(name==='drivers'){cols=['#','Date','Driver Name','Status'];body=rows.map((r,i)=>[i+1,fmtDate(r.date),r.driverName,r.status]);}
  else if(name==='driverexp'){cols=['#','Date','Driver','Beta','Meals','Half Load','Other','Comment','Total'];body=rows.map((r,i)=>[i+1,fmtDate(r.date),r.driverName,fmt(r.beta||0),fmt(r.meals||0),fmt(r.halfLoading||0),fmt(r.other||0),r.comment||'—',fmt(r.total||0)]);}

  doc.autoTable({head:[cols],body,startY:58,margin:{left:14,right:14},
    headStyles:{fillColor:[11,20,55],textColor:[245,158,11],fontStyle:'bold',fontSize:8.5},
    bodyStyles:{fontSize:8.5,textColor:[20,30,60]},
    alternateRowStyles:{fillColor:[247,249,253]},
    styles:{cellPadding:3.5,lineColor:[215,220,235],lineWidth:.2},
    columnStyles:{0:{halign:'center',cellWidth:10}}
  });
  const pc=doc.internal.getNumberOfPages();
  for(let i=1;i<=pc;i++){doc.setPage(i);doc.setFillColor(11,20,55);doc.rect(0,287,210,10,'F');doc.setTextColor(170,180,205);doc.setFontSize(7);doc.text('Sruthi Transport Management System',14,293);doc.text(`Page ${i} of ${pc}`,196,293,{align:'right'});}
  const fname={credit:'credit',pending:'spending',loads:'loads-saburi',allLoads:'all-loads',drivers:'driver-attendance',driverexp:'driver-expenses'};
  doc.save(`sruthi-${fname[name]||name}-${now.toISOString().slice(0,10)}.pdf`);
  toast('📄 PDF exported!','ok');
}

// ══════════════════════════════════════════════════════════
//  SALARY SUMMARY
// ══════════════════════════════════════════════════════════
function renderSalarySummary() {
  const picker=document.getElementById('salaryMonthPicker'); if(!picker) return;
  const allMonths=[...new Set(data.driverexp.map(r=>(r.date||'').slice(0,7)).filter(Boolean))].sort().reverse();
  const nowMonth=new Date().toISOString().slice(0,7);
  if(!allMonths.includes(nowMonth)) allMonths.unshift(nowMonth);
  const existing=[...picker.options].map(o=>o.value);
  if(JSON.stringify(existing)!==JSON.stringify(allMonths)){
    picker.innerHTML=allMonths.map(m=>{
      const [y,mo]=m.split('-');
      const lbl=new Date(parseInt(y),parseInt(mo)-1).toLocaleString('en-IN',{month:'long',year:'numeric'});
      return `<option value="${m}">${lbl}</option>`;
    }).join('');
  }
  const selMonth=picker.value||nowMonth;
  const [sy,sm]=selMonth.split('-');
  const label=new Date(parseInt(sy),parseInt(sm)-1).toLocaleString('en-IN',{month:'long',year:'numeric'});
  set('salarySummaryMonth', label);
  const monthExp=data.driverexp.filter(r=>(r.date||'').startsWith(selMonth));
  const container=document.getElementById('salarySummaryCards'); if(!container) return;
  if(!monthExp.length){
    container.innerHTML='<div class="col-12 text-center py-4" style="color:var(--muted);font-size:14px"><i class="bi bi-person-lines-fill" style="font-size:30px;opacity:.3;display:block;margin-bottom:8px"></i>No expense data for this month</div>';
    return;
  }
  container.innerHTML=DRIVER_NAMES.map(name=>{
    const dExp=monthExp.filter(r=>r.driverName===name);
    const expAmt=dExp.reduce((s,r)=>s+(+r.total||0),0);
    const beta =dExp.reduce((s,r)=>s+(+r.beta||0),0);
    const meals=dExp.reduce((s,r)=>s+(+r.meals||0),0);
    const half =dExp.reduce((s,r)=>s+(+r.halfLoading||0),0);
    const other=dExp.reduce((s,r)=>s+(+r.other||0),0);
    const totalAllowance=dExp.reduce((s,r)=>s+(r.dailyAllowance||DAILY_ALLOWANCE),0);
    const netAdj=dExp.reduce((s,r)=>{
      if(r.netAdjustment!==undefined) return s+r.netAdjustment;
      return s+((r.total||0)-(r.dailyAllowance||DAILY_ALLOWANCE));
    },0);
    const finalSalary=BASE_SALARY+netAdj;
    const saving=netAdj<0?Math.abs(netAdj):0;
    const extra =netAdj>0?netAdj:0;
    const pct=Math.min(100,Math.round((Math.abs(netAdj)/BASE_SALARY)*100));
    const progressColor=netAdj>0?'var(--red)':'var(--green)';
    return `<div class="col-12 col-md-6 col-xl-4">
      <div class="salary-card">
        <div class="sc-header">
          <div class="sc-avatar">${name.charAt(0)}</div>
          <div class="sc-name">${name}</div>
          <div class="sc-month">${label}</div>
        </div>
        <div class="sc-rows">
          <div class="sc-row"><span>Base Salary</span><span class="sc-val-green">₹ ${fmt(BASE_SALARY)}</span></div>
          <div class="sc-row"><span><i class="bi bi-calendar-check"></i> Allowance Given</span><span style="color:var(--blue)">₹ ${fmt(totalAllowance)}</span></div>
          <div class="sc-row"><span><i class="bi bi-receipt"></i> Actual Spent</span><span style="color:var(--muted)">₹ ${fmt(expAmt)}</span></div>
          ${beta >0?`<div class="sc-row sc-exp"><span style="padding-left:12px">· Beta</span><span class="sc-val-red">₹ ${fmt(beta)}</span></div>`:''}
          ${meals>0?`<div class="sc-row sc-exp"><span style="padding-left:12px">· Meals</span><span class="sc-val-red">₹ ${fmt(meals)}</span></div>`:''}
          ${half >0?`<div class="sc-row sc-exp"><span style="padding-left:12px">· Half Loading</span><span class="sc-val-red">₹ ${fmt(half)}</span></div>`:''}
          ${other>0?`<div class="sc-row sc-exp"><span style="padding-left:12px">· Other</span><span class="sc-val-red">₹ ${fmt(other)}</span></div>`:''}
          <div class="sc-divider"></div>
          ${netAdj>0?`<div class="sc-row"><span><i class="bi bi-arrow-up-circle-fill" style="color:var(--red)"></i> Extra Added</span><span class="sc-val-red">+ ₹ ${fmt(extra)}</span></div>`:netAdj<0?`<div class="sc-row"><span><i class="bi bi-arrow-down-circle-fill" style="color:var(--green)"></i> Saving Deducted</span><span class="sc-val-green">− ₹ ${fmt(saving)}</span></div>`:`<div class="sc-row"><span><i class="bi bi-check-circle-fill" style="color:var(--green)"></i> Exact Allowance</span><span style="color:var(--green)">No adjustment</span></div>`}
          <div class="sc-row sc-total"><span>Final Salary</span><span style="color:var(--amber);font-family:'JetBrains Mono',monospace;font-size:17px;font-weight:800">₹ ${fmt(finalSalary)}</span></div>
        </div>
        <div class="sc-progress-wrap"><div class="sc-progress-bar" style="width:${pct}%;background:${progressColor}"></div></div>
        <div class="sc-footer">
          ${netAdj>0?`<span style="color:var(--red)">⚠ Over by ₹ ${fmt(extra)}</span>`:netAdj<0?`<span style="color:var(--green)">✓ Saved ₹ ${fmt(saving)}</span>`:`<span style="color:var(--green)">✓ On budget</span>`}
          &nbsp;·&nbsp; ${dExp.length} entr${dExp.length===1?'y':'ies'}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════
//  CHART
// ══════════════════════════════════════════════════════════
function buildChart() {
  const canvas=document.getElementById('saburiChart');
  const wrap=document.getElementById('chartWrap');
  const emptyMsg=document.getElementById('chartEmptyMsg');
  if(!canvas) return;
  const loads=data.loads||[];
  const yearSel=document.getElementById('chartYearSelect');
  if(yearSel){
    const years=[...new Set(loads.map(r=>r.date?.slice(0,4)).filter(Boolean))].sort().reverse();
    if(!years.length) years.push(String(new Date().getFullYear()));
    const existing=[...yearSel.options].map(o=>o.value);
    if(JSON.stringify(existing)!==JSON.stringify(years)) yearSel.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');
  }
  const selYear=yearSel?yearSel.value:String(new Date().getFullYear());
  const yearLoads=loads.filter(r=>r.date?.startsWith(selYear));
  const byMonth=Array(12).fill(null).map(()=>({amount:0,weight:0,trips:0}));
  yearLoads.forEach(r=>{
    const m=parseInt((r.date||'').slice(5,7),10)-1;
    if(m<0||m>11) return;
    byMonth[m].amount+=parseFloat(r.total||(r.weight*r.rate)||0);
    byMonth[m].weight+=parseFloat(r.weight||0);
    byMonth[m].trips+=1;
  });
  const hasData=byMonth.some(m=>m[chartMetric]>0);
  if(!hasData){if(wrap)wrap.style.display='none';if(emptyMsg)emptyMsg.style.display='block';if(saburiChartInst){saburiChartInst.destroy();saburiChartInst=null;}return;}
  if(wrap)wrap.style.display='block';if(emptyMsg)emptyMsg.style.display='none';
  const metricLabels={amount:'Amount (₹)',weight:'Weight (T)',trips:'Trips'};
  const rawValues=byMonth.map(m=>parseFloat(m[chartMetric].toFixed(2)));
  const maxVal=Math.max(...rawValues,1);
  const bgColors=rawValues.map(v=>{const a=v===0?0.06:0.18+(v/maxVal)*0.72;return `rgba(245,158,11,${a.toFixed(2)})`;});
  const borderColors=rawValues.map(v=>v===0?'rgba(245,158,11,0.15)':'rgba(245,158,11,0.85)');
  const isDark=document.documentElement.dataset.theme==='dark';
  const txtCol=isDark?'rgba(180,195,230,0.75)':'rgba(60,80,120,0.70)';
  const gridCol=isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)';
  function fmtTick(v){if(chartMetric==='amount'){if(v>=100000)return '₹'+(v/100000).toFixed(1)+'L';if(v>=1000)return '₹'+(v/1000).toFixed(0)+'K';return '₹'+v;}if(chartMetric==='weight')return v+' T';return v;}
  function fmtTip(v){if(chartMetric==='amount')return '₹ '+parseFloat(v).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});if(chartMetric==='weight')return v+' Tonnes';return v+' trips';}
  const cfg={type:'bar',data:{labels:MONTHS,datasets:[{label:metricLabels[chartMetric],data:rawValues,backgroundColor:bgColors,borderColor:borderColors,borderWidth:1.5,borderRadius:6,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:500,easing:'easeInOutQuart'},
      plugins:{legend:{display:false},tooltip:{backgroundColor:isDark?'#0f1e3a':'#ffffff',titleColor:isDark?'#e2e8f0':'#0f172a',bodyColor:isDark?'#94a3b8':'#475569',borderColor:isDark?'#1c2d50':'#dde1ef',borderWidth:1,padding:12,cornerRadius:10,
        callbacks:{title:ctx=>MONTHS[ctx[0].dataIndex]+' '+selYear,label:ctx=>'  '+metricLabels[chartMetric]+': '+fmtTip(ctx.raw)}}},
      scales:{x:{grid:{display:false},border:{display:false},ticks:{color:txtCol,font:{family:"'Outfit',sans-serif",size:12,weight:'500'},autoSkip:false,maxRotation:0}},
        y:{grid:{color:gridCol,lineWidth:1},border:{display:false,dash:[4,4]},beginAtZero:true,ticks:{color:txtCol,font:{family:"'Outfit',sans-serif",size:11},maxTicksLimit:6,callback:v=>fmtTick(v)}}},
      interaction:{intersect:false,mode:'index'}}};
  if(saburiChartInst){saburiChartInst.data=cfg.data;saburiChartInst.options=cfg.options;saburiChartInst.update('none');}
  else saburiChartInst=new Chart(canvas,cfg);
  const legEl=document.getElementById('chartLegend');
  if(legEl){
    const tA=byMonth.reduce((s,m)=>s+m.amount,0);
    const tW=byMonth.reduce((s,m)=>s+m.weight,0);
    const tT=byMonth.reduce((s,m)=>s+m.trips,0);
    const pk=byMonth.reduce((bi,m,i,arr)=>m[chartMetric]>arr[bi][chartMetric]?i:bi,0);
    legEl.innerHTML=`<span class="cleg-pill cleg-amber">₹ ${(tA/100000).toFixed(2)}L</span><span class="cleg-pill cleg-blue">${tW.toFixed(1)} T</span><span class="cleg-pill cleg-green">${tT} trips</span>${tT>0?`<span class="cleg-pill cleg-purple">Peak: ${MONTHS[pk]}</span>`:''}`;
  }
}

function switchMetric(btn, metric) {
  chartMetric=metric;
  document.querySelectorAll('.chart-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  buildChart();
}

// ══════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════
function fmt(n)    { return parseFloat(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtDate(d){ if(!d)return '—'; try{const [y,m,day]=d.split('-');return `${day} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]} ${y}`;}catch{return d;} }
function set(id,val){ const e=document.getElementById(id); if(e) e.textContent=val; }
function spin(show){ document.getElementById('spinner')?.classList.toggle('d-none',!show); }
function toast(msg,type='ok'){
  const el=document.getElementById('toast'), body=document.getElementById('toastBody');
  if(!el||!body) return;
  const color={ok:'var(--green)',warn:'var(--amber)',err:'var(--red)'}[type]||'var(--green)';
  el.style.borderLeft=`4px solid ${color}`; body.innerHTML=msg;
  bootstrap.Toast.getOrCreateInstance(el,{delay:3200}).show();
}


// ══════════════════════════════════════════════════════════
//  DRIVER SALARY PDF
// ══════════════════════════════════════════════════════════

function openSalaryPdfModal() {
  // Default to current month
  const nowMonth = new Date().toISOString().slice(0,7);
  const monthEl  = document.getElementById('salaryPdfMonth');
  if (monthEl) monthEl.value = nowMonth;
  document.getElementById('salaryPdfDriver').value = '';
  document.getElementById('salaryPdfPreview').style.display = 'none';
  document.getElementById('salaryPdfPreviewContent').innerHTML = '';
  new bootstrap.Modal(document.getElementById('salaryPdfModal')).show();
}

// ── Build salary data for a driver + month ──────────────────
function buildDriverSalaryData(driverName, month) {
  const monthExp = data.driverexp.filter(r =>
    r.driverName === driverName && (r.date||'').startsWith(month)
  );

  const expAmt       = monthExp.reduce((s,r) => s+(+r.total||0), 0);
  const beta         = monthExp.reduce((s,r) => s+(+r.beta||0), 0);
  const meals        = monthExp.reduce((s,r) => s+(+r.meals||0), 0);
  const halfLoading  = monthExp.reduce((s,r) => s+(+r.halfLoading||0), 0);
  const other        = monthExp.reduce((s,r) => s+(+r.other||0), 0);
  const totalAllowance = monthExp.reduce((s,r) => s+(r.dailyAllowance||DAILY_ALLOWANCE), 0);
  const netAdj       = monthExp.reduce((s,r) => {
    if (r.netAdjustment !== undefined) return s + r.netAdjustment;
    return s + ((r.total||0) - (r.dailyAllowance||DAILY_ALLOWANCE));
  }, 0);
  const finalSalary  = BASE_SALARY + netAdj;

  return { driverName, month, entries: monthExp, expAmt, beta, meals, halfLoading, other,
           totalAllowance, netAdj, finalSalary, entryCount: monthExp.length };
}

// ── Preview ─────────────────────────────────────────────────
function previewSalaryPdf() {
  const month      = document.getElementById('salaryPdfMonth').value;
  const driverSel  = document.getElementById('salaryPdfDriver').value;
  if (!month) { toast('⚠️ Please select a month','warn'); return; }

  const drivers = driverSel ? [driverSel] : DRIVER_NAMES;
  const [y,m]   = month.split('-');
  const label   = new Date(parseInt(y),parseInt(m)-1).toLocaleString('en-IN',{month:'long',year:'numeric'});

  const previewEl = document.getElementById('salaryPdfPreviewContent');
  const wrapEl    = document.getElementById('salaryPdfPreview');

  previewEl.innerHTML = drivers.map(name => {
    const d = buildDriverSalaryData(name, month);
    const sign = d.netAdj >= 0 ? '+' : '−';
    const adjColor = d.netAdj > 0 ? 'var(--red)' : d.netAdj < 0 ? 'var(--green)' : 'var(--muted)';
    return `
    <div class="spy-card">
      <div class="spy-name"><i class="bi bi-person-circle"></i> ${name}</div>
      <div class="spy-row"><span>Base Salary</span><span class="spy-green">₹ ${fmt(BASE_SALARY)}</span></div>
      <div class="spy-row"><span>Allowance Given</span><span style="color:var(--blue)">₹ ${fmt(d.totalAllowance)}</span></div>
      <div class="spy-row"><span>Actual Spent</span><span style="color:var(--muted)">₹ ${fmt(d.expAmt)}</span></div>
      <div class="spy-row"><span>Net Adjustment</span><span style="color:${adjColor}">${sign} ₹ ${fmt(Math.abs(d.netAdj))}</span></div>
      <div class="spy-row spy-total"><span>Final Salary</span><span>₹ ${fmt(d.finalSalary)}</span></div>
    </div>`;
  }).join('');

  wrapEl.style.display = 'block';
}

// ── Download salary PDF ─────────────────────────────────────
function downloadSalaryPdf() {
  const month     = document.getElementById('salaryPdfMonth').value;
  const driverSel = document.getElementById('salaryPdfDriver').value;
  if (!month) { toast('⚠️ Please select a month','warn'); return; }

  const drivers   = driverSel ? [driverSel] : DRIVER_NAMES;
  const [y,m]     = month.split('-');
  const monthLabel= new Date(parseInt(y),parseInt(m)-1).toLocaleString('en-IN',{month:'long',year:'numeric'});
  const now       = new Date();
  const dStr      = now.toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});

  const {jsPDF}   = window.jspdf;
  const doc       = new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});

  // ── Header bar ──
  doc.setFillColor(11,20,55); doc.rect(0,0,210,34,'F');
  doc.setTextColor(245,158,11); doc.setFontSize(20); doc.setFont('helvetica','bold');
  doc.text('SRUTHI TRANSPORT', 14, 13);
  doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text('Driver Salary Report — ' + monthLabel, 14, 20);
  doc.setFontSize(12); doc.setFont('helvetica','bold');
  doc.text(driverSel ? `Salary: ${driverSel}` : 'All Drivers Salary Summary', 14, 28);
  doc.setTextColor(180,190,210); doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text('Generated: ' + dStr, 196, 28, {align:'right'});

  let yPos = 40;

  // ── Summary totals box ──
  const allData  = drivers.map(n => buildDriverSalaryData(n, month));
  const grandTot = allData.reduce((s,d) => s + d.finalSalary, 0);
  doc.setFillColor(240,242,250); doc.roundedRect(14, yPos, 182, 14, 3, 3, 'F');
  doc.setTextColor(11,20,55); doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text(`Drivers: ${drivers.length}`, 20, yPos+9);
  doc.text(`Total Payout: INR ${fmt(grandTot)}`, 110, yPos+9);
  yPos += 20;

  // ── Per-driver salary table ──
  const tableHead = [['#','Driver Name','Base Salary','Allowance','Spent','Adjustment','Final Salary']];
  const tableBody = allData.map((d,i) => {
    const sign = d.netAdj >= 0 ? '+' : '−';
    return [
      i+1,
      d.driverName,
      '₹ '+fmt(BASE_SALARY),
      '₹ '+fmt(d.totalAllowance),
      '₹ '+fmt(d.expAmt),
      sign+' ₹ '+fmt(Math.abs(d.netAdj)),
      '₹ '+fmt(d.finalSalary)
    ];
  });

  doc.autoTable({
    head: tableHead,
    body: tableBody,
    startY: yPos,
    margin: {left:14, right:14},
    headStyles: {fillColor:[11,20,55], textColor:[245,158,11], fontStyle:'bold', fontSize:9},
    bodyStyles: {fontSize:9, textColor:[20,30,60]},
    alternateRowStyles: {fillColor:[247,249,253]},
    styles: {cellPadding:4, lineColor:[215,220,235], lineWidth:.2},
    columnStyles: {
      0: {halign:'center', cellWidth:10},
      6: {fontStyle:'bold', textColor:[11,100,55]}
    },
    didParseCell(data) {
      // Color adjustment column: red if positive (extra cost), green if negative (saving)
      if (data.column.index === 5 && data.section === 'body') {
        const val = allData[data.row.index];
        if (val) data.cell.styles.textColor = val.netAdj > 0 ? [180,0,0] : val.netAdj < 0 ? [0,130,80] : [100,100,100];
      }
      // Color final salary amber
      if (data.column.index === 6 && data.section === 'body') {
        data.cell.styles.textColor = [180,100,0];
        data.cell.styles.fontStyle = 'bold';
      }
    }
  });

  yPos = doc.lastAutoTable.finalY + 12;

  // ── Expense breakdown per driver (if single driver or space allows) ──
  if (driverSel && allData[0]?.entries?.length > 0) {
    const d = allData[0];
    doc.setTextColor(11,20,55); doc.setFontSize(10); doc.setFont('helvetica','bold');
    doc.text('Expense Breakdown — ' + d.driverName, 14, yPos);
    yPos += 4;

    doc.autoTable({
      head: [['#','Date','Beta','Meals','Half Load','Other','Comment','Total','Allowance','Adj']],
      body: d.entries.map((r,i) => {
        const adj = (r.netAdjustment !== undefined ? r.netAdjustment : (r.total||0)-(r.dailyAllowance||DAILY_ALLOWANCE));
        return [
          i+1, fmtDate(r.date),
          r.beta>0?'₹'+fmt(r.beta):'—',
          r.meals>0?'₹'+fmt(r.meals):'—',
          r.halfLoading>0?'₹'+fmt(r.halfLoading):'—',
          r.other>0?'₹'+fmt(r.other):'—',
          r.comment||'—',
          '₹'+fmt(r.total||0),
          '₹'+fmt(r.dailyAllowance||DAILY_ALLOWANCE),
          (adj>=0?'+':'−')+'₹'+fmt(Math.abs(adj))
        ];
      }),
      startY: yPos,
      margin: {left:14, right:14},
      headStyles: {fillColor:[30,50,90], textColor:[245,158,11], fontStyle:'bold', fontSize:7.5},
      bodyStyles: {fontSize:7.5, textColor:[20,30,60]},
      alternateRowStyles: {fillColor:[247,249,253]},
      styles: {cellPadding:3, lineColor:[215,220,235], lineWidth:.2},
      columnStyles: {0:{halign:'center',cellWidth:8}}
    });
    yPos = doc.lastAutoTable.finalY + 10;
  }

  // ── Footer ──
  const pc = doc.internal.getNumberOfPages();
  for (let i=1;i<=pc;i++) {
    doc.setPage(i);
    doc.setFillColor(11,20,55); doc.rect(0,287,210,10,'F');
    doc.setTextColor(170,180,205); doc.setFontSize(7);
    doc.text('Sruthi Transport — Driver Salary Report', 14, 293);
    doc.text(`Page ${i} of ${pc}`, 196, 293, {align:'right'});
  }

  const fname = driverSel
    ? `sruthi-salary-${driverSel.replace(/ /g,'-').toLowerCase()}-${month}.pdf`
    : `sruthi-salary-all-drivers-${month}.pdf`;
  doc.save(fname);
  bootstrap.Modal.getInstance(document.getElementById('salaryPdfModal'))?.hide();
  toast('📄 Salary PDF downloaded!','ok');
}
