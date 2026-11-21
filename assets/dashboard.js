/* ==========================================================================
   dashboard.js — MDRRMO / LGU web dashboard
   ========================================================================== */

import {
  ROLES, catchSummary, catchesToCSV, evaluateAlerts, fmtAgo, fmtClock,
  fmtDateTime, fmtDuration, fmtTime, getDB, latestAdvisory, now, resetDB,
  saveDB, setClockOffset, clockOffset, tripState, tripsWithFishers, addAudit,
} from './store.js';
import { renderChart } from './map.js';

const $ = (sel) => document.querySelector(sel);
const el = {};

const ui = {
  role: 'mdrrmo',
  modalTripId: null,
};

/* --------------------------------------------------------------- helpers */

function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function badgeFor(state) {
  const map = {
    active: ['green', 'At sea'],
    grace: ['yellow', 'Within grace'],
    overdue: ['red', 'Overdue'],
    returned: ['grey', 'Returned'],
  };
  const [cls, label] = map[state.key] || ['grey', state.label];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

function toast(message) {
  el.toast.textContent = message;
  el.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.remove('show'), 2600);
}

function perms() {
  return ROLES[ui.role];
}

/* --------------------------------------------------------------- clock */

function renderClock() {
  const offset = clockOffset();
  const hours = offset / 3600000;
  el.simTime.textContent = fmtClock(now());
  if (!offset) {
    el.offsetTag.textContent = 'live';
  } else {
    const sign = hours > 0 ? '+' : '';
    el.offsetTag.textContent = `${sign}${hours.toFixed(2).replace(/\.?0+$/, '')} h`;
  }
}

/* --------------------------------------------------------------- KPIs */

function renderKPIs(db) {
  const trips = tripsWithFishers(db);
  const active = trips.filter((t) => t.status === 'active');
  const overdue = active.filter((t) => tripState(t, db).key === 'overdue');
  const alertDay = db.alerts.filter((a) => a.raisedAt > now() - 86400000);
  const advisory = latestAdvisory(db);

  const levelBadge = advisory
    ? `<span class="badge ${advisory.level === 'green' ? 'green' : advisory.level === 'yellow' ? 'yellow' : 'red'}">${advisory.level.toUpperCase()}</span>`
    : '<span class="badge grey">none</span>';

  el.kpis.innerHTML = `
    <div class="kpi is-active">
      <span class="kpi-label">Active trips</span>
      <span class="kpi-value">${active.length}</span>
      <span class="kpi-note">${active.reduce((n, t) => n + (t.crew || 0), 0)} persons at sea</span>
    </div>
    <div class="kpi is-overdue">
      <span class="kpi-label">Overdue now</span>
      <span class="kpi-value">${overdue.length}</span>
      <span class="kpi-note">${overdue.length ? 'Past the expected return' : 'All trips accounted for'}</span>
    </div>
    <div class="kpi is-info">
      <span class="kpi-label">Alerts (24 h)</span>
      <span class="kpi-value">${alertDay.length}</span>
      <span class="kpi-note">${db.alerts.filter((a) => !a.closedAt).length} still open</span>
    </div>
    <div class="kpi">
      <span class="kpi-label">Advisory in force</span>
      <span class="kpi-value" style="font-size:20px;display:flex;align-items:center;gap:8px;margin-top:4px">
        ${levelBadge}
      </span>
      <span class="kpi-note">${advisory ? esc(advisory.headline) : 'No advisory published'}</span>
    </div>`;
}

/* --------------------------------------------------------------- map */

function renderMap(db) {
  const trips = tripsWithFishers(db)
    .filter((t) => t.status === 'active')
    .map((t) => ({
      ...t,
      trail: db.checkins
        .filter((c) => c.tripId === t.id)
        .sort((a, b) => a.deviceTime - b.deviceTime),
    }));

  if (!perms().positions) {
    el.map.innerHTML = `
      <div class="masked">
        <div>
          <strong>Position data hidden for this role</strong>
          MDRRMO operations and administrator accounts can view fisher locations.<br>
          The MAO account sees catch records only. Every view of a trail is logged.
        </div>
      </div>`;
    el.mapHint.textContent = 'Restricted';
    return;
  }

  el.mapHint.textContent = `${trips.length} active · updated ${fmtClock(now())}`;
  renderChart(el.map, {
    trips,
    stateOf: (trip) => tripState(trip, db),
    onSelect: (id) => openTripModal(id),
  });
}

