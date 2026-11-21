/* ==========================================================================
   fisherapp.js — fisher application (phone prototype)
   Everything is written to the device store first. If the phone is offline the
   item waits in the outbox and syncs when the signal returns.
   ========================================================================== */

import {
  AREAS, AREA_CENTERS, GEAR, SPECIES, currentTrip, deviceFisher, fmtAgo,
  fmtDuration, fmtTime, getDB, getDevice, latestAdvisory, now, pendingItems,
  queue, saveDevice, syncDevice, tripState,
} from './store.js';

const $ = (sel) => document.querySelector(sel);
const el = {};
const ui = { tab: 'home', lang: 'hil', lastSpoken: null };

/* --------------------------------------------------------------- utils */

function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function toast(message) {
  el.phoneToast.textContent = message;
  el.phoneToast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.phoneToast.classList.remove('show'), 2400);
}

function speak(text, lang = ui.lang) {
  if (!('speechSynthesis' in window)) {
    toast('Voice not supported in this browser.');
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === 'hil' ? 'fil-PH' : 'fil-PH';
  utterance.rate = 0.92;
  utterance.pitch = 1;
  const voices = window.speechSynthesis.getVoices();
  const filipino = voices.find((v) => /fil|tl|tag/i.test(v.lang));
  if (filipino) utterance.voice = filipino;
  window.speechSynthesis.speak(utterance);
}

/* --------------------------------------------------------------- state */

function advisory() {
  const db = getDB();
  const live = latestAdvisory(db);
  const dev = getDevice();
  if (dev.online && live) return live;
  const cached = (dev.cache.advisories || []).sort((a, b) => b.issuedAt - a.issuedAt)[0];
  return cached || (dev.online ? null : live);
}

function myAlert(dev) {
  const db = getDB();
  const trips = dev.trips.map((t) => t.id);
  if (dev.online) {
    return db.alerts.find((a) => trips.includes(a.tripId) && !a.closedAt) || null;
  }
  return (dev.cache.alerts || [])[0] || null;
}

/* --------------------------------------------------------------- chrome */

function renderStatus() {
  const dev = getDevice();
  el.sigBars.classList.toggle('online', dev.online);
  el.sigLabel.textContent = dev.online ? 'Signal' : 'No signal';
  const pending = pendingItems(dev);
  el.pendingBadge.textContent = pending ? `${pending} pending` : 'synced';
  el.pendingBadge.style.background = pending ? 'rgba(251,191,36,.28)' : 'rgba(255,255,255,.18)';
  el.phoneClock.textContent = fmtTime(now());

  el.signalSwitch.classList.toggle('on', dev.online);
  el.signalState.textContent = dev.online ? 'Online' : 'Airplane mode';
  el.pendingText.textContent = pending
    ? `${pending} item${pending > 1 ? 's' : ''} waiting to sync`
    : 'Everything is synced';

  document.querySelectorAll('.tabbar button').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === ui.tab);
  });
}

/* --------------------------------------------------------------- views */

