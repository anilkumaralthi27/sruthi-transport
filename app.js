/* ════════════════════════════════════════════════════
   SRUTHI TRANSPORT — app.js
   All CRUD, Firebase/localStorage, PDF, pagination
════════════════════════════════════════════════════ */

'use strict';

// ── State ──────────────────────────────────────────
let db = null;
let useLS = false;   // true = localStorage fallback
let delCb = null;    // delete callback

const data = { credit: [], pending: [], loads: [], allLoads: [],
  drivers: [] };
const pg   = {
  credit:  { cur: 1, per: 8, list: [] },
  pending: { cur: 1, per: 8, list: [] },
  loads:   { cur: 1, per: 8, list: [] },
  allLoads:{ cur: 1, per: 8, list: [] },
  drivers:{ cur: 1, per: 8, list: [] }
};

// ── Bootstrap ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initFirebase();
  initNav();
  initTheme();
  initSidebar();
  setDates();
});

// ── Firebase init ──────────────────────────────────
function initFirebase() {
  const cfg = window.__ST_FIREBASE_CONFIG__;
  const isDemo = !cfg ||
    cfg.apiKey.includes('PASTE') ||
    cfg.apiKey.trim() === '';

  if (isDemo) {
    fallbackLS();
    return;
  }

  try {
    firebase.initializeApp(cfg);
    db = firebase.firestore();
    setDbStatus('firebase');
    toast('🔥 Firebase connected', 'ok');
    loadAll();
  } catch (e) {
    console.warn('Firebase error:', e);
    fallbackLS();
  }
}

function fallbackLS() {
  useLS = true;
  setDbStatus('local');
  toast('📦 Using local storage (Firebase not configured)', 'warn');
  loadFromLS();
}

function setDbStatus(mode) {
  const el = document.getElementById('dbStatus');
  const lbl = document.getElementById('dbLabel');
  if (!el || !lbl) return;
  if (mode === 'firebase') {
    el.className = 'db-status'; lbl.textContent = 'Firebase Connected';
  } else {
    el.className = 'db-status local'; lbl.textContent = 'Local Storage';
  }
}

// ── Navigation ─────────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-item').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      go(a.dataset.page);
      if (window.innerWidth < 992) closeSidebar();
    });
  });
}

function go(page) {
  document.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  document.querySelectorAll('.page').forEach(s => s.classList.toggle('active', s.id === `page-${page}`));
  const titles = { dashboard:'Dashboard', credit:'Credit Amount', pending:'Pending Amount', loads:'Loads to Saburi', allloads:'All Loads',
 drivers:'Driver Attendance' };
  document.getElementById('pageTitle').textContent = titles[page] || page;
  if (page === 'dashboard') refreshDash();
}

// ── Sidebar ────────────────────────────────────────
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

// ── Theme ──────────────────────────────────────────
function initTheme() {
  applyTheme(localStorage.getItem('st-theme') || 'light');
  document.getElementById('themeBtn')?.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
}
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('st-theme', t);
  const icon = document.getElementById('themeIcon');
  const lbl  = document.getElementById('themeLabel');
  if (t === 'dark') {
    icon?.classList.replace('bi-moon-stars-fill','bi-sun-fill');
    if (lbl) lbl.textContent = 'Light Mode';
  } else {
    icon?.classList.replace('bi-sun-fill','bi-moon-stars-fill');
    if (lbl) lbl.textContent = 'Dark Mode';
  }
}