/* --------------------------------------------------------------- trips */

function renderTrips(db) {
  const trips = tripsWithFishers(db).sort((a, b) => {
    const rank = (t) => ({ overdue: 0, grace: 1, active: 2, returned: 3 }[tripState(t, db).key] ?? 4);
    return rank(a) - rank(b) || a.expectedReturn - b.expectedReturn;
  });

  const rows = trips.map((trip) => {
    const state = tripState(trip, db);
    const eta = state.key === 'overdue'
      ? `${fmtTime(trip.expectedReturn)}<br><span style="color:#b42318">${fmtDuration(state.overdueMin)} late</span>`
      : state.key === 'grace'
        ? `${fmtTime(trip.expectedReturn)}<br><span style="color:#9a6700">+${fmtDuration(state.overdueMin)} used</span>`
        : state.key === 'returned'
          ? `${fmtTime(trip.expectedReturn)}<br><span style="color:#64748b">closed ${fmtTime(trip.closedAt)}</span>`
          : `${fmtTime(trip.expectedReturn)}<br><span style="color:#157f3d">in ${fmtDuration(state.remainingMin)}</span>`;

    return `
      <tr>
        <td>${badgeFor(state)}</td>
        <td class="who">${esc(trip.fisher.name)}</td>
        <td class="boat-name">${esc(trip.fisher.boat)}<br>${trip.crew || 0} crew</td>
        <td>${esc(trip.area)}</td>
        <td class="num">${fmtTime(trip.departedAt)}</td>
        <td class="num">${eta}</td>
        <td class="num">${trip.lastCheckin ? `${fmtTime(trip.lastCheckin.deviceTime)}<br><span style="color:#64748b">${fmtAgo(trip.lastCheckin.deviceTime)}</span>` : '<span style="color:#94a3b8">none</span>'}</td>
        <td><button class="btn btn-sm" data-trip="${trip.id}">Trail</button></td>
      </tr>`;
  }).join('');

  el.trips.innerHTML = `
    <table class="tbl">
      <thead>
        <tr>
          <th>Status</th><th>Fisher</th><th>Boat</th><th>Fishing ground</th>
          <th>Departed</th><th>Expected return</th><th>Last check-in</th><th></th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="8" class="empty">No trips recorded.</td></tr>'}</tbody>
    </table>`;

  el.trips.querySelectorAll('button[data-trip]').forEach((btn) => {
    btn.addEventListener('click', () => openTripModal(btn.getAttribute('data-trip')));
  });
}

/* --------------------------------------------------------------- alerts */