function renderHome() {
  const dev = getDevice();
  const fisher = deviceFisher(dev);
  const trip = currentTrip(dev);
  const adv = advisory();
  const alert = myAlert(dev);
  const db = getDB();

  const levelClass = adv ? adv.level : 'green';
  const levelLabel = adv ? { green: 'Green · safe', yellow: 'Yellow · caution', red: 'Red · do not sail' }[adv.level] : 'No advisory';
  const voiceLine = adv
    ? (ui.lang === 'hil' ? (adv.voice || adv.body) : adv.body)
    : '';

  const checkins = dev.checkins.filter((c) => trip && c.tripId === trip.id);
  const lastCheckin = checkins.sort((a, b) => b.deviceTime - a.deviceTime)[0];

  let tripCard = '<p class="note">No active trip. Register a trip before sailing.</p>';
  if (trip) {
    const state = tripState(trip, db);
    const eta = state.key === 'overdue'
      ? `${fmtTime(trip.expectedReturn)} · ${fmtDuration(state.overdueMin)} late`
      : `${fmtTime(trip.expectedReturn)} · in ${fmtDuration(state.remainingMin || 0)}`;
    tripCard = `
      <div class="card">
        <div class="card-row">
          <div>
            <div class="card-title">${esc(trip.area)}</div>
            <div class="card-sub">Departed ${fmtTime(trip.departedAt)} · ${trip.crew} crew</div>
          </div>
          <span class="badge ${state.key === 'overdue' ? 'red' : state.key === 'grace' ? 'yellow' : 'green'}">
            ${state.key === 'overdue' ? 'Late' : state.key === 'grace' ? 'Grace' : 'At sea'}
          </span>
        </div>
        <div class="card-sub" style="margin-top:8px">
          Expected return <span class="mono">${eta}</span><br>
          Last check-in: <span class="mono">${lastCheckin ? `${fmtTime(lastCheckin.deviceTime)} (${fmtAgo(lastCheckin.deviceTime)})` : 'none yet'}</span>
        </div>
      </div>`;
  }

  el.screen.innerHTML = `
    <div class="app-greet">Maayong adlaw,</div>
    <div class="app-name">${esc(fisher.name.split(' ')[0])} · ${esc(fisher.boat.replace('F/B ', ''))}</div>

    ${alert ? `
      <div class="overdue-banner">
        <strong>Na-overdue ang imo biyahe</strong>
        <p>Your trip is past its expected return. The MDRRMO has been alerted. If you are safe at sea, tap below so the alert can be cleared.</p>
        <button class="adv-btn" id="stillAtSea" style="background:#fff">Still at sea · Ari pa ako sa dagat</button>
      </div>` : ''}

    <div class="adv-card ${levelClass}">
      <div class="adv-top">
        <span class="adv-level">${levelLabel}</span>
        <span class="adv-age">${adv ? `${fmtAgo(adv.issuedAt)} · ${fmtTime(adv.issuedAt)}` : '—'}</span>
      </div>
      <div class="adv-head">${esc(adv ? adv.headline : 'No advisory cached on this device')}</div>
      <div class="adv-body">${esc(adv ? adv.body : 'Connect to the network once to cache the latest PAGASA advisory.')}</div>
      <div class="adv-actions">
        <button class="adv-btn" id="playVoice">▶ ${ui.lang === 'hil' ? 'Pakingga sa Hiligaynon' : 'Pakinggan sa Filipino'}</button>
        <div class="lang-toggle">
          <button data-lang="hil" class="${ui.lang === 'hil' ? 'on' : ''}">Hil</button>
          <button data-lang="fil" class="${ui.lang === 'fil' ? 'on' : ''}">Fil</button>
        </div>
      </div>
    </div>

    <div class="big-actions">
      <button class="big-btn" data-go="trip">
        <span class="ico">⛵</span>
        <span>Maglayag<small>Register a trip and expected return</small></span>
      </button>
      <button class="big-btn safe" id="checkinBtn" ${trip ? '' : 'disabled'}>
        <span class="ico">✓</span>
        <span>I'm safe<small>Luwas ako — send my position</small></span>
      </button>
      <button class="big-btn" data-go="catch">
        <span class="ico">🐟</span>
        <span>Record catch<small>Lista sang huli</small></span>
      </button>
    </div>

    <div class="sec-title">Current trip</div>
    ${tripCard}

    <p class="note" style="margin-top:12px">
      ${dev.online
        ? 'Connected. Check-ins upload immediately and the dashboard updates.'
        : 'No signal. Everything you record is saved on this phone and will upload when the signal returns.'}
      ${voiceLine ? '' : ''}
    </p>`;

  el.screen.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => go(btn.getAttribute('data-go')));
  });

  const checkinBtn = el.screen.querySelector('#checkinBtn');
  if (checkinBtn) checkinBtn.addEventListener('click', doCheckin);

  const play = el.screen.querySelector('#playVoice');
  if (play) {
    play.addEventListener('click', () => {
      if (!adv) return toast('No advisory cached yet.');
      speak(voiceLine || adv.body);
      toast('Playing voice alert…');
    });
  }

  el.screen.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ui.lang = btn.getAttribute('data-lang');
      getDevice() && saveDevice({ ...getDevice(), lang: ui.lang });
      render();
    });
  });

  const still = el.screen.querySelector('#stillAtSea');
  if (still) {
    still.addEventListener('click', () => {
      const trip = currentTrip();
      if (!trip) return;
      queue('ack', { tripId: trip.id, at: now() });
      toast(dev.online ? 'Cleared. The MDRRMO can see you are still at sea.' : 'Queued. It will clear the alert once you have signal.');
      render();
    });
  }
}

