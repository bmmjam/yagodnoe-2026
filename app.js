/* Ягодное 2026 — Telegram Mini App */
(() => {
  'use strict';

  // ---------- Telegram SDK ----------
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  if (tg) { try { tg.ready(); tg.expand(); } catch (_) {} }
  const haptic = (kind = 'light') => {
    try { tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred(kind); } catch (_) {}
  };

  // ---------- Storage ----------
  const LS = {
    get: (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const K = {
    myName: 'yagodnoe:myName',
    myHouse: 'yagodnoe:myHouse',
    bath: 'yagodnoe:bathHonors',
    lastTab: 'yagodnoe:lastTab',
  };

  // ---------- State ----------
  const state = {
    roster: [], schedule: null, locations: null,
    myName: LS.get(K.myName, null),
    myHouse: LS.get(K.myHouse, null),
    activeTab: LS.get(K.lastTab, 'map'),
    zoom: 1, panX: 0, panY: 0,
    highlightPoi: null,
  };

  // ---------- Load data ----------
  Promise.all([
    fetch('data/roster.json').then(r => r.json()),
    fetch('data/schedule.json').then(r => r.json()),
    fetch('data/locations.json').then(r => r.json()),
  ]).then(([roster, schedule, locations]) => {
    state.roster = roster;
    state.schedule = schedule;
    state.locations = locations;
    init();
  }).catch(err => {
    document.body.innerHTML = '<div style="padding:20px;color:#f5e9d0">Не удалось загрузить данные: ' + err.message + '</div>';
  });

  // ---------- Init ----------
  function init() {
    setupTabs();
    renderMarkers();
    setupMapInteraction();
    setupSearch();
    setupMe();
    renderSchedule();
    setupSheet();
    setupDevMode();
    if (state.activeTab === 'banya') state.activeTab = 'map';
    showTab(state.activeTab);
    setInterval(updateNowBanner, 30_000);
    updateNowBanner();
  }

  // ---------- Tabs ----------
  function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.addEventListener('click', () => { haptic(); showTab(b.dataset.go); });
    });
  }
  function showTab(name) {
    state.activeTab = name;
    LS.set(K.lastTab, name);
    document.querySelectorAll('.tab').forEach(t => { t.hidden = t.dataset.tab !== name; });
    document.querySelectorAll('.tab-btn').forEach(b => { b.classList.toggle('active', b.dataset.go === name); });
  }

  // ---------- Map markers ----------
  function renderMarkers() {
    const host = document.getElementById('markers');
    host.innerHTML = '';
    const swallow = e => e.stopPropagation();
    state.locations.houses.forEach(h => {
      const el = document.createElement('button');
      el.className = 'marker house';
      el.dataset.kind = 'house';
      el.dataset.id = h.id;
      el.textContent = h.name;
      el.style.left = h.x + '%';
      el.style.top = h.y + '%';
      if (state.myHouse === h.id) el.classList.add('mine');
      el.addEventListener('pointerdown', swallow);
      el.addEventListener('click', e => { e.stopPropagation(); haptic(); openHouseSheet(h.id); });
      host.appendChild(el);
    });
    state.locations.pois.forEach(p => {
      const el = document.createElement('button');
      el.className = 'marker poi';
      if (p.id === 'bath-memorial') el.classList.add('bath');
      el.dataset.kind = 'poi';
      el.dataset.id = p.id;
      el.textContent = p.emoji;
      el.title = p.name;
      el.style.left = p.x + '%';
      el.style.top = p.y + '%';
      el.addEventListener('pointerdown', swallow);
      el.addEventListener('click', e => {
        e.stopPropagation(); haptic();
        if (p.id === 'bath-memorial') openBanyaSheet(); else openPoiSheet(p.id);
      });
      host.appendChild(el);
    });
  }

  function setMarkerHighlight(id) {
    document.querySelectorAll('.marker').forEach(m => {
      m.classList.toggle('highlight', m.dataset.id === id);
    });
  }

  // ---------- Map pan/zoom ----------
  function setupMapInteraction() {
    const vp = document.getElementById('mapViewport');
    const canvas = document.getElementById('mapCanvas');
    const img = document.getElementById('mapImg');
    const IMG_RATIO = 1263 / 977;

    const apply = () => {
      canvas.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    };
    const computeFit = () => {
      const vpR = vp.getBoundingClientRect();
      if (vpR.width === 0 || vpR.height === 0) return;
      let w, h;
      if (vpR.width / vpR.height > IMG_RATIO) { h = vpR.height; w = h * IMG_RATIO; }
      else { w = vpR.width; h = w / IMG_RATIO; }
      state.baseW = w; state.baseH = h;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    };
    const clampPan = () => {
      const vpR = vp.getBoundingClientRect();
      const cw = state.baseW * state.zoom;
      const ch = state.baseH * state.zoom;
      if (cw <= vpR.width) state.panX = (vpR.width - cw) / 2;
      else state.panX = Math.max(vpR.width - cw, Math.min(0, state.panX));
      if (ch <= vpR.height) state.panY = (vpR.height - ch) / 2;
      else state.panY = Math.max(vpR.height - ch, Math.min(0, state.panY));
    };

    const pointers = new Map();
    let lastDist = 0, lastMid = null, lastPan = null;

    vp.addEventListener('pointerdown', e => {
      vp.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const pts = [...pointers.values()];
        lastDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        lastMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      }
      lastPan = { x: e.clientX, y: e.clientY, px: state.panX, py: state.panY };
    });
    vp.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const pts = [...pointers.values()];
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        if (lastDist > 0) {
          const factor = d / lastDist;
          const newZoom = Math.max(1, Math.min(4, state.zoom * factor));
          const vpR = vp.getBoundingClientRect();
          const fx = mid.x - vpR.left, fy = mid.y - vpR.top;
          state.panX = fx - (fx - state.panX) * (newZoom / state.zoom);
          state.panY = fy - (fy - state.panY) * (newZoom / state.zoom);
          state.zoom = newZoom;
          clampPan();
          apply();
        }
        lastDist = d; lastMid = mid;
      } else if (pointers.size === 1 && lastPan) {
        state.panX = lastPan.px + (e.clientX - lastPan.x);
        state.panY = lastPan.py + (e.clientY - lastPan.y);
        clampPan();
        apply();
      }
    });
    const release = e => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) { lastDist = 0; lastMid = null; }
      if (pointers.size === 0) lastPan = null;
    };
    vp.addEventListener('pointerup', release);
    vp.addEventListener('pointercancel', release);
    vp.addEventListener('pointerleave', release);

    // Double-tap zoom
    let lastTap = 0;
    vp.addEventListener('click', e => {
      const now = Date.now();
      if (now - lastTap < 300) {
        const vpR = vp.getBoundingClientRect();
        const fx = e.clientX - vpR.left, fy = e.clientY - vpR.top;
        const target = state.zoom > 1.5 ? 1 : 2.2;
        state.panX = fx - (fx - state.panX) * (target / state.zoom);
        state.panY = fy - (fy - state.panY) * (target / state.zoom);
        state.zoom = target;
        clampPan();
        apply();
      }
      lastTap = now;
    });

    // Wheel zoom (desktop)
    vp.addEventListener('wheel', e => {
      e.preventDefault();
      const vpR = vp.getBoundingClientRect();
      const fx = e.clientX - vpR.left, fy = e.clientY - vpR.top;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(1, Math.min(4, state.zoom * factor));
      state.panX = fx - (fx - state.panX) * (newZoom / state.zoom);
      state.panY = fy - (fy - state.panY) * (newZoom / state.zoom);
      state.zoom = newZoom;
      clampPan();
      apply();
    }, { passive: false });

    // Initial fit + apply
    const fitAndApply = () => { computeFit(); clampPan(); apply(); };
    if (img.complete) fitAndApply();
    img.addEventListener('load', fitAndApply);
    window.addEventListener('resize', fitAndApply);
    // Re-fit when map tab becomes visible (layout might have been 0x0 before)
    const mapTab = document.querySelector('.tab[data-tab="map"]');
    if (mapTab) {
      const obs = new MutationObserver(() => { if (!mapTab.hidden) fitAndApply(); });
      obs.observe(mapTab, { attributes: true, attributeFilter: ['hidden'] });
    }
  }

  // ---------- Search ----------
  function setupSearch() {
    const input = document.getElementById('search');
    const res = document.getElementById('searchResults');
    const houseName = id => (state.locations.houses.find(h => h.id === id) || {}).name || id;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { res.classList.remove('open'); res.innerHTML = ''; return; }
      const matches = state.roster
        .filter(p => p.name.toLowerCase().includes(q))
        .slice(0, 20);
      if (!matches.length) { res.innerHTML = '<div class="search-row"><span class="who">Никто не найден</span></div>'; res.classList.add('open'); return; }
      res.innerHTML = matches.map(p =>
        `<div class="search-row" data-house="${p.house}"><span class="who">${escapeHtml(p.name)}</span><span class="where">${houseName(p.house)}</span></div>`
      ).join('');
      res.classList.add('open');
    });
    res.addEventListener('click', e => {
      const row = e.target.closest('.search-row');
      if (!row || !row.dataset.house) return;
      haptic();
      input.value = '';
      res.classList.remove('open');
      setMarkerHighlight(row.dataset.house);
      openHouseSheet(row.dataset.house);
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('.search-wrap')) res.classList.remove('open');
    });
  }

  // ---------- "Me" (name / house) ----------
  function setupMe() {
    const btn = document.getElementById('btnMe');
    const modal = document.getElementById('modalBackdrop');
    const input = document.getElementById('nameInput');
    const results = document.getElementById('nameResults');
    const cancel = document.getElementById('nameCancel');

    const refreshBtn = () => {
      if (state.myName && state.myHouse) {
        const hn = (state.locations.houses.find(h => h.id === state.myHouse) || {}).name || '';
        btn.textContent = `Я: ${shortName(state.myName)}, ${hn}`;
      } else {
        btn.textContent = 'Где я живу';
      }
    };

    const openModal = () => {
      modal.hidden = false;
      input.value = state.myName || '';
      input.focus();
      renderResults(input.value);
    };
    const closeModal = () => { modal.hidden = true; results.innerHTML = ''; };

    const renderResults = (q) => {
      q = (q || '').trim().toLowerCase();
      const list = q
        ? state.roster.filter(p => p.name.toLowerCase().includes(q)).slice(0, 30)
        : [];
      if (!list.length) { results.innerHTML = q ? '<div class="search-row"><span class="who">Нет совпадений</span></div>' : ''; return; }
      const hn = id => (state.locations.houses.find(h => h.id === id) || {}).name || id;
      results.innerHTML = list.map(p =>
        `<div class="search-row" data-id="${p.id}" data-name="${escapeAttr(p.name)}" data-house="${p.house}">
           <span class="who">${escapeHtml(p.name)}</span><span class="where">${hn(p.house)}</span>
         </div>`).join('');
    };

    btn.addEventListener('click', () => { haptic(); openModal(); });
    cancel.addEventListener('click', () => { haptic(); closeModal(); });
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    input.addEventListener('input', () => renderResults(input.value));
    results.addEventListener('click', e => {
      const row = e.target.closest('.search-row');
      if (!row || !row.dataset.id) return;
      haptic('medium');
      state.myName = row.dataset.name;
      state.myHouse = row.dataset.house;
      LS.set(K.myName, state.myName);
      LS.set(K.myHouse, state.myHouse);
      refreshBtn();
      renderMarkers();
      closeModal();
    });

    refreshBtn();
  }

  // ---------- Sheet ----------
  function setupSheet() {
    const bd = document.getElementById('sheetBackdrop');
    bd.addEventListener('click', closeSheet);
  }
  function openSheet(html) {
    const bd = document.getElementById('sheetBackdrop');
    const sh = document.getElementById('sheet');
    document.getElementById('sheetBody').innerHTML = html;
    bd.hidden = false; sh.hidden = false;
    requestAnimationFrame(() => { bd.classList.add('open'); sh.classList.add('open'); });
    sh.setAttribute('aria-hidden', 'false');
  }
  function closeSheet() {
    const bd = document.getElementById('sheetBackdrop');
    const sh = document.getElementById('sheet');
    bd.classList.remove('open'); sh.classList.remove('open');
    sh.setAttribute('aria-hidden', 'true');
    setTimeout(() => { bd.hidden = true; sh.hidden = true; clearRoute(); }, 220);
  }

  function openHouseSheet(houseId) {
    const house = state.locations.houses.find(h => h.id === houseId);
    if (!house) return;
    const residents = state.roster.filter(p => p.house === houseId).sort((a, b) => a.position - b.position);
    const rows = residents.map(p => {
      const mine = state.myName && p.name === state.myName ? ' me' : '';
      return `<div class="resident${mine}"><span class="num">${p.position}</span><span>${escapeHtml(p.name)}</span></div>`;
    }).join('');
    openSheet(`
      <h2>${escapeHtml(house.name)}</h2>
      <div class="subtitle">${residents.length} ${plural(residents.length, ['человек','человека','человек'])}</div>
      ${rows || '<div class="subtitle">Пусто</div>'}
    `);
    setMarkerHighlight(houseId);
  }

  function openPoiSheet(poiId) {
    const poi = state.locations.pois.find(p => p.id === poiId);
    if (!poi) return;
    openSheet(`<h2>${poi.emoji} ${escapeHtml(poi.name)}</h2>`);
    setMarkerHighlight(poiId);
  }

  // ---------- Global banya counter (abacus.jasoncameron.dev) ----------
  const BANYA_NS = 'yagodnoe-2026-aith';
  const BANYA_KEY = 'banya-honors-live';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function fetchBanyaGlobal() {
    try {
      const r = await fetch(`https://abacus.jasoncameron.dev/get/${BANYA_NS}/${BANYA_KEY}`);
      if (!r.ok) return null;
      const j = await r.json();
      return typeof j.value === 'number' ? j.value : null;
    } catch { return null; }
  }
  // Serialized hit queue: at most 1 fetch in flight, ≥200ms gap, exponential backoff on 429.
  let banyaPending = 0;
  let banyaProcessing = false;
  let onBanyaServerValue = null; // callback to render authoritative value
  async function processBanyaQueue() {
    if (banyaProcessing) return;
    banyaProcessing = true;
    let consecutiveFail = 0;
    while (banyaPending > 0) {
      banyaPending--;
      try {
        const r = await fetch(`https://abacus.jasoncameron.dev/hit/${BANYA_NS}/${BANYA_KEY}`);
        if (r.status === 429) {
          banyaPending++; // re-queue
          let wait = 5000;
          try {
            const j = await r.json();
            const m = (j.error || '').match(/(\d+(?:\.\d+)?)/);
            if (m) wait = Math.ceil(parseFloat(m[1]) * 1000) + 300;
          } catch {}
          await sleep(Math.min(wait, 15000));
          continue;
        }
        if (r.ok) {
          const j = await r.json();
          if (typeof j.value === 'number' && onBanyaServerValue) onBanyaServerValue(j.value);
          consecutiveFail = 0;
        } else {
          consecutiveFail++;
        }
      } catch {
        consecutiveFail++;
      }
      if (consecutiveFail >= 5) break; // network dead, stop
      await sleep(220);
    }
    banyaProcessing = false;
  }
  function enqueueBanyaHit() {
    banyaPending++;
    processBanyaQueue();
  }
  function fmtNum(n) { try { return n.toLocaleString('ru-RU'); } catch { return String(n); } }
  function renderTotal(el, n) {
    if (n == null) { el.textContent = 'Всего почтили: — '; return; }
    el.textContent = 'Всего почтили: ' + fmtNum(n) + ' ' + plural(n, ['раз','раза','раз']);
  }

  function openBanyaSheet() {
    const n = LS.get(K.bath, 0) || 0;
    openSheet(`
      <div class="banya-sheet">
        <svg class="flame" viewBox="0 0 64 96" aria-hidden="true">
          <defs>
            <radialGradient id="fg2" cx="50%" cy="70%" r="60%">
              <stop offset="0%" stop-color="#ffe27a"/>
              <stop offset="40%" stop-color="#ff9a2b"/>
              <stop offset="100%" stop-color="#7a1f0a" stop-opacity="0.2"/>
            </radialGradient>
          </defs>
          <path class="flame-path" d="M32 8 C 42 26, 56 38, 52 60 C 48 82, 32 92, 32 92 C 32 92, 16 82, 12 60 C 8 38, 22 26, 32 8 Z" fill="url(#fg2)"/>
        </svg>
        <h2 class="banya-title">Здесь была баня</h2>
        <p class="banya-sub">Сгорела 20 апреля 2026.<br>Светлая память.</p>
        <button class="btn-honor" id="btnHonor">Почтить 🕯</button>
        <p class="banya-total" id="banyaTotal">Всего почтили: …</p>
        <p class="banya-count" id="banyaCount">${n > 0 ? 'Ты почтил баню ' + n + ' ' + plural(n, ['раз','раза','раз']) : 'Ты ещё никого не почтил'}</p>
        <div class="candle-layer" id="candleLayer" aria-hidden="true"></div>
        <div class="banya-hash">#баня</div>
      </div>
    `);
    setMarkerHighlight('bath-memorial');
    wireBanyaSheet();
  }

  function wireBanyaSheet() {
    const btn = document.getElementById('btnHonor');
    const count = document.getElementById('banyaCount');
    const total = document.getElementById('banyaTotal');
    const layer = document.getElementById('candleLayer');
    if (!btn || !count || !layer || !total) return;

    let localTotal = null;
    let seenMax = 0;
    onBanyaServerValue = v => {
      if (v > seenMax) { seenMax = v; if (localTotal == null || v > localTotal) localTotal = v; renderTotal(total, localTotal); }
    };
    fetchBanyaGlobal().then(v => {
      if (v == null) { renderTotal(total, null); return; }
      seenMax = v; localTotal = v; renderTotal(total, v);
    });

    btn.addEventListener('click', () => {
      haptic('medium');
      const n = (LS.get(K.bath, 0) || 0) + 1;
      LS.set(K.bath, n);
      count.textContent = 'Ты почтил баню ' + n + ' ' + plural(n, ['раз','раза','раз']);
      if (localTotal != null) { localTotal += 1; renderTotal(total, localTotal); }
      // Candle animation
      const c = document.createElement('div');
      c.className = 'candle';
      c.textContent = '🕯';
      const rect = btn.getBoundingClientRect();
      const layerRect = layer.getBoundingClientRect();
      const jitter = (Math.random() - 0.5) * 60;
      c.style.left = (rect.left + rect.width / 2 - layerRect.left + jitter) + 'px';
      c.style.top = (rect.top - layerRect.top) + 'px';
      layer.appendChild(c);
      setTimeout(() => c.remove(), 2300);
      // Serialized sync to global counter
      enqueueBanyaHit();
    });
  }

  // ---------- Schedule ----------
  function renderSchedule() {
    const host = document.getElementById('schedule');
    const html = state.schedule.days.map(day => {
      const events = day.events.map(ev => {
        const tap = ev.locationId ? ' tappable' : '';
        const loc = ev.location ? `<div class="loc">${escapeHtml(ev.location)}</div>` : '';
        return `<div class="event${tap}" data-date="${day.date}" data-time="${ev.time}" data-loc="${ev.locationId || ''}">
          <div class="time">${ev.time}</div>
          <div><div class="name">${escapeHtml(ev.title)}</div>${loc}</div>
        </div>`;
      }).join('');
      return `<div class="day-title serif">${escapeHtml(day.title)}</div>${events}`;
    }).join('');
    host.innerHTML = html;
    host.addEventListener('click', e => {
      const ev = e.target.closest('.event.tappable');
      if (!ev) return;
      const locId = ev.dataset.loc;
      if (!locId) return;
      haptic();
      showTab('map');
      setTimeout(() => openPoiSheet(locId), 80);
    });
  }

  // ---------- Now banner / countdown ----------
  const CAMP_START = new Date('2026-04-25T10:30:00+03:00');
  const CAMP_END = new Date('2026-04-26T13:30:00+03:00');

  function updateNowBanner() {
    const banner = document.getElementById('nowBanner');
    if (!banner || !state.schedule) return;
    const now = new Date();
    // Highlight current event
    document.querySelectorAll('.event').forEach(e => e.classList.remove('current'));

    if (now < CAMP_START) {
      const ms = CAMP_START - now;
      banner.innerHTML = `<span class="label">До выезда</span>${formatCountdown(ms)}`;
      return;
    }
    if (now > CAMP_END) {
      banner.innerHTML = `<span class="label">Выезд</span>Выезд завершён`;
      return;
    }
    // Within camp — find current event
    const all = [];
    state.schedule.days.forEach(d => d.events.forEach(ev => {
      all.push({ ...ev, dt: new Date(`${d.date}T${padTime(ev.time)}:00+03:00`), date: d.date });
    }));
    all.sort((a, b) => a.dt - b.dt);
    let cur = null;
    for (let i = 0; i < all.length; i++) {
      if (all[i].dt <= now && (!all[i + 1] || all[i + 1].dt > now)) { cur = all[i]; break; }
    }
    if (cur) {
      banner.innerHTML = `<span class="label">Сейчас</span><b>${escapeHtml(cur.title)}</b> · ${cur.time}${cur.location ? ' · <span style="color:var(--muted)">' + escapeHtml(cur.location) + '</span>' : ''}`;
      const node = document.querySelector(`.event[data-date="${cur.date}"][data-time="${cur.time}"]`);
      if (node) node.classList.add('current');
    } else {
      banner.innerHTML = `<span class="label">Сейчас</span>Скоро начнётся`;
    }
  }
  function padTime(t) { const [h, m] = t.split(':'); return `${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}`; }
  function formatCountdown(ms) {
    const totalMin = Math.floor(ms / 60000);
    const d = Math.floor(totalMin / (60 * 24));
    const h = Math.floor((totalMin % (60 * 24)) / 60);
    const m = totalMin % 60;
    if (d > 0) return `${d}д ${h}ч ${m}мин`;
    return `${h}ч ${m}мин`;
  }

  // ---------- Edit mode: drag markers to reposition, export JSON ----------
  function setupDevMode() {
    const qs = new URLSearchParams(location.search);
    if (!qs.has('edit') && !qs.has('dev')) return;
    const img = document.getElementById('mapImg');
    const saved = LS.get('yagodnoe:editCoords', null);
    if (saved) {
      saved.pois && saved.pois.forEach(p => {
        const it = state.locations.pois.find(x => x.id === p.id);
        if (it) { it.x = p.x; it.y = p.y; }
      });
      saved.houses && saved.houses.forEach(p => {
        const it = state.locations.houses.find(x => x.id === p.id);
        if (it) { it.x = p.x; it.y = p.y; }
      });
      renderMarkers();
    }
    const bar = document.createElement('div');
    bar.className = 'edit-bar';
    bar.innerHTML = `
      <div class="edit-msg">EDIT: тяни маркеры на розовые кружки</div>
      <div class="edit-actions">
        <button id="editReset">Сбросить</button>
        <button id="editExport" class="primary">Сохранить + JSON</button>
      </div>
      <textarea id="editOut" readonly placeholder="Здесь появится JSON"></textarea>
    `;
    document.body.appendChild(bar);

    const attachDrag = (el) => {
      let dragging = false;
      el.style.touchAction = 'none';
      el.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        dragging = true;
        el.classList.add('dragging');
      });
      el.addEventListener('pointermove', e => {
        if (!dragging) return;
        e.preventDefault(); e.stopPropagation();
        const r = img.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
        const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
        el.style.left = x + '%';
        el.style.top = y + '%';
        const arr = el.dataset.kind === 'house' ? state.locations.houses : state.locations.pois;
        const item = arr.find(o => o.id === el.dataset.id);
        if (item) { item.x = Math.round(x * 10) / 10; item.y = Math.round(y * 10) / 10; }
      });
      const end = e => {
        if (!dragging) return;
        dragging = false;
        el.classList.remove('dragging');
        try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      // Suppress sheet-open click in edit mode
      el.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); }, true);
    };
    document.querySelectorAll('.marker').forEach(attachDrag);

    document.getElementById('editExport').addEventListener('click', () => {
      const out = {
        pois: state.locations.pois.map(p => ({ id: p.id, name: p.name, emoji: p.emoji, x: p.x, y: p.y })),
        houses: state.locations.houses.map(h => ({ id: h.id, name: h.name, x: h.x, y: h.y })),
      };
      const json = JSON.stringify(out, null, 2);
      document.getElementById('editOut').value = json;
      LS.set('yagodnoe:editCoords', out);
      try { navigator.clipboard && navigator.clipboard.writeText(json); } catch (_) {}
    });
    document.getElementById('editReset').addEventListener('click', () => {
      if (!confirm('Сбросить все правки и перезагрузить?')) return;
      try { localStorage.removeItem('yagodnoe:editCoords'); } catch (_) {}
      location.reload();
    });
  }

  // ---------- Utils ----------
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function escapeAttr(s) { return escapeHtml(s); }
  function shortName(full) {
    const parts = full.split(' ');
    if (parts.length >= 2) return parts[0] + ' ' + parts[1][0] + '.';
    return full;
  }
  function plural(n, forms) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return forms[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
    return forms[2];
  }
})();