function renderAlerts(db) {
  if (!perms().alerts) {
    el.alerts.innerHTML = '<div class="empty">Alert monitoring is available to MDRRMO and administrator accounts.</div>';
    return;
  }
  const alerts = db.alerts.slice(0, 8);
  if (!alerts.length) {
    el.alerts.innerHTML = '<div class="empty">No alerts raised. Trips are within their expected return times.</div>';
    return;
  }

  el.alerts.innerHTML = alerts.map((alert) => {
    const trip = db.trips.find((t) => t.id === alert.tripId);
    const fisher = db.fishers.find((f) => f.id === (alert.fisherId || (trip && trip.fisherId))) || {};
    const open = !alert.closedAt;
    return `
      <article class="alert-item ${open ? '' : 'closed'}">
        <div><span class="badge p${alert.priority}">P${alert.priority}</span></div>
        <div class="alert-main">
          <div class="alert-title">
            ${esc(fisher.boat || 'Boat')} · ${esc(fisher.name || '')}
            ${alert.advisoryLevel === 'red' ? '<span class="badge red">Red advisory</span>' : ''}
          </div>
          <div class="alert-reason">${esc(alert.reason)}</div>
          <div class="alert-meta">
            <span>Raised ${fmtTime(alert.raisedAt)} · ${fmtAgo(alert.raisedAt)}</span>
            ${open ? '<span style="color:#b42318;font-weight:600">Open</span>' : `<span>Closed ${fmtTime(alert.closedAt)} — ${esc(alert.closedBy || 'acknowledged')}</span>`}
          </div>
          <div class="alert-meta">
            ${(alert.notified || []).map((n) => `<span>${esc(n.channel)} → ${esc(n.name)}</span>`).join('')}
          </div>
          ${open ? `<div class="alert-actions">
              <button class="btn btn-sm btn-primary" data-ack="${alert.id}">Acknowledge &amp; dispatch</button>
              <button class="btn btn-sm" data-view="${alert.tripId}">View trip</button>
            </div>` : ''}
        </div>
      </article>`;
  }).join('');

  el.alerts.querySelectorAll('[data-ack]').forEach((btn) => {
    btn.addEventListener('click', () => acknowledge(btn.getAttribute('data-ack')));
  });
  el.alerts.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => openTripModal(btn.getAttribute('data-view')));
  });
}

function acknowledge(alertId) {
  const db = getDB();
  const alert = db.alerts.find((a) => a.id === alertId);
  if (!alert) return;
  alert.closedAt = now();
  alert.closedBy = 'MDRRMO duty officer';
  const trip = db.trips.find((t) => t.id === alert.tripId);
  db.log.unshift({
    id: `lg-${Math.random().toString(36).slice(2, 8)}`,
    at: now(),
    actor: 'MDRRMO',
    action: 'Alert acknowledged',
    detail: `${trip ? trip.id : alert.tripId} dispatched to Bantay Dagat`,
  });
  saveDB(db);
  toast('Alert acknowledged — response logged.');
  render();
}

/* --------------------------------------------------------------- advisories */

function renderAdvisories(db) {
  if (!perms().advisories) {
    el.advFormWrap.innerHTML = '<div class="empty">Publishing advisories is limited to MDRRMO and administrator accounts.</div>';
    el.advList.innerHTML = '';
    return;
  }

  el.advFormWrap.innerHTML = `
    <form id="advForm" autocomplete="off">
      <div class="field">
        <label>Risk level</label>
        <div class="level-picker">
          <label class="level-option"><input type="radio" name="level" value="green" checked><span class="green">Green</span></label>
          <label class="level-option"><input type="radio" name="level" value="yellow"><span class="yellow">Yellow</span></label>
          <label class="level-option"><input type="radio" name="level" value="red"><span class="red">Red</span></label>
        </div>
      </div>
      <div class="field">
        <label for="advHead">Headline</label>
        <input id="advHead" type="text" maxlength="70" placeholder="e.g. Gale warning — do not sail" required>
      </div>
      <div class="field">
        <label for="advBody">Message to fishers</label>
        <textarea id="advBody" maxlength="240" placeholder="Short, plain-language message. It is read aloud by the app."></textarea>
      </div>
      <button class="btn btn-primary" type="submit">Publish to all registered devices</button>
      <p class="note" style="margin:10px 0 0">Published advisories are cached on the device and read aloud in Hiligaynon or Filipino. A red advisory also raises the priority of overdue alerts.</p>
    </form>`;

  el.advFormWrap.querySelector('#advForm').addEventListener('submit', publishAdvisory);

  el.advList.innerHTML = db.advisories.slice(0, 3).map((a) => `
    <div class="log-row" style="align-items:flex-start">
      <span class="log-time">${fmtTime(a.issuedAt)}</span>
      <span class="log-text">
        <span class="badge ${a.level}">${a.level.toUpperCase()}</span>
        <strong style="display:block;margin-top:3px">${esc(a.headline)}</strong>
        <span style="color:#64748b;font-size:11px">${fmtAgo(a.issuedAt)} · ${esc(a.publishedBy || 'MDRRMO')}</span>
      </span>
    </div>`).join('');
}