function renderTrip() {
  const dev = getDevice();
  const db = getDB();
  const trip = currentTrip(dev);
  const fisher = deviceFisher(dev);

  const form = `
    <div class="sec-title">Bag-o nga biyahe · New trip</div>
    <div class="card">
      <form id="tripForm">
        <div class="field-app">
          <label for="area">Fishing ground</label>
          <select id="area">${AREAS.map((a) => `<option>${esc(a)}</option>`).join('')}</select>
        </div>
        <div class="field-app">
          <label for="eta">Expected return</label>
          <input id="eta" type="time" value="${defaultEta()}" required>
        </div>
        <div class="field-app">
          <label for="crew">Crew on board</label>
          <input id="crew" type="number" min="1" max="8" value="${fisher.crew || 2}">
        </div>
        <div class="field-app">
          <label for="contact">Emergency contact</label>
          <select id="contact">
            ${(fisher.contacts || []).map((c, i) => `<option value="${i}">${esc(c.name)} (${esc(c.rel)})</option>`).join('')}
          </select>
        </div>
        <button class="app-btn" type="submit">Register trip</button>
      </form>
    </div>`;

  el.screen.innerHTML = `
    ${trip ? `
      <div class="sec-title">Karon nga biyahe · Current trip</div>
      <div class="card">
        <div class="card-row">
          <div>
            <div class="card-title">${esc(trip.area)}</div>
            <div class="card-sub">Departed ${fmtTime(trip.departedAt)} · ${trip.crew} crew</div>
          </div>
          ${trip.synced ? '<span class="synced-pill">synced</span>' : '<span class="pending-pill">pending</span>'}
        </div>
        <div class="card-sub" style="margin-top:8px">
          Expected return <span class="mono">${fmtTime(trip.expectedReturn)}</span><br>
          ${(() => {
            const state = tripState(trip, db);
            if (state.key === 'overdue') return `<span style="color:#b42318;font-weight:600">${fmtDuration(state.overdueMin)} past the expected return</span>`;
            if (state.key === 'grace') return `<span style="color:#9a6700">Within the grace period (${fmtDuration(state.overdueMin)} past)</span>`;
            return `Due in ${fmtDuration(state.remainingMin || 0)}`;
          })()}
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="app-btn" id="checkinBtn">I'm safe now</button>
          <button class="app-btn secondary" id="returnBtn">Returned</button>
        </div>
      </div>
      <p class="note">One trip at a time. Tap <strong>Returned</strong> when you are back on shore so the dashboard closes the trip.</p>
      <div class="sec-title">Check-in trail on this phone</div>
      <div class="card">
        ${dev.checkins.filter((c) => c.tripId === trip.id).length
          ? dev.checkins.filter((c) => c.tripId === trip.id)
              .sort((a, b) => b.deviceTime - a.deviceTime)
              .map((c) => `<div class="log-row" style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px dashed #eef2f6">
                  <span class="mono">${fmtTime(c.deviceTime)}</span>
                  <span class="mono" style="color:#64748b">${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}</span>
                  ${c.synced ? '<span class="synced-pill">✓</span>' : '<span class="pending-pill">…</span>'}
                </div>`).join('')
          : '<p class="card-sub">No check-ins yet.</p>'}
      </div>
      ${form.replace('<button class="app-btn" type="submit">Register trip</button>', '')}
      <p class="note">Finish the current trip before registering another one.</p>`
    : form}`;

  const checkinBtn = el.screen.querySelector('#checkinBtn');
  if (checkinBtn) checkinBtn.addEventListener('click', doCheckin);

  const returnBtn = el.screen.querySelector('#returnBtn');
  if (returnBtn) {
    returnBtn.addEventListener('click', () => {
      const t = currentTrip();
      if (!t) return;
      const dev2 = getDevice();
      const mine = dev2.trips.find((x) => x.id === t.id);
      if (mine) {
        mine.status = 'returned';
        mine.closedAt = now();
        mine.synced = false;
        saveDevice(dev2);
      }
      queue('return', { tripId: t.id, at: now() });
      toast('Trip closed. Salamat — welcome back.');
      render();
    });
  }

  const tripForm = el.screen.querySelector('#tripForm');
  if (tripForm) {
    tripForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const area = el.screen.querySelector('#area').value;
      const etaTime = el.screen.querySelector('#eta').value;
      const crew = Number(el.screen.querySelector('#crew').value) || 1;
      const contactIndex = Number(el.screen.querySelector('#contact')?.value || 0);
      const fisher = deviceFisher();
      const contact = (fisher.contacts || [])[contactIndex] || null;

      const [hours, minutes] = etaTime.split(':').map(Number);
      const base = new Date(now());
      const eta = new Date(base);
      eta.setHours(hours, minutes, 0, 0);
      if (eta.getTime() <= base.getTime()) eta.setDate(eta.getDate() + 1);

      const trip = {
        id: `T-${Math.random().toString(36).slice(2, 7)}`,
        fisherId: fisher.id,
        area,
        crew,
        departedAt: now(),
        expectedReturn: eta.getTime(),
        status: 'active',
        emergencyContact: contact,
        acknowledgedAt: null,
        synced: false,
      };

      const dev2 = getDevice();
      dev2.trips.push(trip);
      saveDevice(dev2);
      queue('trip', trip);

      toast(dev2.online ? 'Trip registered and sent to the dashboard.' : 'Trip saved on this phone. It will upload with signal.');
      ui.tab = 'trip';
      render();
    });
  }
}