// ── Default dates ──────────────────────────────────
function setDates() {
  const today = new Date().toISOString().slice(0,10);
  ['fCreditDate','fPendDate','fLoadsDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
}

// ── Load all from Firestore ────────────────────────
async function loadAll() {
  spin(true);
  await Promise.all([
    fetchCol('credit'),
    fetchCol('pending'),
    fetchCol('loads'),
      fetchCol('allLoads'),
 fetchCol('drivers')
  ]);
  spin(false);
  refreshDash();
}

async function fetchCol(name) {
  try {
    const snap = await db.collection(name).orderBy('createdAt','desc').get();
    data[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render(name);
  } catch(e) {
    console.error(e);
    toast(`⚠️ Could not load ${name}`, 'err');
  }
}

// ── Load from localStorage ─────────────────────────
function loadFromLS() {
  ['credit','pending','loads','allLoads',
'drivers'].forEach(n => {
    try { data[n] = JSON.parse(localStorage.getItem(`st-${n}`) || '[]'); }
    catch { data[n] = []; }
    render(n);
  });
  refreshDash();
}
function saveLS(name) {
  try { localStorage.setItem(`st-${name}`, JSON.stringify(data[name])); } catch {}
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ── Open Modals ────────────────────────────────────
function openModal(name, rec = null) {
  if (name === 'credit') {
    document.getElementById('creditId').value       = rec?.id || '';
    document.getElementById('fCreditCo').value      = rec?.company || '';
    document.getElementById('fCreditDate').value    = rec?.date || today();
    document.getElementById('fCreditAmt').value     = rec?.amount || '';
    document.getElementById('fCreditAcc').value     = rec?.account || '';
    document.getElementById('creditModalTitle').textContent = rec ? 'Edit Credit Entry' : 'Add Credit Entry';
    new bootstrap.Modal(document.getElementById('creditModal')).show();

  } else if (name === 'pending') {
    document.getElementById('pendingId').value      = rec?.id || '';
    document.getElementById('fPendName').value      = rec?.name || '';
    document.getElementById('fPendAmt').value       = rec?.amount || '';
    document.getElementById('fPendDate').value      = rec?.date || today();
    document.getElementById('fPendReason').value    = rec?.reason || '';
    document.getElementById('pendingModalTitle').textContent = rec ? 'Edit Pending Entry' : 'Add Pending Entry';
    new bootstrap.Modal(document.getElementById('pendingModal')).show();

  } else if (name === 'loads') {
    document.getElementById('loadsId').value        = rec?.id || '';
    document.getElementById('fLoadsDate').value     = rec?.date || today();
    document.getElementById('fLoadsVeh').value      = rec?.vehicle || '';
    document.getElementById('fLoadsWt').value       = rec?.weight || '';
    document.getElementById('fLoadsRate').value     = rec?.rate || '';
    document.getElementById('calcResult').textContent = rec
      ? '₹ ' + fmt(rec.weight * rec.rate) : '₹ 0.00';
    document.getElementById('loadsModalTitle').textContent = rec ? 'Edit Load Entry' : 'Add Load Entry';
    new bootstrap.Modal(document.getElementById('loadsModal')).show();
  }
   else if(name === 'allLoads'){

 new bootstrap.Modal(
 document.getElementById('allLoadsModal')
 ).show();

}

else if(name === 'drivers'){

 new bootstrap.Modal(
 document.getElementById('driversModal')
 ).show();

}
}

function today() { return new Date().toISOString().slice(0,10); }

// ── CREDIT CRUD ────────────────────────────────────
async function saveCredit() {
  const id      = document.getElementById('creditId').value;
  const company = document.getElementById('fCreditCo').value;
  const date    = document.getElementById('fCreditDate').value;
  const amount  = parseFloat(document.getElementById('fCreditAmt').value);
  const account = document.getElementById('fCreditAcc').value.trim();

  if (!company || !date || isNaN(amount) || amount <= 0 || !account) {
    toast('⚠️ Fill all required fields correctly', 'warn'); return;
  }
  const rec = { company, date, amount, account, createdAt: new Date().toISOString() };
  await upsert('credit', id, rec);
  bootstrap.Modal.getInstance(document.getElementById('creditModal'))?.hide();
}

// ── PENDING CRUD ───────────────────────────────────
async function savePending() {
  const id     = document.getElementById('pendingId').value;
  const name   = document.getElementById('fPendName').value.trim();
  const amount = parseFloat(document.getElementById('fPendAmt').value);
  const date   = document.getElementById('fPendDate').value;
  const reason = document.getElementById('fPendReason').value.trim();

  if (!name || isNaN(amount) || amount <= 0 || !date || !reason) {
    toast('⚠️ Fill all required fields correctly', 'warn'); return;
  }
  const rec = { name, amount, date, reason, createdAt: new Date().toISOString() };
  await upsert('pending', id, rec);
  bootstrap.Modal.getInstance(document.getElementById('pendingModal'))?.hide();
}

// ── LOADS CRUD ─────────────────────────────────────
async function saveLoad() {
  const id      = document.getElementById('loadsId').value;
  const date    = document.getElementById('fLoadsDate').value;
  const vehicle = document.getElementById('fLoadsVeh').value.trim().toUpperCase();
  const weight  = parseFloat(document.getElementById('fLoadsWt').value);
  const rate    = parseFloat(document.getElementById('fLoadsRate').value);

  if (!date || !vehicle || isNaN(weight) || weight <= 0 || isNaN(rate) || rate <= 0) {
    toast('⚠️ Fill all required fields correctly', 'warn'); return;
  }
  const rec = { date, vehicle, weight, rate, total: weight * rate, createdAt: new Date().toISOString() };
  await upsert('loads', id, rec);
  bootstrap.Modal.getInstance(document.getElementById('loadsModal'))?.hide();
}

function calcTotal() {
  const w = parseFloat(document.getElementById('fLoadsWt').value) || 0;
  const r = parseFloat(document.getElementById('fLoadsRate').value) || 0;
  document.getElementById('calcResult').textContent = '₹ ' + fmt(w * r);
}

// ── Generic upsert ─────────────────────────────────
async function upsert(name, id, rec) {
  spin(true);
  try {
    if (useLS) {
      if (id) {
        const i = data[name].findIndex(r => r.id === id);
        if (i !== -1) data[name][i] = { ...data[name][i], ...rec };
      } else {
        data[name].unshift({ id: genId(), ...rec });
      }
      saveLS(name);
    } else {
      if (id) {
        await db.collection(name).doc(id).update(rec);
        const i = data[name].findIndex(r => r.id === id);
        if (i !== -1) data[name][i] = { id, ...rec };
      } else {
        const ref = await db.collection(name).add(rec);
        data[name].unshift({ id: ref.id, ...rec });
      }
    }
    render(name);
    refreshDash();
    toast(id ? '✏️ Updated successfully' : '✅ Saved successfully', 'ok');
  } catch(e) {
    console.error(e);
    toast('❌ Save failed — check console', 'err');
  } finally { spin(false); }
}

// ── Delete ─────────────────────────────────────────
function askDelete(name, id) {
  delCb = () => doDelete(name, id);
  const m = new bootstrap.Modal(document.getElementById('deleteModal'));
  m.show();
  document.getElementById('confirmDelBtn').onclick = () => { m.hide(); delCb?.(); delCb = null; };
}

async function doDelete(name, id) {
  spin(true);
  try {
    if (useLS) {
      data[name] = data[name].filter(r => r.id !== id);
      saveLS(name);
    } else {
      await db.collection(name).doc(id).delete();
      data[name] = data[name].filter(r => r.id !== id);
    }
    render(name);
    refreshDash();
    toast('🗑️ Deleted successfully', 'ok');
  } catch(e) {
    console.error(e);
    toast('❌ Delete failed', 'err');
  } finally { spin(false); }
}

// ── Filter + render ────────────────────────────────
function filterAndRender(name) {
  pg[name].cur = 1;
  render(name);
}

function filtered(name) {
  const q  = (document.getElementById(`${name}Search`)?.value || '').toLowerCase();
  const co = document.getElementById('creditCo')?.value || '';

  return data[name]
    .filter(r => {
      let txt = '';
      if (name === 'credit')  txt = `${r.company} ${r.account} ${r.date} ${r.amount}`;
      if (name === 'pending') txt = `${r.name} ${r.reason} ${r.date} ${r.amount}`;
      if (name === 'loads')   txt = `${r.vehicle} ${r.date} ${r.weight} ${r.rate}`;
       if (name === 'allLoads')
txt = `
${r.vehicle}
${r.driverName}
${r.driverBeta}
${r.fromPlace}
${r.toPlace}
${r.partyPerson}
${r.loadingPerson}
${r.date}
`;

if (name === 'drivers')
txt = `
${r.driverName}
${r.status}
${r.date}
`;
      let ok = txt.toLowerCase().includes(q);
      if (name === 'credit' && co) ok = ok && r.company === co;
      return ok;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date)); // Latest date first
}

// ── Render tables ──────────────────────────────────
function render(name) {
  const rows = filtered(name);
  pg[name].list = rows;
  const { cur, per } = pg[name];
  const slice = rows.slice((cur-1)*per, cur*per);
  const offset = (cur-1)*per;

  if (name === 'credit')  renderCredit(slice, offset);
  if (name === 'pending') renderPending(slice, offset);
  if (name === 'loads')   renderLoads(slice, offset);
   if (name === 'allLoads')
renderAllLoads(slice, offset);

if (name === 'drivers')
renderDrivers(slice, offset);

  renderPg(name, rows.length);
  renderTotals(name, rows);
}

function renderCredit(rows, off) {
  const b = document.getElementById('creditBody');
  if (!b) return;
  if (!rows.length) { b.innerHTML = emptyRow(6); return; }
  b.innerHTML = rows.map((r,i) => `<tr>
    <td class="mono" style="color:var(--muted)">${off+i+1}</td>
    <td><span class="badge-s ${r.company==='Saburi'?'bs-saburi':'bs-other'}">${r.company}</span></td>
    <td>${fmtDate(r.date)}</td>
    <td class="c-green">₹ ${fmt(r.amount)}</td>
    <td>${r.account}</td>
    <td><button class="abtn abtn-edit me-1" onclick='openModal("credit",${js(r)})'><i class="bi bi-pencil-fill"></i></button>
        <button class="abtn abtn-del" onclick='askDelete("credit","${r.id}")'><i class="bi bi-trash3-fill"></i></button></td>
  </tr>`).join('');
}

function renderPending(rows, off) {
  const b = document.getElementById('pendingBody');
  if (!b) return;
  if (!rows.length) { b.innerHTML = emptyRow(6); return; }
  b.innerHTML = rows.map((r,i) => `<tr>
    <td class="mono" style="color:var(--muted)">${off+i+1}</td>
    <td><strong>${r.name}</strong></td>
    <td class="c-red">₹ ${fmt(r.amount)}</td>
    <td>${fmtDate(r.date)}</td>
    <td style="max-width:180px;white-space:normal;font-size:12.5px;color:var(--muted)">${r.reason}</td>
    <td><button class="abtn abtn-edit me-1" onclick='openModal("pending",${js(r)})'><i class="bi bi-pencil-fill"></i></button>
        <button class="abtn abtn-del" onclick='askDelete("pending","${r.id}")'><i class="bi bi-trash3-fill"></i></button></td>
  </tr>`).join('');
}

function renderLoads(rows, off) {
  const b = document.getElementById('loadsBody');
  if (!b) return;
  if (!rows.length) { b.innerHTML = emptyRow(7); return; }
  b.innerHTML = rows.map((r,i) => `<tr>
    <td class="mono" style="color:var(--muted)">${off+i+1}</td>
    <td>${fmtDate(r.date)}</td>
    <td class="mono" style="letter-spacing:.06em">${r.vehicle}</td>
    <td class="mono">${r.weight} T</td>
    <td class="mono">₹ ${fmt(r.rate)}</td>
    <td class="c-green">₹ ${fmt(r.total || r.weight*r.rate)}</td>
    <td><button class="abtn abtn-edit me-1" onclick='openModal("loads",${js(r)})'><i class="bi bi-pencil-fill"></i></button>
        <button class="abtn abtn-del" onclick='askDelete("loads","${r.id}")'><i class="bi bi-trash3-fill"></i></button></td>
  </tr>`).join('');
}
function renderAllLoads(rows, off){

 const b =
 document.getElementById('allLoadsBody');

 if(!b) return;

 if(!rows.length){
   b.innerHTML = emptyRow(8);
   return;
 }

 b.innerHTML =
 rows.map((r,i)=>`

 <tr>

 <td>${off+i+1}</td>

 <td>${fmtDate(r.date)}</td>

 <td>${r.vehicle}</td>

 <td>${r.driverName}</td>

 <td>${r.fromPlace}</td>

 <td>${r.toPlace}</td>

 <td>${r.weight}</td>

 <td>₹ ${fmt(r.total)}</td>

 </tr>

 `).join('');
}
function renderDrivers(rows, off){

 const b =
 document.getElementById('driversBody');

 if(!b) return;

 if(!rows.length){
   b.innerHTML = emptyRow(4);
   return;
 }

 b.innerHTML =
 rows.map((r,i)=>`

 <tr>

 <td>${off+i+1}</td>

 <td>${fmtDate(r.date)}</td>

 <td>${r.driverName}</td>

 <td>${r.status}</td>

 </tr>

 `).join('');
}
function emptyRow(cols) {
  return `<tr class="empty-row"><td colspan="${cols}"><i class="bi bi-inbox"></i><br/>No records found</td></tr>`;
}

// JSON-safe for inline onclick
function js(r) { return JSON.stringify(r).replace(/'/g,"&#39;"); }

// ── Totals ─────────────────────────────────────────
function renderTotals(name, rows) {
  if (name === 'credit') {
    const t = rows.reduce((s,r) => s+(+r.amount||0), 0);
    set('creditTotal', '₹ '+fmt(t));
  } else if (name === 'pending') {
    const t = rows.reduce((s,r) => s+(+r.amount||0), 0);
    set('pendingTotal', '₹ '+fmt(t));
  } else if (name === 'loads') {
    const tw = rows.reduce((s,r) => s+(+r.weight||0), 0);
    const ta = rows.reduce((s,r) => s+(+(r.total||r.weight*r.rate)||0), 0);
    set('loadsTotalW', tw.toFixed(2)+' T');
    set('loadsTotalA', '₹ '+fmt(ta));
  }
}

// ── Pagination ─────────────────────────────────────
function renderPg(name, total) {
  const el = document.getElementById(`${name}Pg`);
  if (!el) return;
  const { cur, per } = pg[name];
  const pages = Math.ceil(total / per);
  if (pages <= 1) { el.innerHTML = ''; return; }

  const range = pageRange(cur, pages);
  let h = `<button class="pgbtn" ${cur===1?'disabled':''} onclick="goPage('${name}',${cur-1})"><i class="bi bi-chevron-left"></i></button>`;
  range.forEach(p => {
    if (p === '…') h += `<button class="pgbtn" disabled>…</button>`;
    else h += `<button class="pgbtn ${p===cur?'active':''}" onclick="goPage('${name}',${p})">${p}</button>`;
  });
  h += `<button class="pgbtn" ${cur===pages?'disabled':''} onclick="goPage('${name}',${cur+1})"><i class="bi bi-chevron-right"></i></button>`;
  el.innerHTML = h;
}

function pageRange(cur, total) {
  if (total <= 7) return Array.from({length:total},(_,i)=>i+1);
  if (cur <= 4)  return [1,2,3,4,5,'…',total];
  if (cur >= total-3) return [1,'…',total-4,total-3,total-2,total-1,total];
  return [1,'…',cur-1,cur,cur+1,'…',total];
}

function goPage(name, p) {
  pg[name].cur = p;
  render(name);
  document.getElementById(`${name}Body`)?.closest('.glass-card')?.scrollIntoView({behavior:'smooth',block:'start'});
}

// ── Dashboard ──────────────────────────────────────
function refreshDash() {
  const ct = data.credit.reduce((s,r) => s+(+r.amount||0), 0);
  const pt = data.pending.reduce((s,r) => s+(+r.amount||0), 0);
  const tw = data.loads.reduce((s,r) => s+(+r.weight||0), 0);
  set('d-credit',  '₹ '+fmt(ct));
  set('d-pending', '₹ '+fmt(pt));
  set('d-loads',   data.loads.length);
  set('d-weight',  tw.toFixed(2)+' T');

  // Recent credit
  const rc = document.getElementById('d-recent-credit');
  if (rc) {
    const items = data.credit.slice(0,5);
    rc.innerHTML = items.length
      ? items.map(r => `<div class="ri"><div><div class="ri-name">${r.account}</div><div class="ri-sub">${r.company} · ${fmtDate(r.date)}</div></div><div class="ri-amt">₹ ${fmt(r.amount)}</div></div>`).join('')
      : '<div class="empty-ri">No credit records yet</div>';
  }

  // Recent loads
  const rl = document.getElementById('d-recent-loads');
  if (rl) {
    const items = data.loads.slice(0,5);
    rl.innerHTML = items.length
      ? items.map(r => `<div class="ri"><div><div class="ri-name">${r.vehicle}</div><div class="ri-sub">${fmtDate(r.date)} · ${r.weight} T</div></div><div class="ri-amt">₹ ${fmt(r.total||r.weight*r.rate)}</div></div>`).join('')
      : '<div class="empty-ri">No load records yet</div>';
  }
}

// ── PDF Export ─────────────────────────────────────
function exportPDF(name, customRows = null) {
  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const rows = customRows || filtered(name);
  const now  = new Date();
  const dateStr = now.toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});

  // Header bar
  doc.setFillColor(11,20,55);
  doc.rect(0,0,210,34,'F');
  doc.setTextColor(245,158,11);
  doc.setFontSize(20); doc.setFont('helvetica','bold');
  doc.text('SRUTHI TRANSPORT',14,13);
  doc.setTextColor(255,255,255);
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text('Management System',14,20);

  const titles = { credit:'Credit Amount Report', pending:'Pending Amount Report', loads:'Loads to Saburi Report' };
  doc.setFontSize(12); doc.setFont('helvetica','bold');
  doc.text(titles[name],14,28);
  doc.setTextColor(180,190,210);
  doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text(`Generated: ${dateStr}`, 196,28,{align:'right'});

  // Summary row
  doc.setFillColor(240,242,250);
  doc.roundedRect(14,38,182,16,3,3,'F');
  doc.setTextColor(11,20,55);
  doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text(`Total Records: ${rows.length}`, 20,47);

  if (name === 'credit') {
    const t = rows.reduce((s,r)=>s+(+r.amount||0),0);
    doc.text(`Grand Total: INR ${fmt(t)}`,110,47);
  } else if (name === 'pending') {
    const t = rows.reduce((s,r)=>s+(+r.amount||0),0);
    doc.text(`Total Pending: INR ${fmt(t)}`,110,47);
  } else {
    const tw = rows.reduce((s,r)=>s+(+r.weight||0),0);
    const ta = rows.reduce((s,r)=>s+(+(r.total||r.weight*r.rate)||0),0);
    doc.text(`Total Weight: ${tw.toFixed(2)} T`, 75,47);
    doc.text(`Total Amount: INR ${fmt(ta)}`, 130,47);
  }

  // Table
  let cols, body;
  if (name === 'credit') {
    cols = ['#','Company','Date','Amount (INR)','To Whom / Account'];
    body = rows.map((r,i)=>[i+1,r.company,fmtDate(r.date),fmt(r.amount),r.account]);
  } else if (name === 'pending') {
    cols = ['#','Name','Amount (INR)','Date','Reason'];
    body = rows.map((r,i)=>[i+1,r.name,fmt(r.amount),fmtDate(r.date),r.reason]);
  } else {
    cols = ['#','Date','Vehicle No.','Weight (T)','Rate/Ton','Total (INR)'];
    body = rows.map((r,i)=>[i+1,fmtDate(r.date),r.vehicle,r.weight,fmt(r.rate),fmt(r.total||r.weight*r.rate)]);
  }

  doc.autoTable({
    head:[cols], body,
    startY:58, margin:{left:14,right:14},
    headStyles:{ fillColor:[11,20,55], textColor:[245,158,11], fontStyle:'bold', fontSize:9 },
    bodyStyles:{ fontSize:9, textColor:[20,30,60] },
    alternateRowStyles:{ fillColor:[247,249,253] },
    styles:{ cellPadding:4, lineColor:[215,220,235], lineWidth:.2 },
    columnStyles:{ 0:{ halign:'center', cellWidth:11 } }
  });

  // Page footer
  const pc = doc.internal.getNumberOfPages();
  for (let i=1;i<=pc;i++) {
    doc.setPage(i);
    doc.setFillColor(11,20,55);
    doc.rect(0,287,210,10,'F');
    doc.setTextColor(170,180,205);
    doc.setFontSize(7);
    doc.text('Sruthi Transport Management System',14,293);
    doc.text(`Page ${i} of ${pc}`,196,293,{align:'right'});
  }

  const fname = {credit:'credit-amount',pending:'pending-amount',loads:'loads-saburi'};
  doc.save(`sruthi-${fname[name]}-${now.toISOString().slice(0,10)}.pdf`);
  toast('📄 PDF exported!','ok');
}

// ── Helpers ────────────────────────────────────────
function fmt(n) {
  return parseFloat(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtDate(d) {
  if (!d) return '—';
  try {
    const [y,m,day] = d.split('-');
    const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${day} ${mo[+m-1]} ${y}`;
  } catch { return d; }
}
function set(id,val) { const e=document.getElementById(id); if(e) e.textContent=val; }
function spin(show)  { document.getElementById('spinner')?.classList.toggle('d-none',!show); }

// ── Toast ──────────────────────────────────────────
function toast(msg, type='ok') {
  const el   = document.getElementById('toast');
  const body = document.getElementById('toastBody');
  if (!el||!body) return;
  const color = {ok:'var(--green)',warn:'var(--amber)',err:'var(--red)'}[type]||'var(--green)';
  el.style.borderLeft = `4px solid ${color}`;
  body.innerHTML = msg;
  bootstrap.Toast.getOrCreateInstance(el,{delay:3200}).show();
}
let pdfModule = '';

function openPdfFilter(name) {
    pdfModule = name;

    new bootstrap.Modal(
        document.getElementById('pdfModal')
    ).show();
}

document.addEventListener('change', function(e){

    if(e.target.id === 'pdfType'){

        document.getElementById('customDates').style.display =
            e.target.value === 'custom'
            ? 'block'
            : 'none';
    }
});
function downloadFilteredPDF() {

    const type = document.getElementById('pdfType').value;

    let rows = filtered(pdfModule);

    const today = new Date();

    if(type === 'current') {

        rows = rows.filter(r => {
            const d = new Date(r.date);
            return d.getMonth() === today.getMonth()
                && d.getFullYear() === today.getFullYear();
        });
    }

    else if(type === 'lastmonth') {

        const lastMonth =
            today.getMonth() === 0 ? 11 : today.getMonth() - 1;

        const year =
            today.getMonth() === 0
            ? today.getFullYear() - 1
            : today.getFullYear();

        rows = rows.filter(r => {
            const d = new Date(r.date);

            return d.getMonth() === lastMonth
                && d.getFullYear() === year;
        });
    }

    else if(type === 'custom') {

        const from =
            new Date(document.getElementById('fromDate').value);

        const to =
            new Date(document.getElementById('toDate').value);

        rows = rows.filter(r => {
            const d = new Date(r.date);
            return d >= from && d <= to;
        });
    }

    exportPDF(pdfModule, rows);
}
async function saveAllLoad() {

 const rec = {

  date:
  document.getElementById('fAllDate').value,

  vehicle:
  document.getElementById('fAllVehicle').value,

  driverName:
  document.getElementById('fDriverName').value,

  driverBeta:
  document.getElementById('fDriverBeta').value,

  fromPlace:
  document.getElementById('fFromPlace').value,

  toPlace:
  document.getElementById('fToPlace').value,

  fuel:
  document.getElementById('fFuel').value,

  partyPerson:
  document.getElementById('fPartyPerson').value,

  loadingPerson:
  document.getElementById('fLoadingPerson').value,

  weight:
  document.getElementById('fWeight').value,

  rate:
  document.getElementById('fRate').value,

  total:
  document.getElementById('fWeight').value *
  document.getElementById('fRate').value,

  createdAt:
  new Date().toISOString()
 };

 await upsert('allLoads','',rec);
}
async function saveDriver() {

 const rec = {

  date:
  document.getElementById('fDriverDate').value,

  driverName:
  document.getElementById('fDriverName2').value,

  status:
  document.getElementById('fDriverStatus').value,

  createdAt:
  new Date().toISOString()
 };

 await upsert('drivers','',rec);
}