function publishAdvisory(event) {
  event.preventDefault();
  const db = getDB();
  const level = el.advFormWrap.querySelector('input[name="level"]:checked').value;
  const headline = el.advFormWrap.querySelector('#advHead').value.trim();
  const body = el.advFormWrap.querySelector('#advBody').value.trim() || defaultBody(level);
  if (!headline) return;

  db.advisories.unshift({
    id: `A-${Math.random().toString(36).slice(2, 8)}`,
    level,
    headline,
    body,
    source: 'MDRRMO advisory',
    issuedAt: now(),
    publishedBy: `${perms().label}`,
    voice: voiceText(level, headline),
  });
  db.log.unshift({
    id: `lg-${Math.random().toString(36).slice(2, 8)}`,
    at: now(),
    actor: perms().label,
    action: 'Advisory published',
    detail: `${level.toUpperCase()} — ${headline}`,
  });
  saveDB(db);
  toast(`${level.toUpperCase()} advisory published to all devices.`);
  render();
}

function defaultBody(level) {
  if (level === 'red') return 'Gale warning in effect. Small boats must not sail. Secure boats and gear.';
  if (level === 'yellow') return 'Moderate winds and seas. Take extra care; check in before sailing.';
  return 'Light winds, slight seas. Normal fishing operations may continue.';
}

function voiceText(level, headline) {
  if (level === 'red') return `Pula nga lebel. ${headline}. Indì kamo maglayag. Halong gid kamo.`;
  if (level === 'yellow') return `Dilaw nga lebel. ${headline}. Maghalong kamo kag mag-check in antes maglayag.`;
  return `Berde nga lebel. ${headline}. Sarag kamo maglayag.`;
}

/* --------------------------------------------------------------- catch */