function renderCatch() {
  const dev = getDevice();
  const trip = currentTrip(dev);

  el.screen.innerHTML = `
    <div class="sec-title">Lista sang huli · Catch log</div>
    <div class="card">
      <form id="catchForm">
        <div class="field-app">
          <label for="species">Species</label>
          <select id="species">${SPECIES.map((s) => `<option>${esc(s)}</option>`).join('')}</select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field-app">
            <label for="qty">Quantity</label>
            <input id="qty" type="number" min="0.1" step="0.1" value="5">
          </div>
          <div class="field-app">
            <label for="unit">Unit</label>
            <select id="unit"><option>kg</option><option>pcs</option></select>
          </div>
        </div>
        <div class="field-app">
          <label for="gear">Gear used</label>
          <select id="gear">${GEAR.map((g) => `<option>${esc(g)}</option>`).join('')}</select>
        </div>
        <button class="app-btn" type="submit">Save catch entry</button>
      </form>
    </div>

    <div class="sec-title">Naitala · Recorded on this phone</div>
    <div class="card">
      ${dev.catches.length
        ? dev.catches.sort((a, b) => b.landedAt - a.landedAt).map((c) => `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 0;border-bottom:1px dashed #eef2f6">
              <div>
                <div style="font-weight:650;font-size:13px">${esc(c.species)}</div>
                <div class="card-sub">${c.qty} ${esc(c.unit)} · ${esc(c.gear)} · ${fmtTime(c.landedAt)}</div>
              </div>
              ${c.synced ? '<span class="synced-pill">synced</span>' : '<span class="pending-pill">pending</span>'}
            </div>`).join('')
        : '<p class="card-sub">No catch entries yet. Entries work without a signal.</p>'}
    </div>

    <p class="note">${trip ? `These entries are attached to your trip in ${esc(trip.area)}.` : 'Register a trip first so entries are attached to it.'}</p>`;

  el.screen.querySelector('#catchForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const dev2 = getDevice();
    const t = currentTrip(dev2);
    const entry = {
      id: `K-${Math.random().toString(36).slice(2, 7)}`,
      tripId: t ? t.id : null,
      fisherId: dev2.fisherId,
      species: el.screen.querySelector('#species').value,
      qty: Number(el.screen.querySelector('#qty').value) || 0,
      unit: el.screen.querySelector('#unit').value,
      gear: el.screen.querySelector('#gear').value,
      area: t ? t.area : 'Unassigned',
      landedAt: now(),
      synced: false,
    };
    dev2.catches.unshift(entry);
    saveDevice(dev2);
    queue('catch', entry);
    toast(dev2.online ? 'Catch saved and sent.' : 'Catch saved on this phone.');
    render();
  });
}

/* --------------------------------------------------------------- actions */

