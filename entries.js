/* entries.js — Sporting Entries page logic
 * Features:
 *   #1  Auto-prefill from driver record (licence, car #) + blocker banner
 *   #2  Doc readiness checklist (auto from driver expiry vs event start) with overrides
 *   #3  Sync fia_entry_confirmed back to drivers (server-side on PUT/POST)
 *   #4  Event-grouped view toggle
 *   #5  Entry deadline + countdown
 *   #6  Payment tracking (fee/paid/date/ref + auto status)
 *   #7  Bulk entry from event "drivers attending"
 *   #8  Championship master list (CRUD modal)
 *   #9  Entry-form print/PDF
 *   #10 Penalties / incidents flags for driver
 *   #12 Why-isn't-this-confirmed reason list
 */
(() => {
'use strict';

// ── State ────────────────────────────────────────────────────────────────────
let allEntries = [], allDrivers = [], allEvents = [], allChamps = [], allPenalties = [], allIncidents = [];
let selectedId = null;
let filterStatus = 'all';
let filterChamp  = 'all';
let viewMode     = 'list';

// ── Custom dialog system (replaces window.alert/confirm/prompt) ─────────────
let _uiDialogModal = null;
function _ensureDialog() {
  if (!_uiDialogModal) _uiDialogModal = new bootstrap.Modal(document.getElementById('uiDialog'));
  return _uiDialogModal;
}
function _showDialog({ title='Notice', message='', mode='alert', defaultValue='', okText='OK', cancelText='Cancel' }) {
  return new Promise(resolve => {
    const m = _ensureDialog();
    document.getElementById('uiDialogTitle').textContent = title;
    document.getElementById('uiDialogMsg').textContent   = message || '';
    const inputWrap = document.getElementById('uiDialogInputWrap');
    const input     = document.getElementById('uiDialogInput');
    const cancelBtn = document.getElementById('uiDialogCancel');
    const okBtn     = document.getElementById('uiDialogOk');
    okBtn.textContent     = okText;
    cancelBtn.textContent = cancelText;
    if (mode === 'prompt') { inputWrap.style.display = ''; input.value = defaultValue || ''; }
    else                   { inputWrap.style.display = 'none'; }
    if (mode === 'alert')  { cancelBtn.style.display = 'none'; }
    else                   { cancelBtn.style.display = ''; }
    let settled = false;
    const cleanup = (val) => {
      if (settled) return; settled = true;
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      document.getElementById('uiDialogClose').removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      m.hide();
      resolve(val);
    };
    const onOk     = () => cleanup(mode === 'prompt' ? input.value : true);
    const onCancel = () => cleanup(mode === 'prompt' ? null : false);
    const onKey    = (e) => { if (e.key === 'Enter') { e.preventDefault(); onOk(); } };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    document.getElementById('uiDialogClose').addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
    m.show();
    if (mode === 'prompt') setTimeout(() => input.focus(), 200);
  });
}
const uiAlert   = (message, title='Notice')              => _showDialog({ title, message, mode:'alert' });
const uiConfirm = (message, title='Please confirm')      => _showDialog({ title, message, mode:'confirm' });
const uiPrompt  = (message, defaultValue='', title='Input required') => _showDialog({ title, message, mode:'prompt', defaultValue });

// ── Helpers ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) { console.warn('[entries] setText: missing element #' + id); return; }
  el.textContent = value;
}
function setValue(id, value) {
  const el = document.getElementById(id);
  if (!el) { console.warn('[entries] setValue: missing element #' + id); return; }
  el.value = value;
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toISO = d => d ? String(d).slice(0,10) : '';
const todayISO = () => new Date().toISOString().slice(0,10);
function daysBetween(a, b) {
  if (!a || !b) return null;
  const ms = new Date(b+'T12:00:00') - new Date(a+'T12:00:00');
  return Math.round(ms / 86400000);
}
function fmtDate(d) {
  if (!d) return '';
  return new Date(toISO(d)+'T12:00:00').toLocaleDateString('en-ZA', {day:'numeric',month:'short',year:'numeric'});
}
function fmtMoney(n) {
  const v = Number(n||0);
  return 'R' + v.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function authFetch(url, opts) {
  const t = localStorage.getItem('auth_token') || '';
  const headers = Object.assign({}, (opts||{}).headers, t ? {'Authorization': `Bearer ${t}`} : {});
  if (opts && opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  return fetch(url, Object.assign({}, opts||{}, { headers }));
}
async function jget(url) {
  try {
    const r = await authFetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch(_) { return null; }
}

// ── Doc readiness model ──────────────────────────────────────────────────────
// Returns array of { key, name, sub, status:'ok'|'warn'|'bad'|'na', overridden:bool, required:bool }
function evaluateDocs(driver, eventStartIso, overrides, champ) {
  if (!driver) return [];
  const t = todayISO();
  const ev = eventStartIso || t;
  // Determine which docs are required (championship can set; otherwise sensible defaults)
  const req = (champ && champ.doc_requirements) || { licence:true, medical:true, helmet:true, consent:false };
  // Minor heuristic: under 18 needs guardian consent
  let needsConsent = !!req.consent;
  if (driver.date_of_birth) {
    const dob = new Date(driver.date_of_birth);
    if (!isNaN(dob)) {
      const age = (new Date(ev) - dob) / (365.25*86400000);
      if (age < 18) needsConsent = true;
    }
  }
  const ov = overrides || {};
  function classify(expiry, required) {
    if (!required) return { status:'na', sub:'Not required' };
    if (!expiry)   return { status:'bad', sub:'Missing — not recorded' };
    const days = daysBetween(t, toISO(expiry));
    const daysFromEvent = daysBetween(ev, toISO(expiry));
    if (daysFromEvent < 0) return { status:'bad', sub:`Expires ${fmtDate(expiry)} — BEFORE event` };
    if (days < 30)         return { status:'warn', sub:`Expires ${fmtDate(expiry)} (${days}d)` };
    return { status:'ok', sub:`Valid until ${fmtDate(expiry)}` };
  }
  const rows = [
    { key:'licence', name:'CIK / FIA Licence', required:!!req.licence, ...classify(driver.license_expiry, !!req.licence) },
    { key:'medical', name:'Medical Certificate', required:!!req.medical, ...classify(driver.medical_expiry, !!req.medical) },
    { key:'helmet',  name:'Helmet Homologation', required:!!req.helmet, ...classify(driver.helmet_cert_expiry, !!req.helmet) },
    { key:'consent', name:'Guardian Consent', required:needsConsent, ...classify(driver.consent_expiry, needsConsent) },
  ];
  rows.forEach(r => { r.overridden = !!ov[r.key]; });
  return rows;
}

function docsBlocked(rows) {
  return rows.some(r => r.required && r.status === 'bad' && !r.overridden);
}
function docMiniHtml(rows) {
  if (!rows.length) return '<span class="text-secondary" style="font-size:.7rem;">—</span>';
  return '<span class="docs-mini">' + rows.map(r => {
    if (!r.required) return `<span class="doc-dot na" title="${esc(r.name)}: not required"></span>`;
    const cls = r.overridden ? 'over' : (r.status==='bad'?'bad':r.status==='warn'?'warn':'ok');
    return `<span class="doc-dot ${cls}" title="${esc(r.name)}: ${esc(r.sub)}${r.overridden?' (overridden)':''}"></span>`;
  }).join('') + '</span>';
}

// ── Payment status ───────────────────────────────────────────────────────────
function paymentStatus(e) {
  const fee = Number(e.entry_fee||0);
  const paid = Number(e.amount_paid||0);
  if (!fee) return { key:'na', label:'n/a' };
  if (paid >= fee) return { key:'paid', label:'Paid' };
  if (paid > 0)    return { key:'part', label:`Part R${(fee-paid).toFixed(0)} owed` };
  return { key:'unpaid', label:'Unpaid' };
}

// ── Deadline pill ────────────────────────────────────────────────────────────
function deadlinePill(deadlineIso, label) {
  if (!deadlineIso) return '';
  const days = daysBetween(todayISO(), toISO(deadlineIso));
  if (days < 0)  return `<span class="deadline-pill deadline-overdue">${label||''}${days*-1}d late</span>`;
  if (days <= 7) return `<span class="deadline-pill deadline-soon">${label||''}${days}d left</span>`;
  return `<span class="deadline-pill deadline-ok">${label||''}${days}d</span>`;
}

// ── Why-not-confirmed reasoning ──────────────────────────────────────────────
function whyNotConfirmed(entry, driver, event, champ) {
  const reasons = [];
  if (entry.status === 'confirmed') return reasons;
  if (!entry.driver_id && !entry.driver_name) reasons.push('No driver assigned');
  if (!entry.event_id  && !entry.event_name)  reasons.push('No event assigned');
  const docs = evaluateDocs(driver, event && (event.start_date||event.start), entry.doc_overrides, champ);
  docs.forEach(r => {
    if (!r.required) return;
    if (r.status === 'bad' && !r.overridden) reasons.push(`${r.name}: ${r.sub.toLowerCase()}`);
  });
  const pay = paymentStatus(entry);
  if (pay.key === 'unpaid') reasons.push('Entry fee unpaid');
  else if (pay.key === 'part') reasons.push('Entry fee partially paid');
  if (entry.entry_deadline) {
    const d = daysBetween(todayISO(), toISO(entry.entry_deadline));
    if (d < 0) reasons.push(`Past entry deadline (${-d}d ago)`);
  }
  if (entry.status === 'rejected') reasons.push('Organiser rejected the entry');
  if (entry.approval_status === 'under_review') reasons.push('Awaiting approval review');
  return reasons;
}

// ── Data loading ─────────────────────────────────────────────────────────────
async function loadAll() {
  const [entriesR, drsR, evsR, champsR, pensR, incsR] = await Promise.all([
    jget('/api/entries').then(r => Array.isArray(r) ? r : (r && r.data) || []),
    (window.RTS_API ? RTS_API.getCollectionItems('drivers').catch(()=>({items:[]})) : Promise.resolve({items:[]})),
    (window.RTS_API ? RTS_API.getCollectionItems('events').catch(()=>({items:[]}))  : Promise.resolve({items:[]})),
    jget('/api/championships').then(r => Array.isArray(r) ? r : []),
    jget('/api/penalties').then(r => Array.isArray(r) ? r : []),
    jget('/api/incidents').then(r => Array.isArray(r) ? r : []),
  ]);
  allEntries   = entriesR || [];
  allDrivers   = (drsR && drsR.items) ? drsR.items : [];
  allEvents    = (evsR && evsR.items) ? evsR.items : [];
  allChamps    = champsR || [];
  allPenalties = pensR || [];
  allIncidents = incsR || [];
  buildChampDropdown('');
  buildDriverDropdown('');
  buildEventDropdown('');
  renderChampFilter();
  renderAll();
}

function renderAll() {
  renderStats();
  renderStatusCounts();
  if (viewMode === 'list')   renderList();
  else                       renderByEvent();
}

// ── Stats ────────────────────────────────────────────────────────────────────
function renderStats() {
  const t = todayISO();
  setText('statEntTotal',     allEntries.length);
  setText('statEntConfirmed', allEntries.filter(e => e.status==='confirmed').length);
  setText('statEntPending',   allEntries.filter(e => e.status==='pending').length);
  let blocked = 0, overdue = 0, owed = 0;
  allEntries.forEach(e => {
    const d = allDrivers.find(d => d.id == e.driver_id);
    const ev = allEvents.find(v => v.id == e.event_id);
    const ch = allChamps.find(c => c.id == e.championship_id);
    const docs = evaluateDocs(d, ev && (ev.start_date||ev.start), e.doc_overrides, ch);
    if (docsBlocked(docs)) blocked++;
    if (e.entry_deadline && daysBetween(t, toISO(e.entry_deadline)) < 0 && e.status !== 'confirmed' && e.status !== 'rejected') overdue++;
    const fee = Number(e.entry_fee||0), paid = Number(e.amount_paid||0);
    if (fee > paid) owed += (fee - paid);
  });
  setText('statEntBlocked', blocked);
  setText('statEntOverdue', overdue);
  setText('statEntFeesOut', fmtMoney(owed));
}

function renderStatusCounts() {
  const c = { all: allEntries.length, submitted:0, confirmed:0, pending:0, rejected:0 };
  allEntries.forEach(e => { c[e.status] = (c[e.status]||0)+1; });
  setText('cntAll',       c.all);
  setText('cntSubmitted', c.submitted||0);
  setText('cntConfirmed', c.confirmed||0);
  setText('cntPending',   c.pending||0);
  setText('cntRejected',  c.rejected||0);
  setText('cntChAll',     c.all);
}

// ── Filters ──────────────────────────────────────────────────────────────────
function visibleEntries() {
  const q = $('entSearch').value.trim().toLowerCase();
  return allEntries.filter(e => {
    if (filterStatus !== 'all' && e.status !== filterStatus) return false;
    if (filterChamp !== 'all') {
      const champName = (e.championship||'').toLowerCase();
      if (e.championship_id != filterChamp && champName !== filterChamp.toLowerCase()) return false;
    }
    if (q) {
      const driverName = ((allDrivers.find(d=>d.id==e.driver_id)||{}).name || e.driver_name || '').toLowerCase();
      const eventName  = ((allEvents.find(v=>v.id==e.event_id)||{}).name || e.event_name || '').toLowerCase();
      if (!driverName.includes(q) && !eventName.includes(q) && !(e.championship||'').toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

// ── List view ────────────────────────────────────────────────────────────────
function renderList() {
  $('viewList').style.display = '';
  $('viewByEvent').style.display = 'none';
  const rows = visibleEntries();
  setText('entCountBadge', rows.length);
  const tb = $('entTableBody');
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="8" class="text-center text-secondary py-4">No entries match.</td></tr>';
    return;
  }
  tb.innerHTML = rows.map(e => {
    const d  = allDrivers.find(x => x.id == e.driver_id);
    const ev = allEvents.find(x => x.id == e.event_id);
    const ch = allChamps.find(x => x.id == e.championship_id);
    const docs = evaluateDocs(d, ev && (ev.start_date||ev.start), e.doc_overrides, ch);
    const blocked = docsBlocked(docs);
    const pay = paymentStatus(e);
    const drName = d ? d.name : (e.driver_name || '—');
    const evName = ev ? (ev.name||ev.title) : (e.event_name || '—');
    const champName = ch ? ch.name : (e.championship || '—');
    const blockerHtml = blocked ? '<span class="blocker-pill" title="Required docs missing/expired">BLOCKED</span> ' : '';
    return `<tr data-id="${e.id}" class="${e.id==selectedId?'selected':''} ${blocked?'blocked':''}">
      <td><strong>${blockerHtml}${esc(drName)}</strong></td>
      <td>${esc(e.car_number||'—')}</td>
      <td>${esc(evName)}</td>
      <td>${esc(champName)}</td>
      <td>${deadlinePill(e.entry_deadline)}</td>
      <td><span class="status-pill status-${e.status||'pending'}">${e.status||'pending'}</span></td>
      <td>${docMiniHtml(docs)}</td>
      <td><span class="pay-pill pay-${pay.key}">${esc(pay.label)}</span></td>
    </tr>`;
  }).join('');
  tb.querySelectorAll('tr').forEach(tr => tr.addEventListener('click', () => selectEntry(tr.dataset.id)));
}

// ── By-Event view ────────────────────────────────────────────────────────────
function renderByEvent() {
  $('viewList').style.display = 'none';
  $('viewByEvent').style.display = '';
  const rows = visibleEntries();
  setText('entCountBadge', rows.length);
  // Group by event_id (fallback: event_name)
  const groups = new Map();
  rows.forEach(e => {
    const key = e.event_id || ('name:'+(e.event_name||'—'));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  });
  const host = $('viewByEvent');
  if (!groups.size) {
    host.innerHTML = '<div class="text-center text-secondary py-4">No entries match.</div>';
    return;
  }
  // Sort groups by event start date (soonest first)
  const sorted = [...groups.entries()].map(([key, list]) => {
    const evRef = allEvents.find(v => v.id == (list[0].event_id));
    const start = (evRef && (evRef.start_date||evRef.start)) || list[0].entry_date || '';
    return { key, list, evRef, start };
  }).sort((a,b) => toISO(a.start).localeCompare(toISO(b.start)));

  host.innerHTML = sorted.map(({ key, list, evRef, start }) => {
    const name = evRef ? (evRef.name||evRef.title) : (list[0].event_name||'—');
    const total = list.length;
    const confirmed = list.filter(e => e.status==='confirmed').length;
    const blocked = list.filter(e => {
      const d = allDrivers.find(x=>x.id==e.driver_id);
      const ch = allChamps.find(c=>c.id==e.championship_id);
      return docsBlocked(evaluateDocs(d, evRef && (evRef.start_date||evRef.start), e.doc_overrides, ch));
    }).length;
    const pct = total ? Math.round(100*confirmed/total) : 0;
    const dl  = evRef && evRef.entry_deadline;
    const startTxt = start ? fmtDate(start) : '';
    const rowsHtml = list.map(e => {
      const d = allDrivers.find(x=>x.id==e.driver_id);
      const drName = d ? d.name : (e.driver_name || '—');
      const ch = allChamps.find(c=>c.id==e.championship_id);
      const docs = evaluateDocs(d, evRef && (evRef.start_date||evRef.start), e.doc_overrides, ch);
      const pay = paymentStatus(e);
      return `<div class="ent-event-row ${e.id==selectedId?'selected':''}" data-id="${e.id}">
        <div><strong>${esc(drName)}</strong></div>
        <div>${esc(e.car_number||'—')}</div>
        <div><span class="status-pill status-${e.status||'pending'}">${e.status||'pending'}</span></div>
        <div>${docMiniHtml(docs)} ${docsBlocked(docs)?'<span class="blocker-pill" style="margin-left:4px;">BLOCKED</span>':''}</div>
        <div><span class="pay-pill pay-${pay.key}">${esc(pay.label)}</span></div>
      </div>`;
    }).join('');
    return `<div class="ent-event-group" data-key="${esc(key)}">
      <div class="ent-event-head">
        <div class="ent-event-title">${esc(name)}</div>
        <div class="ent-event-meta">${startTxt ? startTxt+' · ' : ''}${confirmed}/${total} confirmed${blocked?` · <span style="color:#b91c1c;font-weight:700;">${blocked} blocked</span>`:''}${dl?' · '+deadlinePill(dl,'entry '):''}</div>
        <i class="bi bi-chevron-down" style="font-size:.85rem;opacity:.6;"></i>
      </div>
      <div class="ent-event-progress"><div class="bar" style="width:${pct}%"></div></div>
      <div class="ent-event-body open">${rowsHtml}</div>
    </div>`;
  }).join('');
  // attach listeners
  host.querySelectorAll('.ent-event-head').forEach(h => {
    h.addEventListener('click', () => {
      const body = h.parentElement.querySelector('.ent-event-body');
      body.classList.toggle('open');
    });
  });
  host.querySelectorAll('.ent-event-row').forEach(r => {
    r.addEventListener('click', (e) => { e.stopPropagation(); selectEntry(r.dataset.id); });
  });
}

// ── Championship filter list ─────────────────────────────────────────────────
function renderChampFilter() {
  const counts = { all: allEntries.length };
  allEntries.forEach(e => {
    const key = e.championship_id || e.championship || '—';
    counts[key] = (counts[key]||0)+1;
  });
  const ul = $('entChampFilter');
  ul.innerHTML = `<li class="${filterChamp==='all'?'active':''}" data-champ="all">All<span class="count-badge">${counts.all}</span></li>` +
    allChamps.map(c => `<li class="${filterChamp==c.id?'active':''}" data-champ="${esc(c.id)}">${esc(c.name)}<span class="count-badge">${counts[c.id]||0}</span></li>`).join('');
  ul.querySelectorAll('li').forEach(li => li.addEventListener('click', () => {
    ul.querySelectorAll('li').forEach(x=>x.classList.remove('active'));
    li.classList.add('active');
    filterChamp = li.dataset.champ;
    renderAll();
  }));
}

// ── Combo dropdowns ──────────────────────────────────────────────────────────
function buildDriverDropdown(selId) {
  const list = $('cdDriverList'); const span = $('cdDriverVal'); const input = $('entFDriver');
  list.innerHTML = '';
  allDrivers.forEach(d => {
    const el = document.createElement('div');
    el.className = 'ent-cdrop-item' + (d.id == selId ? ' active' : '');
    el.dataset.id = d.id;
    const dot = `<span class="ent-drv-dot" style="background:${d.color||'#bbb'}"></span>`;
    const num = d.race_number ? `<span class="ent-drv-num">#${esc(d.race_number)}</span>` : '';
    el.innerHTML = `${dot}<span style="flex:1">${esc(d.name)}</span>${num}`;
    el.addEventListener('click', () => {
      input.value = d.id;
      span.textContent = d.name; span.style.color = '';
      closeCDrops();
      onDriverChanged(d);
    });
    list.appendChild(el);
  });
  const dr = allDrivers.find(d => d.id == selId);
  if (dr) { span.textContent = dr.name; span.style.color = ''; input.value = dr.id; }
  else    { span.textContent = '— Select Driver —'; span.style.color = '#6c757d'; input.value = ''; }
}

function buildEventDropdown(selId) {
  const list = $('cdEventList'); const span = $('cdEventVal'); const input = $('entFEvent');
  list.innerHTML = '';
  // sort soonest first
  const sorted = [...allEvents].sort((a,b) => toISO(a.start_date||a.start||'').localeCompare(toISO(b.start_date||b.start||'')));
  sorted.forEach(e => {
    const el = document.createElement('div');
    el.className = 'ent-cdrop-item' + (e.id == selId ? ' active' : '');
    el.dataset.id = e.id;
    const d = fmtDate(e.start_date||e.start);
    el.innerHTML = `<span style="flex:1">${esc(e.name||e.title)}</span>${d?`<span class="ent-ev-date">${d}</span>`:''}` ;
    el.addEventListener('click', () => {
      input.value = e.id;
      span.textContent = d ? `${e.name||e.title}  ·  ${d}` : (e.name||e.title); span.style.color = '';
      closeCDrops();
      onEventChanged(e);
    });
    list.appendChild(el);
  });
  const ev = sorted.find(e => e.id == selId);
  if (ev) {
    const d = fmtDate(ev.start_date||ev.start);
    span.textContent = d ? `${ev.name||ev.title}  ·  ${d}` : (ev.name||ev.title);
    span.style.color = ''; input.value = ev.id;
  } else {
    span.textContent = '— Select Event —'; span.style.color = '#6c757d'; input.value = '';
  }
}

function buildChampDropdown(selId) {
  const list = $('cdChampList'); const span = $('cdChampVal'); const input = $('entFChampId');
  list.innerHTML = '';
  // add "(none)" entry
  const noneEl = document.createElement('div');
  noneEl.className = 'ent-cdrop-item' + (!selId ? ' active' : '');
  noneEl.innerHTML = `<span style="flex:1;color:#6c757d;font-style:italic;">— None / free text —</span>`;
  noneEl.addEventListener('click', () => {
    input.value = ''; span.textContent = '— Select or type below —'; span.style.color = '#6c757d';
    closeCDrops(); onChampChanged(null);
  });
  list.appendChild(noneEl);
  allChamps.forEach(c => {
    const el = document.createElement('div');
    el.className = 'ent-cdrop-item' + (c.id == selId ? ' active' : '');
    el.dataset.id = c.id;
    const feeTag = c.default_fee ? `<span class="ent-drv-num">${fmtMoney(c.default_fee)}</span>` : '';
    el.innerHTML = `<span style="flex:1">${esc(c.name)}</span>${feeTag}`;
    el.addEventListener('click', () => {
      input.value = c.id;
      span.textContent = c.name; span.style.color = '';
      closeCDrops(); onChampChanged(c);
    });
    list.appendChild(el);
  });
  const ch = allChamps.find(c => c.id == selId);
  if (ch) { span.textContent = ch.name; span.style.color = ''; input.value = ch.id; }
  else    { span.textContent = '— Select or type below —'; span.style.color = '#6c757d'; input.value = ''; }
}

function filterCDropList(listId, q) {
  $(listId).querySelectorAll('.ent-cdrop-item').forEach(el => {
    el.style.display = el.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
}
function closeCDrops() {
  $('cdDriverMenu').style.display='none';
  $('cdEventMenu').style.display='none';
  $('cdChampMenu').style.display='none';
}

// ── Field-change handlers (auto-prefill) ─────────────────────────────────────
function onDriverChanged(driver) {
  if (!driver) return;
  // Prefill licence + car # if blank
  if (!$('entFLicence').value && driver.license_number) $('entFLicence').value = driver.license_number;
  if (!$('entFCarNum').value  && driver.race_number)    $('entFCarNum').value  = driver.race_number;
  refreshDerived();
}
function onEventChanged(ev) {
  if (!ev) return;
  if (!$('entFDeadline').value    && ev.entry_deadline)   $('entFDeadline').value    = toISO(ev.entry_deadline);
  if (!$('entFPayDeadline').value && ev.payment_deadline) $('entFPayDeadline').value = toISO(ev.payment_deadline);
  if (!$('entFFee').value         && ev.entry_fee != null) $('entFFee').value        = ev.entry_fee;
  refreshDerived();
}
function onChampChanged(c) {
  if (c) {
    if (!$('entFChampionship').value) $('entFChampionship').value = c.name;
    if (!$('entFFee').value && c.default_fee != null) $('entFFee').value = c.default_fee;
  }
  refreshDerived();
}

// ── Refresh derived UI panels (doc readiness, why-not, flags, payment status)
function refreshDerived() {
  const driver = allDrivers.find(d => d.id == $('entFDriver').value);
  const ev     = allEvents.find(v => v.id == $('entFEvent').value);
  const champ  = allChamps.find(c => c.id == $('entFChampId').value);
  const entryDraft = collectFormToEntry();
  // Doc readiness
  const docs = evaluateDocs(driver, ev && (ev.start_date||ev.start), entryDraft.doc_overrides, champ);
  renderDocPanel(docs);
  // Override reason visibility
  const anyOverride = docs.some(r => r.overridden);
  $('entOverrideWrap').style.display = anyOverride ? '' : 'none';
  // Blocker banner
  const blocked = docsBlocked(docs);
  const banner = $('entBlockerBanner');
  if (blocked) {
    banner.style.display = '';
    banner.innerHTML = '<i class="bi bi-shield-exclamation"></i> Driver is BLOCKED: required documents missing or expire before the event. Override individual docs below if accepted.';
  } else { banner.style.display = 'none'; }
  // Payment status
  const pay = paymentStatus(entryDraft);
  const ps = $('entPayStatus');
  ps.className = 'pay-pill pay-' + pay.key;
  ps.textContent = pay.label;
  // Why-not list
  const why = whyNotConfirmed(entryDraft, driver, ev, champ);
  $('entWhyNot').innerHTML = why.length
    ? '<ul class="ent-why-list">' + why.map(r => `<li>${esc(r)}</li>`).join('') + '</ul>'
    : '<div class="ent-why-empty"><i class="bi bi-check-circle-fill"></i> No outstanding blockers — eligible to confirm.</div>';
  // Driver flags
  renderDriverFlags(driver);
}

function collectFormToEntry() {
  // Read current form into an entry-shaped object (for previewing payment/why-not)
  const overrides = {};
  document.querySelectorAll('.ent-doc-override').forEach(cb => {
    if (cb.checked) overrides[cb.dataset.key] = true;
  });
  return {
    driver_id:      $('entFDriver').value || null,
    event_id:       $('entFEvent').value  || null,
    championship_id:$('entFChampId').value|| null,
    championship:   $('entFChampionship').value || '',
    car_number:     $('entFCarNum').value || '',
    licence_number: $('entFLicence').value || '',
    entry_date:     $('entFDate').value || null,
    entry_deadline: $('entFDeadline').value || null,
    payment_deadline: $('entFPayDeadline').value || null,
    entry_fee:      $('entFFee').value === '' ? null : Number($('entFFee').value),
    amount_paid:    $('entFPaid').value === '' ? null : Number($('entFPaid').value),
    paid_date:      $('entFPaidDate').value || null,
    payment_ref:    $('entFPayRef').value || '',
    status:         $('entFStatus').value || 'pending',
    approval_status:$('entFApproval').value || null,
    notes:          $('entFNotes').value || '',
    doc_overrides:  overrides,
    override_reason:$('entFOverrideReason').value || ''
  };
}

function renderDocPanel(docs) {
  const host = $('entDocPanel');
  if (!docs.length) { host.innerHTML = '<div class="text-secondary" style="font-size:.78rem;">Pick a driver to check documents.</div>'; return; }
  host.innerHTML = docs.map(r => {
    const cls = !r.required ? '' : r.status==='bad' ? 'bad' : r.status==='warn' ? 'warn' : '';
    const statusCls = r.overridden ? 'over' : (r.status==='bad'?'bad':r.status==='warn'?'warn':'ok');
    const statusLabel = !r.required ? 'N/A' : (r.overridden ? 'OVERRIDE' : r.status.toUpperCase());
    return `<div class="ent-doc-row ${cls}">
      <div><div class="doc-name">${esc(r.name)}</div><div class="doc-sub">${esc(r.sub)}${r.required?'':' (not required)'}</div></div>
      <span class="doc-status ${statusCls}">${statusLabel}</span>
      <label class="form-check" title="Override — accept despite issue"><input type="checkbox" class="form-check-input ent-doc-override" data-key="${r.key}" ${r.overridden?'checked':''} ${(!r.required||r.status==='ok')?'disabled':''}>Override</label>
    </div>`;
  }).join('');
  host.querySelectorAll('.ent-doc-override').forEach(cb => cb.addEventListener('change', refreshDerived));
}

function renderDriverFlags(driver) {
  const host = $('entDriverFlags');
  if (!driver) { host.innerHTML = '<div class="text-secondary" style="font-size:.78rem;">No driver selected.</div>'; return; }
  const drName = (driver.name||'').toLowerCase();
  const openPens = allPenalties.filter(p => (p.driver_name||'').toLowerCase()===drName && (p.status||'').toLowerCase() !== 'resolved' && (p.status||'').toLowerCase() !== 'closed');
  const openIncs = allIncidents.filter(i => i.driver_id == driver.id && (i.status||'').toLowerCase() !== 'resolved' && (i.status||'').toLowerCase() !== 'closed');
  if (!openPens.length && !openIncs.length) {
    host.innerHTML = '<div style="font-size:.78rem;color:#065f46;font-weight:600;"><i class="bi bi-check-circle-fill"></i> No open penalties or incidents.</div>';
    return;
  }
  const html = [];
  openPens.forEach(p => {
    html.push(`<div class="flag"><span class="ent-flag-icon ent-flag-pen"><i class="bi bi-exclamation-octagon-fill"></i></span><div><strong>Penalty:</strong> ${esc(p.penalty_type||'—')} ${p.time_penalty?'+ '+p.time_penalty+'s':''} ${p.points_penalty?'+ '+p.points_penalty+'pt':''}<br><span class="text-secondary">${esc(p.event_name||'')} — ${esc(p.reason||'')}</span></div></div>`);
  });
  openIncs.forEach(i => {
    html.push(`<div class="flag"><span class="ent-flag-icon ent-flag-inc"><i class="bi bi-shield-exclamation"></i></span><div><strong>Incident (${esc(i.severity||'Medium')}):</strong> ${esc(i.title||'—')}<br><span class="text-secondary">${esc(i.narrative||'').slice(0,90)}</span></div></div>`);
  });
  host.innerHTML = html.join('');
}

// ── Form selection / save / delete ───────────────────────────────────────────
function selectEntry(id) {
  selectedId = id;
  const e = allEntries.find(x => x.id == id);
  if (!e) return;
  $('entDetailEmpty').style.display = 'none';
  $('entForm').style.display = '';
  const drName = ((allDrivers.find(d=>d.id==e.driver_id)||{}).name) || e.driver_name || 'Entry Detail';
  setText('entDetailTitle', drName);
  buildDriverDropdown(e.driver_id || '');
  buildEventDropdown(e.event_id || '');
  buildChampDropdown(e.championship_id || '');
  $('entFCarNum').value         = e.car_number       || '';
  $('entFLicence').value        = e.licence_number   || '';
  $('entFChampionship').value   = e.championship     || '';
  $('entFDate').value           = toISO(e.entry_date) || '';
  $('entFDeadline').value       = toISO(e.entry_deadline) || '';
  $('entFPayDeadline').value    = toISO(e.payment_deadline) || '';
  $('entFFee').value             = e.entry_fee    != null ? e.entry_fee    : '';
  $('entFPaid').value            = e.amount_paid  != null ? e.amount_paid  : '';
  $('entFPaidDate').value        = toISO(e.paid_date) || '';
  $('entFPayRef').value          = e.payment_ref || '';
  $('entFStatus').value          = e.status        || 'pending';
  $('entFApproval').value        = e.approval_status || '';
  $('entFNotes').value           = e.notes || '';
  $('entFOverrideReason').value  = e.override_reason || '';
  $('entBtnDelete').style.display = '';
  $('entBtnPrintForm').style.display = '';
  refreshDerived();
  if (viewMode === 'list') renderList(); else renderByEvent();
}

function newEntryForm() {
  selectedId = null;
  $('entDetailEmpty').style.display = 'none';
  $('entForm').style.display = '';
  setText('entDetailTitle', 'New Entry');
  ['entFCarNum','entFLicence','entFChampionship','entFDate','entFDeadline','entFPayDeadline',
   'entFFee','entFPaid','entFPaidDate','entFPayRef','entFNotes','entFOverrideReason'].forEach(id => $(id).value = '');
  $('entFStatus').value = 'pending';
  $('entFApproval').value = '';
  buildDriverDropdown('');
  buildEventDropdown('');
  buildChampDropdown('');
  $('entBtnDelete').style.display = 'none';
  $('entBtnPrintForm').style.display = 'none';
  refreshDerived();
}

async function saveEntry() {
  const body = collectFormToEntry();
  const driverId = body.driver_id;
  const eventId  = body.event_id;
  const drName   = (allDrivers.find(d => d.id == driverId)||{}).name || '';
  const evObj    = allEvents.find(v => v.id == eventId);
  const evName   = evObj ? (evObj.name||evObj.title) : '';
  if (!drName) { uiAlert('Please select a driver.'); return; }
  if (!evName) { uiAlert('Please select an event.'); return; }
  body.driver_name = drName;
  body.event_name  = evName;
  body.event       = evName;
  // required_documents (legacy) — keep last manual text intact if any
  try {
    const url = selectedId ? `/api/entries/${selectedId}` : '/api/entries';
    const method = selectedId ? 'PUT' : 'POST';
    const r = await authFetch(url, { method, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    const saved = await r.json();
    selectedId = saved.id;
    await loadAll();
    selectEntry(selectedId);
  } catch (e) {
    console.error('[entries] saveEntry failed:', e);
    uiAlert((e && e.message) || String(e), 'Save failed');
  }
}

async function deleteEntry() {
  if (!selectedId) return;
  const ok = await uiConfirm('Delete this entry?');
  if (!ok) return;
  try {
    await authFetch(`/api/entries/${selectedId}`, { method: 'DELETE' });
    selectedId = null;
    $('entDetailEmpty').style.display = '';
    $('entForm').style.display = 'none';
    await loadAll();
  } catch (e) {
    console.error('[entries] deleteEntry failed:', e);
    uiAlert((e && e.message) || String(e), 'Delete failed');
  }
}

// ── Print entry form ─────────────────────────────────────────────────────────
function printEntryForm() {
  if (!selectedId) return;
  const e  = allEntries.find(x => x.id == selectedId);
  const d  = allDrivers.find(x => x.id == e.driver_id);
  const ev = allEvents.find(x => x.id == e.event_id);
  const ch = allChamps.find(x => x.id == e.championship_id);
  const docs = evaluateDocs(d, ev && (ev.start_date||ev.start), e.doc_overrides, ch);
  const pay = paymentStatus(e);
  const host = $('printForm');
  host.innerHTML = `
    <h2>Competition Entry Form</h2>
    <table>
      <tr><td class="label">Event</td><td>${esc(ev ? (ev.name||ev.title) : (e.event_name||''))}</td></tr>
      <tr><td class="label">Championship</td><td>${esc(ch ? ch.name : (e.championship||''))}</td></tr>
      <tr><td class="label">Start Date</td><td>${esc(ev ? fmtDate(ev.start_date||ev.start) : '')}</td></tr>
      <tr><td class="label">Circuit</td><td>${esc(ev ? (ev.circuit||ev.venue||'') : '')}</td></tr>
    </table>
    <h3 style="font-size:1rem;margin-top:14px;">Competitor</h3>
    <table>
      <tr><td class="label">Driver</td><td>${esc(d ? d.name : (e.driver_name||''))}</td></tr>
      <tr><td class="label">Race Number</td><td>${esc(e.car_number||'')}</td></tr>
      <tr><td class="label">Licence Number</td><td>${esc(e.licence_number||'')}</td></tr>
      <tr><td class="label">Date of Birth</td><td>${d && d.date_of_birth ? fmtDate(d.date_of_birth) : ''}</td></tr>
      <tr><td class="label">Nationality</td><td>${esc((d && d.nationality)||'')}</td></tr>
      <tr><td class="label">Email</td><td>${esc((d && d.contact_email)||'')}</td></tr>
      <tr><td class="label">Phone</td><td>${esc((d && d.contact_phone)||'')}</td></tr>
    </table>
    <h3 style="font-size:1rem;margin-top:14px;">Documents</h3>
    <table>${docs.map(r => `<tr><td class="label">${esc(r.name)}</td><td>${esc(r.sub)}${r.overridden?' — OVERRIDE ACCEPTED':''}</td></tr>`).join('')}</table>
    <h3 style="font-size:1rem;margin-top:14px;">Payment</h3>
    <table>
      <tr><td class="label">Entry Fee</td><td>${fmtMoney(e.entry_fee||0)}</td></tr>
      <tr><td class="label">Amount Paid</td><td>${fmtMoney(e.amount_paid||0)}</td></tr>
      <tr><td class="label">Paid Date</td><td>${e.paid_date ? fmtDate(e.paid_date) : ''}</td></tr>
      <tr><td class="label">Reference</td><td>${esc(e.payment_ref||'')}</td></tr>
      <tr><td class="label">Status</td><td>${esc(pay.label)}</td></tr>
    </table>
    <h3 style="font-size:1rem;margin-top:14px;">Declaration</h3>
    <p style="font-size:.85rem;">I, the undersigned competitor, confirm that the information provided is accurate and that all required documents are valid and in my possession.</p>
    <table>
      <tr><td class="label">Signed</td><td style="height:50px;"></td></tr>
      <tr><td class="label">Date</td><td style="height:30px;"></td></tr>
    </table>`;
  setTimeout(() => window.print(), 50);
}

// ── Bulk modal ───────────────────────────────────────────────────────────────
let bulkModalRef = null;
function openBulkModal() {
  const sel = $('bulkEvent');
  const sorted = [...allEvents].sort((a,b)=>toISO(a.start_date||a.start||'').localeCompare(toISO(b.start_date||b.start||'')));
  const upcoming = sorted.filter(e => toISO(e.start_date||e.start||'') >= todayISO());
  const list = upcoming.length ? upcoming : sorted;
  sel.innerHTML = list.map(e => `<option value="${esc(e.id)}">${esc((e.name||e.title)||'(unnamed)')}${e.start_date||e.start?'  ·  '+fmtDate(e.start_date||e.start):''}</option>`).join('');
  const champSel = $('bulkChamp');
  champSel.innerHTML = '<option value="">—</option>' + allChamps.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  sel.onchange = bulkPopulateFromEvent;
  champSel.onchange = bulkPopulateFromEvent;
  bulkPopulateFromEvent();
  bulkModalRef = bulkModalRef || new bootstrap.Modal($('bulkModal'));
  bulkModalRef.show();
}
function bulkPopulateFromEvent() {
  const ev = allEvents.find(e => e.id == $('bulkEvent').value);
  if (!ev) { $('bulkDriverList').innerHTML = ''; return; }
  $('bulkEntryDeadline').value = toISO(ev.entry_deadline) || '';
  $('bulkPayDeadline').value   = toISO(ev.payment_deadline) || '';
  $('bulkFee').value           = ev.entry_fee != null ? ev.entry_fee : '';
  const champ = allChamps.find(c => c.id == $('bulkChamp').value);
  if (champ && champ.default_fee != null && !$('bulkFee').value) $('bulkFee').value = champ.default_fee;
  // Drivers attending: ev.drivers may be array of {id} or strings
  let attending = [];
  if (Array.isArray(ev.drivers)) attending = ev.drivers.map(x => typeof x === 'string' ? x : (x && x.id) || '').filter(Boolean);
  const host = $('bulkDriverList');
  host.innerHTML = allDrivers.map(d => {
    const checked = attending.includes(d.id) ? 'checked' : '';
    return `<label class="ent-modal-driver"><input type="checkbox" class="form-check-input bulk-drv" data-id="${esc(d.id)}" ${checked}> <span class="ent-drv-dot" style="background:${d.color||'#bbb'}"></span><span style="flex:1;">${esc(d.name)}</span>${d.race_number?`<span class="ent-drv-num">#${esc(d.race_number)}</span>`:''}</label>`;
  }).join('');
}
async function bulkSubmit() {
  const ev = allEvents.find(e => e.id == $('bulkEvent').value);
  if (!ev) { uiAlert('Pick an event.'); return; }
  const driverIds = [...document.querySelectorAll('.bulk-drv:checked')].map(cb => cb.dataset.id);
  if (!driverIds.length) { uiAlert('Pick at least one driver.'); return; }
  const champ = allChamps.find(c => c.id == $('bulkChamp').value);
  const body = {
    event_id: ev.id,
    event_name: ev.name || ev.title || '',
    driver_ids: driverIds,
    championship: champ ? champ.name : '',
    championship_id: champ ? champ.id : null,
    entry_deadline: $('bulkEntryDeadline').value || null,
    payment_deadline: $('bulkPayDeadline').value || null,
    entry_fee: $('bulkFee').value === '' ? null : Number($('bulkFee').value),
    status: $('bulkStatus').value || 'pending'
  };
  try {
    const r = await authFetch('/api/entries/bulk', { method:'POST', body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    const out = await r.json();
    bulkModalRef.hide();
    await loadAll();
    uiAlert(`Created ${out.inserted.length} entries. Skipped ${out.skipped.length} (already exist).`, 'Bulk create');
  } catch (e) {
    console.error('[entries] bulkSubmit failed:', e);
    uiAlert((e && e.message) || String(e), 'Bulk create failed');
  }
}

// ── Championships modal ──────────────────────────────────────────────────────
let champModalRef = null;
function openChampModal() {
  renderChampRows();
  champModalRef = champModalRef || new bootstrap.Modal($('champModal'));
  champModalRef.show();
}
function renderChampRows() {
  const host = $('champRows');
  host.innerHTML = allChamps.map(c => `
    <div class="ent-champ-row" data-id="${esc(c.id)}">
      <input class="form-control form-control-sm ch-f-name" value="${esc(c.name)}" />
      <input class="form-control form-control-sm ch-f-body" value="${esc(c.sanctioning_body||'')}" />
      <input class="form-control form-control-sm ch-f-season" value="${esc(c.season||'')}" />
      <input class="form-control form-control-sm ch-f-fee" type="number" min="0" step="0.01" value="${c.default_fee!=null?c.default_fee:''}" />
      <div class="d-flex gap-1">
        <button class="btn btn-sm btn-outline-primary ch-save"><i class="bi bi-check-lg"></i></button>
        <button class="btn btn-sm btn-outline-danger  ch-del"><i class="bi bi-trash"></i></button>
      </div>
    </div>`).join('') || '<div class="text-secondary text-center py-3">No championships yet. Click "Add Championship" above.</div>';
  host.querySelectorAll('.ent-champ-row').forEach(row => {
    row.querySelector('.ch-save').addEventListener('click', () => saveChamp(row));
    row.querySelector('.ch-del').addEventListener('click',  () => deleteChamp(row.dataset.id));
  });
}
async function addChamp() {
  const name = await uiPrompt('Championship name?');
  if (!name) return;
  try {
    const r = await authFetch('/api/championships', { method:'POST', body: JSON.stringify({ name }) });
    if (!r.ok) throw new Error(await r.text());
    await reloadChampsOnly();
    renderChampRows();
  } catch (e) {
    console.error('[entries] addChamp failed:', e);
    uiAlert((e && e.message) || String(e), 'Add failed');
  }
}
async function saveChamp(row) {
  const id = row.dataset.id;
  const body = {
    name:             row.querySelector('.ch-f-name').value.trim(),
    sanctioning_body: row.querySelector('.ch-f-body').value.trim(),
    season:           row.querySelector('.ch-f-season').value.trim(),
    default_fee:      row.querySelector('.ch-f-fee').value === '' ? null : Number(row.querySelector('.ch-f-fee').value)
  };
  try {
    const r = await authFetch('/api/championships/'+id, { method:'PUT', body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    await reloadChampsOnly();
    renderAll();
  } catch (e) {
    console.error('[entries] saveChamp failed:', e);
    uiAlert((e && e.message) || String(e), 'Save failed');
  }
}

async function deleteChamp(id) {
  const ok = await uiConfirm('Delete this championship? Existing entries that reference it will keep their text label.');
  if (!ok) return;
  try {
    await authFetch('/api/championships/'+id, { method:'DELETE' });
    await reloadChampsOnly();
    renderChampRows();
    renderAll();
  } catch (e) {
    console.error('[entries] deleteChamp failed:', e);
    uiAlert((e && e.message) || String(e), 'Delete failed');
  }
}
async function reloadChampsOnly() {
  allChamps = (await jget('/api/championships')) || [];
  buildChampDropdown($('entFChampId').value || '');
  renderChampFilter();
}

// ── Wire up UI ───────────────────────────────────────────────────────────────
function wire() {
  $('btnAddEntry').addEventListener('click', newEntryForm);
  $('btnBulkFromEvent').addEventListener('click', openBulkModal);
  $('btnManageChamps').addEventListener('click', openChampModal);
  $('champAddBtn').addEventListener('click', addChamp);
  $('bulkSubmit').addEventListener('click', bulkSubmit);

  $('entBtnSave').addEventListener('click', saveEntry);
  $('entBtnDelete').addEventListener('click', deleteEntry);
  $('entBtnPrintForm').addEventListener('click', printEntryForm);
  $('entBtnCancel').addEventListener('click', () => {
    $('entForm').style.display = 'none';
    $('entDetailEmpty').style.display = '';
    selectedId = null;
    renderAll();
  });
  $('entSearch').addEventListener('input', renderAll);

  document.querySelectorAll('#entStatusFilter li').forEach(li => li.addEventListener('click', () => {
    document.querySelectorAll('#entStatusFilter li').forEach(x => x.classList.remove('active'));
    li.classList.add('active'); filterStatus = li.dataset.filter; renderAll();
  }));

  // View toggle
  document.querySelectorAll('#viewToggle .view-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#viewToggle .view-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); viewMode = b.dataset.view; renderAll();
  }));

  // Combo dropdown toggles
  $('cdDriverBtn').addEventListener('click', () => {
    const m = $('cdDriverMenu'); const open = m.style.display !== 'none'; closeCDrops();
    if (!open) { m.style.display=''; $('cdDriverSearch').focus(); }
  });
  $('cdEventBtn').addEventListener('click', () => {
    const m = $('cdEventMenu'); const open = m.style.display !== 'none'; closeCDrops();
    if (!open) { m.style.display=''; $('cdEventSearch').focus(); }
  });
  $('cdChampBtn').addEventListener('click', () => {
    const m = $('cdChampMenu'); const open = m.style.display !== 'none'; closeCDrops();
    if (!open) { m.style.display=''; $('cdChampSearch').focus(); }
  });
  $('cdDriverSearch').addEventListener('input', e => filterCDropList('cdDriverList', e.target.value));
  $('cdEventSearch').addEventListener('input',  e => filterCDropList('cdEventList',  e.target.value));
  $('cdChampSearch').addEventListener('input',  e => filterCDropList('cdChampList',  e.target.value));
  document.addEventListener('click', e => {
    if (!e.target.closest('#cdDriver') && !e.target.closest('#cdEvent') && !e.target.closest('#cdChamp')) closeCDrops();
  });

  // Auto-recalc derived UI as user edits payment / dates / status / override reason
  ['entFFee','entFPaid','entFPaidDate','entFPayRef','entFStatus','entFApproval','entFDeadline','entFPayDeadline','entFCarNum','entFLicence','entFChampionship','entFOverrideReason']
    .forEach(id => $(id).addEventListener('input', refreshDerived));
}

document.addEventListener('DOMContentLoaded', () => {
  wire();
  loadAll();
  // Surface any uncaught error in the custom dialog instead of native alert
  window.addEventListener('error', ev => {
    if (!ev || !ev.error) return;
    console.error('[entries] uncaught:', ev.error);
    try { uiAlert((ev.error && ev.error.message) || String(ev.message||ev), 'Unexpected error'); } catch(_){}
  });
  window.addEventListener('unhandledrejection', ev => {
    console.error('[entries] unhandled rejection:', ev.reason);
    try { uiAlert((ev.reason && ev.reason.message) || String(ev.reason||''), 'Unexpected error'); } catch(_){}
  });
});
})();