function renderCatch(db) {
  if (!perms().catchData) {
    el.catchBody.innerHTML = '<div class="empty">Catch records are visible to the MAO and administrator accounts. Switch role to MAO.</div>';
    el.catchActions.innerHTML = '';
    return;
  }
  const summary = catchSummary(db);
  const totalKg = summary.filter((s) => s.unit === 'kg').reduce((n, s) => n + s.total, 0);

  el.catchActions.innerHTML = `
    <button class="btn btn-sm btn-primary" id="exportCsv">Export CSV</button>`;

  el.catchBody.innerHTML = `
    <table class="tbl">
      <thead><tr><th>Species</th><th>Total</th><th>Entries</th><th>Trips</th><th>Last landed</th></tr></thead>
      <tbody>
        ${summary.map((s) => `
          <tr>
            <td class="who">${esc(s.species)}</td>
            <td class="num">${s.total.toFixed(1)} ${esc(s.unit)}</td>
            <td class="num">${s.rows}</td>
            <td class="num">${s.trips}</td>
            <td class="num">${fmtAgo(s.last)}</td>
          </tr>`).join('') || '<tr><td colspan="5" class="empty">No catch entries yet.</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <th style="background:#fff;border-top:1px solid #e2e8f0">${summary.length} species</th>
          <th style="background:#fff;border-top:1px solid #e2e8f0">${totalKg.toFixed(1)} kg</th>
          <th style="background:#fff;border-top:1px solid #e2e8f0">${db.catches.length} entries</th>
          <th style="background:#fff;border-top:1px solid #e2e8f0"></th>
          <th style="background:#fff;border-top:1px solid #e2e8f0"></th>
        </tr>
      </tfoot>
    </table>`;

  const exportBtn = el.catchActions.querySelector('#exportCsv');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const csv = catchesToCSV(db);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `barotac-catch-summary-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      addAudit('Catch data exported', `${db.catches.length} entries to CSV`, perms().label);
      toast('Catch summary exported as CSV.');
      render();
    });
  }
}

/* --------------------------------------------------------------- audit */

function renderAudit(db) {
  const rows = [
    ...db.audit.map((a) => ({ ...a, kind: 'audit' })),
    ...db.log.map((l) => ({ ...l, kind: 'system' })),
  ].sort((a, b) => b.at - a.at).slice(0, 9);

  el.audit.innerHTML = rows.map((row) => `
    <div class="log-row">
      <span class="log-time">${fmtTime(row.at)}</span>
      <span class="log-text">
        <strong>${esc(row.action)}</strong>${row.kind === 'audit' ? ' <span class="badge navy" style="font-size:9.5px">audit</span>' : ''}
        <span style="display:block;color:#64748b;font-size:11px">${esc(row.detail || '')}${row.actor ? ` · ${esc(row.actor)}` : ''}</span>
      </span>
    </div>`).join('') || '<div class="empty">No activity yet.</div>';

  const admin = perms().settings;
  el.settingsWrap.innerHTML = `
    <div class="field" style="margin-bottom:8px">
      <label for="grace">Grace period before a trip is overdue (minutes)</label>
      <input id="grace" type="number" min="5" max="240" step="5" value="${db.settings.graceMinutes}" ${admin ? '' : 'disabled'}>
    </div>
    <div class="field-row">
      <div class="note">Priority 1 if a red advisory is in force, or if the trip is twice the grace period late. Otherwise Priority 2.</div>
      <div class="note">Location trails are retained for ${db.settings.retentionDays} days, then reduced to summaries.</div>
    </div>
    ${admin ? '<button class="btn btn-sm" id="saveSettings" style="margin-top:10px">Save settings</button>' : '<p class="note" style="margin-top:10px">Administrator role required to change the rules.</p>'}
    <button class="btn btn-sm btn-ghost" id="resetDemo" style="margin-top:10px">Reset demo data</button>`;

  const saveBtn = el.settingsWrap.querySelector('#saveSettings');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const value = Number(el.settingsWrap.querySelector('#grace').value);
      if (!Number.isFinite(value) || value < 5) return;
      const fresh = getDB();
      fresh.settings.graceMinutes = value;
      saveDB(fresh);
      evaluateAlerts();
      toast(`Grace period set to ${value} minutes.`);
      render();
    });
  }

  el.settingsWrap.querySelector('#resetDemo').addEventListener('click', () => {
    if (!window.confirm('Reset all demo data, including the phone, to its starting state?')) return;
    resetDB();
    ui.modalTripId = null;
    closeModal();
    toast('Demo data reset.');
    render();
  });
}

/* --------------------------------------------------------------- modal */

function openTripModal(tripId) {
  const db = getDB();
  const trip = db.trips.find((t) => t.id === tripId);
  if (!trip) return;
  const fisher = db.fishers.find((f) => f.id === trip.fisherId) || {};
  const checkins = db.checkins
    .filter((c) => c.tripId === trip.id)
    .sort((a, b) => a.deviceTime - b.deviceTime);
  const state = tripState(trip, db);

  ui.modalTripId = trip.id;

  if (checkins.length) {
    addAudit('Location trail viewed', `${fisher.boat || trip.id} — ${checkins.length} fixes`, perms().label);
  }

  el.modalHead.innerHTML = `
    <div>
      <h3>${esc(fisher.boat || 'Boat')} · ${esc(fisher.name || '')}</h3>
      <div style="font-size:11.5px;color:#64748b">Trip ${esc(trip.id)} · ${esc(trip.area)} · ${trip.crew || 0} crew</div>
    </div>
    <button class="btn btn-sm btn-ghost" id="modalClose">Close</button>`;

  el.modalBody.innerHTML = `
    <dl class="kv">
      <dt>Status</dt><dd>${badgeFor(state)}</dd>
      <dt>Departed</dt><dd>${fmtDateTime(trip.departedAt)}</dd>
      <dt>Expected return</dt><dd>${fmtDateTime(trip.expectedReturn)}</dd>
      <dt>Last fix</dt><dd>${checkins.length ? `${checkins[checkins.length - 1].lat.toFixed(4)}, ${checkins[checkins.length - 1].lng.toFixed(4)}` : 'No check-in received'}</dd>
      <dt>Emergency contact</dt><dd>${(fisher.contacts || []).map((c) => `${esc(c.name)} — ${esc(c.phone)}`).join('<br>') || '—'}</dd>
    </dl>

    <h4 style="font-size:12px;margin:14px 0 8px">Check-in trail</h4>
    ${checkins.length ? `<ul class="timeline">${checkins.map((c) => `
        <li>
          <span class="t">${fmtTime(c.deviceTime)}</span> · ${esc(c.status)}
          <span style="color:#64748b;display:block;font-size:11.5px">
            ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)} · ±${c.accuracy} m
            ${c.deviceTime !== c.receivedAt ? '· uploaded later' : ''}
          </span>
        </li>`).join('')}</ul>`
      : '<p class="note">No check-ins recorded for this trip.</p>'}

    <p class="note" style="margin-top:12px">This view was written to the audit log, as required for location data under RA 10173.</p>

    ${trip.acknowledgedAt ? `<p class="note" style="margin-top:10px">The fisher acknowledged “still at sea” at ${fmtTime(trip.acknowledgedAt)}.</p>` : ''}`;

  el.modalFoot.innerHTML = '<button class="btn" id="modalDone">Close</button>';
  el.modalBack.classList.add('show');
  el.modalBack.querySelector('#modalClose').addEventListener('click', closeModal);
  el.modalBack.querySelector('#modalDone').addEventListener('click', closeModal);
  render();
}

function closeModal() {
  el.modalBack.classList.remove('show');
  ui.modalTripId = null;
}

/* --------------------------------------------------------------- render */

function render() {
  const db = getDB();
  ui.role = el.role.value;

  document.body.dataset.role = ui.role;
  renderClock();
  renderKPIs(db);
  renderMap(db);
  renderTrips(db);
  renderAlerts(db);
  renderAdvisories(db);
  renderCatch(db);
  renderAudit(db);
}

/* --------------------------------------------------------------- boot */

function bind() {
  el.role.addEventListener('change', () => {
    ui.role = el.role.value;
    toast(`Viewing as ${ROLES[ui.role].label}`);
    render();
  });

  document.querySelectorAll('[data-shift]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const shift = Number(btn.getAttribute('data-shift'));
      setClockOffset(clockOffset() + shift * 60000);
      evaluateAlerts();
      render();
    });
  });

  document.querySelector('[data-reset-clock]').addEventListener('click', () => {
    setClockOffset(0);
    render();
  });

  el.modalBack.addEventListener('click', (event) => {
    if (event.target === el.modalBack) closeModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });

  window.addEventListener('storage', (event) => {
    if (event.key && event.key.startsWith('bvsms.')) render();
  });
  window.addEventListener('bvsms:change', () => render());
  window.addEventListener('bvsms:clock', () => render());
}

function boot() {
  el.role = $('#role');
  el.simTime = $('#simTime');
  el.offsetTag = $('#offsetTag');
  el.kpis = $('#kpis');
  el.map = $('#map');
  el.mapHint = $('#mapHint');
  el.trips = $('#trips');
  el.alerts = $('#alerts');
  el.advFormWrap = $('#advFormWrap');
  el.advList = $('#advList');
  el.catchBody = $('#catchBody');
  el.catchActions = $('#catchActions');
  el.audit = $('#audit');
  el.settingsWrap = $('#settingsWrap');
  el.modalBack = $('#modalBack');
  el.modalHead = $('#modalHead');
  el.modalBody = $('#modalBody');
  el.modalFoot = $('#modalFoot');
  el.toast = $('#toast');

  ui.role = el.role.value;
  bind();
  evaluateAlerts();
  render();

  setInterval(renderClock, 1000);
  setInterval(() => {
    if (evaluateAlerts()) render();
  }, 4000);
}

boot();