function defaultEta() {
  const d = new Date(now() + 4 * 3600 * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function doCheckin() {
  const dev = getDevice();
  const trip = currentTrip(dev);
  if (!trip) return toast('Register a trip first.');

  const finish = (lat, lng, accuracy) => {
    const dev2 = getDevice();
    const entry = {
      id: `C-${Math.random().toString(36).slice(2, 7)}`,
      tripId: trip.id,
      lat,
      lng,
      accuracy: Math.round(accuracy),
      status: 'safe',
      deviceTime: now(),
      synced: false,
    };
    dev2.checkins.push(entry);
    saveDevice(dev2);
    queue('checkin', entry);
    toast(dev2.online ? 'Check-in sent. Luwas ka.' : 'Saved on this phone. Uploads with signal.');
    speak('Naitala ang imong check-in. Salamat.', 'hil');
    render();
  };

  const center = AREA_CENTERS[trip.area] || { lat: 11.03, lng: 122.9 };

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => finish(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy || 20),
      () => finish(center.lat + (Math.random() - 0.5) * 0.01, center.lng + (Math.random() - 0.5) * 0.01, 15),
      { timeout: 4000, maximumAge: 30000 },
    );
  } else {
    finish(center.lat + (Math.random() - 0.5) * 0.01, center.lng + (Math.random() - 0.5) * 0.01, 15);
  }
}

function go(tab) {
  ui.tab = tab;
  render();
}

/* --------------------------------------------------------------- render */

function render() {
  const dev = getDevice();
  document.body.dataset.online = String(dev.online);
  renderStatus();
  if (ui.tab === 'home') renderHome();
  else if (ui.tab === 'trip') renderTrip();
  else renderCatch();
  renderStatus();
}

/* --------------------------------------------------------------- boot */

function bind() {
  el.signalSwitch.addEventListener('click', () => {
    const dev = getDevice();
    dev.online = !dev.online;
    saveDevice(dev);
    toast(dev.online ? 'Signal restored. Tap Sync now to upload.' : 'Airplane mode on. Everything is saved on this phone.');
    if (dev.online) {
      syncDevice();
      toast('Signal restored — queued items uploaded.');
    }
    render();
  });

  el.syncBtn.addEventListener('click', () => {
    const dev = getDevice();
    if (!dev.online) {
      toast('No signal. Turn the signal back on first.');
      return;
    }
    const result = syncDevice();
    toast(result.synced ? `${result.synced} item${result.synced > 1 ? 's' : ''} uploaded to the dashboard.` : 'Nothing to upload — already synced.');
    render();
  });

  document.querySelectorAll('.tabbar button').forEach((btn) => {
    btn.addEventListener('click', () => go(btn.getAttribute('data-tab')));
  });

  window.addEventListener('storage', (event) => {
    if (event.key && event.key.startsWith('bvsms.')) onExternalChange();
  });
  window.addEventListener('bvsms:change', () => onExternalChange());

  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', () => window.speechSynthesis.getVoices());
  }
}

let lastSeenAdvisory = null;

function onExternalChange() {
  const dev = getDevice();
  const adv = latestAdvisory(getDB());

  if (adv && dev.online && adv.id !== lastSeenAdvisory) {
    lastSeenAdvisory = adv.id;
    const isNew = now() - adv.issuedAt < 120000;
    if (isNew && adv.level === 'red' && dev.online) {
      const line = ui.lang === 'hil' ? adv.voice || adv.body : adv.body;
      speak(line);
      toast('Red advisory received — playing voice alert.');
    }
  }
  render();
}

function boot() {
  el.screen = $('#screen');
  el.phoneToast = $('#phoneToast');
  el.sigBars = $('#sigBars');
  el.sigLabel = $('#sigLabel');
  el.pendingBadge = $('#pendingBadge');
  el.phoneClock = $('#phoneClock');
  el.signalSwitch = $('#signalSwitch');
  el.signalState = $('#signalState');
  el.pendingText = $('#pendingText');
  el.syncBtn = $('#syncBtn');

  const dev = getDevice();
  ui.lang = dev.lang || 'hil';

  bind();
  render();

  setInterval(() => {
    renderStatus();
    if (ui.tab === 'home') renderHome();
  }, 5000);
}

boot();
