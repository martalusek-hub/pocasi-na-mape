/* Počasí na mapě
 * Mapa: Leaflet + Esri World Dark Gray (tmavý podklad a popisky)
 * Data: Open-Meteo (https://open-meteo.com) – bez API klíče
 */
(() => {
  'use strict';

  const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

  /* Počet vzorkovacích bodů mřížky nad mapou.
   * Open-Meteo počítá každou souřadnici jako samostatné volání (limit 600/min),
   * proto držíme mřížku menší. */
  const NX = 9;
  const NY = 7;

  const REFRESH_MS = 10 * 60 * 1000;
  const MOVE_DEBOUNCE_MS = 240;

  /* Předpověď: kolik dní hodinových dat načítat a jak rychle přehrávat */
  const FORECAST_DAYS = 3;
  const PLAY_INTERVAL_MS = 600;

  const LAYERS = {
    precipitation: {
      title: 'Srážky',
      unit: 'mm/h',
      field: 'precipitation',
      color: '#38bdf8',
      max: 10,
      stops: [
        [0.0, [56, 189, 248], 0.0],
        [0.05, [56, 189, 248], 0.2],
        [0.3, [59, 130, 246], 0.5],
        [1.0, [37, 99, 235], 0.68],
        [2.5, [139, 92, 246], 0.78],
        [5.0, [236, 72, 153], 0.86],
        [10.0, [239, 68, 68], 0.92],
      ],
      ticks: [0, 1, 2, 5, 10],
      tickLabels: ['0', '1', '2', '5', '10+'],
    },
    snow: {
      title: 'Sněžení',
      unit: 'cm/h',
      field: 'snowfall',
      color: '#c4b5fd',
      max: 5,
      stops: [
        [0.0, [224, 242, 254], 0.0],
        [0.05, [186, 230, 253], 0.25],
        [0.3, [147, 197, 253], 0.5],
        [1.0, [129, 140, 248], 0.7],
        [3.0, [167, 139, 250], 0.85],
        [5.0, [216, 180, 254], 0.92],
      ],
      ticks: [0, 0.5, 1, 2, 5],
      tickLabels: ['0', '0,5', '1', '2', '5+'],
    },
    cloud: {
      title: 'Oblačnost',
      unit: '%',
      field: 'cloud_cover',
      color: '#a5b4fc',
      max: 100,
      stops: [
        [0, [148, 163, 184], 0.0],
        [25, [203, 213, 225], 0.32],
        [60, [226, 232, 240], 0.58],
        [100, [248, 250, 252], 0.86],
      ],
      ticks: [0, 25, 50, 75, 100],
      tickLabels: ['0', '25', '50', '75', '100'],
    },
    wind: {
      title: 'Vítr',
      unit: 'km/h',
      field: 'wind_speed_10m',
      color: '#34d399',
      max: 120,
      stops: [
        [0, [34, 197, 94], 0.1],
        [5, [34, 197, 94], 0.26],
        [20, [163, 230, 53], 0.44],
        [40, [250, 204, 21], 0.58],
        [60, [249, 115, 22], 0.7],
        [80, [239, 68, 68], 0.82],
        [120, [168, 85, 247], 0.9],
      ],
      ticks: [0, 20, 40, 60, 80, 120],
      tickLabels: ['0', '20', '40', '60', '80', '120+'],
    },
  };

  const WMO = {
    0: 'Jasno',
    1: 'Převážně jasno',
    2: 'Polojasno',
    3: 'Zataženo',
    45: 'Mlha',
    48: 'Mrznoucí mlha',
    51: 'Slabé mrholení',
    53: 'Mrholení',
    55: 'Silné mrholení',
    56: 'Mrznoucí mrholení',
    57: 'Mrznoucí mrholení',
    61: 'Slabý déšť',
    63: 'Déšť',
    65: 'Silný déšť',
    66: 'Mrznoucí déšť',
    67: 'Mrznoucí déšť',
    71: 'Slabé sněžení',
    73: 'Sněžení',
    75: 'Silné sněžení',
    77: 'Sněhové krupky',
    80: 'Slabé přeháňky',
    81: 'Přeháňky',
    82: 'Silné přeháňky',
    85: 'Sněhové přeháňky',
    86: 'Sněhové přeháňky',
    95: 'Bouřka',
    96: 'Bouřka s kroupami',
    99: 'Bouřka s kroupami',
  };

  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
  const wrapLng = (lng) => {
    let x = lng;
    while (x > 180) x -= 360;
    while (x < -180) x += 360;
    return x;
  };
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));

  const state = {
    layer: 'precipitation',
    grid: null,
    overlay: null,
    marker: null,
    token: 0,
    controller: null,
    searchController: null,
    searchToken: 0,
    suggestionIndex: -1,
    suggestions: [],
    lut: {},
    lastKey: null,
    lastFetchAt: 0,
    timeIndex: 0,
    view: 'map',
    placeName: null,
    chartHover: null,
  };

  /* ================= MAPA ================= */

  const map = L.map('map', {
    zoomControl: false,
    minZoom: 2,
    maxZoom: 15,
    worldCopyJump: true,
  }).setView([49.85, 15.3], 8);

  /* Tmavý podklad bez API klíče: Esri World Dark Gray (base + popisky).
   * Kdyby některá ze služeb přestala fungovat, aplikace se sama přepne
   * na OpenStreetMap s tmavým filtrem (viz useOsmFallback). */
  const BASEMAP_ATTRIBUTION =
    'Tiles &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> ' +
    '&mdash; Esri, DeLorme, NAVTEQ &middot; data ' +
    '<a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>';

  const baseLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 16, maxNativeZoom: 16, attribution: BASEMAP_ATTRIBUTION }
  ).addTo(map);

  const labelsLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 16, maxNativeZoom: 16, attribution: '' }
  ).addTo(map);

  let tileErrors = 0;
  let fallbackDone = false;

  function useOsmFallback() {
    if (fallbackDone) return;
    fallbackDone = true;

    map.removeLayer(baseLayer);
    map.removeLayer(labelsLayer);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'basemap-invert',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> ' +
        'contributors &middot; data <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>',
    }).addTo(map);

    toast('Tmavý podklad se nepodařilo načíst, přepnul jsem na OpenStreetMap.');
  }

  baseLayer.on('tileerror', () => {
    tileErrors += 1;
    if (tileErrors >= 4) setTimeout(useOsmFallback, 0);
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.attributionControl.setPrefix(false);
  /* atribuce doleva dolů, aby ji nepřekrývala časová osa */
  map.attributionControl.setPosition('bottomleft');

  /* ================= POMOCNÉ VÝPOČTY ================= */

  function getLut(layerName) {
    if (state.lut[layerName]) return state.lut[layerName];
    const layer = LAYERS[layerName];
    const lut = new Uint8ClampedArray(256 * 4);
    const stops = layer.stops;
    const max = layer.max;

    for (let i = 0; i < 256; i++) {
      const v = (i / 255) * max;
      let s0 = stops[0];
      let s1 = stops[stops.length - 1];
      for (let s = 0; s < stops.length - 1; s++) {
        if (v >= stops[s][0] && v <= stops[s + 1][0]) {
          s0 = stops[s];
          s1 = stops[s + 1];
          break;
        }
      }
      const span = s1[0] - s0[0];
      const t = span > 0 ? clamp((v - s0[0]) / span, 0, 1) : 0;
      const o = i * 4;
      lut[o] = s0[1][0] + (s1[1][0] - s0[1][0]) * t;
      lut[o + 1] = s0[1][1] + (s1[1][1] - s0[1][1]) * t;
      lut[o + 2] = s0[1][2] + (s1[1][2] - s0[1][2]) * t;
      lut[o + 3] = (s0[2] + (s1[2] - s0[2]) * t) * 255;
    }

    state.lut[layerName] = lut;
    return lut;
  }

  function arrowPath(ctx, x, y, dx, dy) {
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const tipX = x + dx / 2;
    const tipY = y + dy / 2;
    const tailX = x - dx / 2;
    const tailY = y - dy / 2;
    const head = Math.max(3, len * 0.34);

    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(tipX, tipY);
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - ux * head - uy * head * 0.62, tipY - uy * head + ux * head * 0.62);
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - ux * head + uy * head * 0.62, tipY - uy * head - ux * head * 0.62);
    ctx.stroke();
  }

  function drawWindArrows(ctx, cw, ch) {
    const { values, dirs } = state.grid;
    const vals = values.wind;
    const offset = state.timeIndex * NX * NY;
    const sx = cw / (NX - 1);
    const sy = ch / (NY - 1);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i;
        const speed = vals[offset + k];
        const dir = dirs[offset + k];
        if (!Number.isFinite(dir) || speed < 1) continue;

        /* směr větru je "odkud fouká" -> šipka ukazuje, kam fouká */
        const rad = ((dir + 180) * Math.PI) / 180;
        const len = 6 + Math.min(speed, 100) * 0.18;
        const dx = Math.sin(rad) * len;
        const dy = -Math.cos(rad) * len;
        const x = i * sx;
        const y = j * sy;

        ctx.strokeStyle = 'rgba(2, 6, 23, 0.65)';
        ctx.lineWidth = 3.2;
        arrowPath(ctx, x, y, dx, dy);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = 1.3;
        arrowPath(ctx, x, y, dx, dy);
      }
    }

    ctx.restore();
  }

  /* Vykreslí data mřížky do canvasu a vloží je jako obrázek do mapy */
  function renderOverlay() {
    if (!state.grid) return;
    const size = map.getSize();
    if (!size.x || !size.y) return;

    const cw = Math.max(32, Math.round(size.x / 2));
    const ch = Math.max(32, Math.round(size.y / 2));

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const layer = LAYERS[state.layer];
    const lut = getLut(state.layer);
    const vals = state.grid.values[state.layer];
    const max = layer.max;
    const offset = state.timeIndex * NX * NY;

    const img = ctx.createImageData(cw, ch);
    const data = img.data;

    const stepX = (NX - 1) / Math.max(1, cw - 1);
    const stepY = (NY - 1) / Math.max(1, ch - 1);

    for (let y = 0; y < ch; y++) {
      let gy = y * stepY;
      let j = Math.floor(gy);
      if (j > NY - 2) j = NY - 2;
      let ty = gy - j;
      ty = ty * ty * (3 - 2 * ty);

      const r0 = j * NX;
      const r1 = r0 + NX;
      let p = y * cw * 4;

      for (let x = 0; x < cw; x++) {
        let gx = x * stepX;
        let i = Math.floor(gx);
        if (i > NX - 2) i = NX - 2;
        let tx = gx - i;
        tx = tx * tx * (3 - 2 * tx);

        const v00 = vals[offset + r0 + i];
        const v10 = vals[offset + r0 + i + 1];
        const v01 = vals[offset + r1 + i];
        const v11 = vals[offset + r1 + i + 1];

        const top = v00 + (v10 - v00) * tx;
        const bottom = v01 + (v11 - v01) * tx;
        const v = top + (bottom - top) * ty;

        let idx = (v / max) * 255;
        idx = idx < 0 ? 0 : idx > 255 ? 255 : idx | 0;

        const q = idx * 4;
        data[p] = lut[q];
        data[p + 1] = lut[q + 1];
        data[p + 2] = lut[q + 2];
        data[p + 3] = lut[q + 3];
        p += 4;
      }
    }

    ctx.putImageData(img, 0, 0);

    if (state.layer === 'wind') drawWindArrows(ctx, cw, ch);

    const overlay = L.imageOverlay(canvas.toDataURL('image/png'), map.getBounds(), {
      interactive: false,
      className: 'wx-overlay',
      opacity: 1,
    });

    const old = state.overlay;
    overlay.addTo(map);
    state.overlay = overlay;
    if (old) map.removeLayer(old);
  }

  /* ================= NAČTENÍ DAT ================= */

  async function refreshOverlay(force = false) {
    const size = map.getSize();
    if (!size.x || !size.y) return;

    /* Stejný výřez už je načtený (nebo se právě načítá) – nic nedělej. */
    const center = map.getCenter();
    const key =
      `${map.getZoom()}|${center.lat.toFixed(3)}|${center.lng.toFixed(3)}|` +
      `${size.x}x${size.y}`;
    if (!force && key === state.lastKey) return;
    state.lastKey = key;

    const token = ++state.token;
    if (state.controller) state.controller.abort();
    const controller = new AbortController();
    state.controller = controller;

    setStatus('loading');

    const lats = [];
    const lngs = [];

    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const pt = map.containerPointToLatLng([
          (i / (NX - 1)) * size.x,
          (j / (NY - 1)) * size.y,
        ]);
        lats.push(clamp(pt.lat, -89.9, 89.9).toFixed(4));
        lngs.push(wrapLng(pt.lng).toFixed(4));
      }
    }

    const params = new URLSearchParams({
      latitude: lats.join(','),
      longitude: lngs.join(','),
      hourly:
        'precipitation,snowfall,cloud_cover,wind_speed_10m,wind_direction_10m',
      forecast_days: String(FORECAST_DAYS),
      timezone: 'UTC',
    });

    try {
      const res = await fetch(`${FORECAST_URL}?${params.toString()}`, {
        signal: controller.signal,
      });

      if (res.status === 429) {
        const retry = Number(res.headers.get('Retry-After')) || 30;
        const err = new Error('RATE_LIMIT');
        err.rateLimit = true;
        err.retry = retry;
        throw err;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      if (token !== state.token) return;

      const list = Array.isArray(json) ? json : [json];
      if (!list.length) throw new Error('Prázdná odpověď');

      const n = NX * NY;
      const times = (list[0] && list[0].hourly && list[0].hourly.time) || [];
      const steps = times.length;
      if (!steps) throw new Error('Chybí hodinová data');

      const values = {
        precipitation: new Float32Array(n * steps),
        snow: new Float32Array(n * steps),
        cloud: new Float32Array(n * steps),
        wind: new Float32Array(n * steps),
      };
      const dirs = new Float32Array(n * steps);

      for (let k = 0; k < n; k++) {
        const h = (list[k] && list[k].hourly) || {};
        const p = h.precipitation || [];
        const s = h.snowfall || [];
        const c = h.cloud_cover || [];
        const w = h.wind_speed_10m || [];
        const d = h.wind_direction_10m || [];

        for (let t = 0; t < steps; t++) {
          const idx = t * n + k;
          values.precipitation[idx] = num(p[t]);
          values.snow[idx] = num(s[t]);
          values.cloud[idx] = num(c[t]);
          values.wind[idx] = num(w[t]);
          dirs[idx] = num(d[t]);
        }
      }

      /* Hodinové kroky jsou v UTC – najdi index aktuální hodiny. */
      const nowHour = Math.floor(Date.now() / 3600000) * 3600000;
      let startIndex = times.findIndex((t) => Date.parse(`${t}Z`) >= nowHour);
      if (startIndex < 0) startIndex = 0;

      /* Pokud měl uživatel vybraný čas, zachovej ho i po obnovení dat. */
      let timeIndex = startIndex;
      const prevTime =
        state.grid && state.grid.times
          ? state.grid.times[state.timeIndex]
          : null;
      if (prevTime) {
        const found = times.indexOf(prevTime);
        if (found >= 0) timeIndex = found;
      }

      state.grid = { values, dirs, times, steps, startIndex };
      state.timeIndex = timeIndex;
      state.lastFetchAt = Date.now();

      updateTimeline();
      renderOverlay();
      if (state.view === 'chart') updateChart();

      const now = new Date();
      const hm =
        `${String(now.getHours()).padStart(2, '0')}:` +
        `${String(now.getMinutes()).padStart(2, '0')}`;
      setStatus('ok', `Aktualizováno ${hm}`);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (token !== state.token) return;

      console.error(err);
      state.lastKey = null;

      if (err && err.rateLimit) {
        const retry = err.retry || 30;
        setStatus('error', `Limit požadavků – zkus za ${retry} s`);
        toast(
          'Open-Meteo dočasně odmítá požadavky (limit 600 volání za minutu). ' +
          `Zkus to za ${retry} sekund.`
        );
        setTimeout(() => {
          if (!document.hidden) refreshOverlay(true);
        }, (retry + 1) * 1000);
        return;
      }

      setStatus('error', 'Data se nepodařilo načíst');
      toast('Nepodařilo se načíst data z Open-Meteo. Zkontroluj připojení k internetu.');
    }
  }

  /* ================= LEGENDA ================= */

  function updateLegend() {
    const layer = LAYERS[state.layer];

    $('#legendTitle').textContent = layer.title;
    $('#legendUnit').textContent = layer.unit;

    $('#legendBar').style.background =
      'linear-gradient(90deg, ' +
      layer.stops
        .map(([v, c, a]) => `${rgba(c, a)} ${((v / layer.max) * 100).toFixed(2)}%`)
        .join(', ') +
      ')';

    const scale = $('#legendScale');
    scale.innerHTML = '';

    layer.ticks.forEach((tick, i) => {
      const span = document.createElement('span');
      span.textContent = layer.tickLabels[i];
      const pct = (tick / layer.max) * 100;
      span.style.left = `${pct}%`;
      if (pct <= 0.01) span.style.transform = 'translateX(0)';
      else if (pct >= 99.99) span.style.transform = 'translateX(-100%)';
      scale.appendChild(span);
    });
  }

  function setLayer(name) {
    if (!LAYERS[name] || name === state.layer) return;
    state.layer = name;

    document.querySelectorAll('.layer-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.layer === name);
    });

    updateLegend();
    if (state.grid) renderOverlay();
    if (state.view === 'chart') updateChart();
  }

  /* ================= ČASOVÁ OSA ================= */

  const timeSlider = $('#timeSlider');
  const playBtn = $('#playBtn');
  const nowBtn = $('#nowBtn');
  const timelineTime = $('#timelineTime');

  let playTimer = null;

  function dayLabel(iso) {
    const date = new Date(`${iso}Z`);
    const now = new Date();
    const startOfDay = (d) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayDiff = Math.round(
      (startOfDay(date) - startOfDay(now)) / 86400000
    );

    if (dayDiff === 0) return 'dnes';
    if (dayDiff === 1) return 'zítra';
    if (dayDiff === 2) return 'pozítří';
    return date.toLocaleDateString('cs-CZ', { weekday: 'short' });
  }

  function formatTime(iso) {
    const date = new Date(`${iso}Z`);
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${dayLabel(iso)} ${hh}:${mm}`;
  }

  function updateTimeline() {
    if (!state.grid) return;

    const { times, steps, startIndex } = state.grid;
    const index = Math.min(Math.max(state.timeIndex, startIndex), steps - 1);
    state.timeIndex = index;

    timeSlider.min = String(startIndex);
    timeSlider.max = String(steps - 1);
    timeSlider.value = String(index);
    timeSlider.disabled = steps <= 1;

    const label = formatTime(times[index]);
    timelineTime.textContent =
      index === startIndex ? `nyní · ${label.replace(/^dnes /, '')}` : label;

    $('#scaleStart').textContent = 'nyní';
    $('#scaleMid').textContent =
      steps - 1 - startIndex >= 24 ? '+24 h' : '';
    $('#scaleEnd').textContent = `+${steps - 1 - startIndex} h`;
  }

  function onTimeChange() {
    if (!state.grid) return;
    const value = Number(timeSlider.value);
    if (!Number.isFinite(value)) return;
    state.timeIndex = value;
    renderOverlay();
    updateTimeline();
    if (state.view === 'chart') drawChart();
  }

  function stopPlay() {
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
    playBtn.classList.remove('playing');
    playBtn.setAttribute('aria-label', 'Přehrát předpověď');
    playBtn.title = 'Přehrát předpověď';
  }

  function startPlay() {
    if (!state.grid || playTimer) return;

    playBtn.classList.add('playing');
    playBtn.setAttribute('aria-label', 'Pozastavit přehrávání');
    playBtn.title = 'Pozastavit přehrávání';

    playTimer = setInterval(() => {
      const min = Number(timeSlider.min);
      const max = Number(timeSlider.max);
      let next = Number(timeSlider.value) + 1;
      if (next > max) next = min;
      timeSlider.value = String(next);
      onTimeChange();
    }, PLAY_INTERVAL_MS);
  }

  timeSlider.addEventListener('input', () => {
    stopPlay();
    onTimeChange();
  });

  playBtn.addEventListener('click', () => {
    if (playTimer) stopPlay();
    else startPlay();
  });

  nowBtn.addEventListener('click', () => {
    if (!state.grid) return;
    stopPlay();
    timeSlider.value = String(state.grid.startIndex);
    onTimeChange();
  });

  /* ================= GRAF ================= */

  const chartView = $('#chartView');
  const chartCanvas = $('#chartCanvas');
  const chartEmpty = $('#chartEmpty');
  const viewMapBtn = $('#viewMapBtn');
  const viewChartBtn = $('#viewChartBtn');
  const timelinePanel = $('#timeline');
  const legendPanel = $('#legend');

  /* stejné okraje jako při kreslení – používá je i výpočet pozice kurzoru */
  const CHART_PAD = { top: 16, right: 16, bottom: 34, left: 46 };

  function niceCeil(value) {
    if (!Number.isFinite(value) || value <= 0) return 1;
    const exp = Math.floor(Math.log10(value));
    const base = Math.pow(10, exp);
    const n = value / base;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * base;
  }

  function hexToRgba(hex, alpha) {
    const value = parseInt(hex.replace('#', ''), 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }

  function fmtAxis(value, decimals) {
    return value.toFixed(decimals).replace('.', ',');
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* Hodnoty ve středu mřížky (přesně prostřední bod 9×7) pro celou předpověď. */
  function chartSeries() {
    const n = NX * NY;
    const center = 3 * NX + 4;
    const from = state.grid.startIndex;
    const to = state.grid.steps - 1;
    const vals = state.grid.values[state.layer];
    const data = [];

    for (let t = from; t <= to; t++) data.push(vals[t * n + center] || 0);

    return { data, from, to, times: state.grid.times };
  }

  function updateChartHeader() {
    const layer = LAYERS[state.layer];
    const c = map.getCenter();
    const lat = `${Math.abs(c.lat).toFixed(2)}° ${c.lat >= 0 ? 'N' : 'S'}`;
    const lng = `${Math.abs(c.lng).toFixed(2)}° ${c.lng >= 0 ? 'E' : 'W'}`;
    const place = state.placeName ? `${state.placeName} · ` : 'střed mapy · ';
    const coords =
      `${lat.replace('.', ',')}, ${lng.replace('.', ',')}`;

    $('#chartTitle').textContent = `${layer.title} – předpověď`;
    $('#chartSubtitle').textContent = `${place}${coords}`;
    $('#chartUnit').textContent = layer.unit;
  }

  function updateChart() {
    updateChartHeader();
    drawChart();
  }

  function drawChart() {
    if (state.view !== 'chart') return;

    const wrap = chartCanvas.parentElement;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (!w || !h) return;

    const hasData = !!(state.grid && state.grid.times && state.grid.steps > 1);
    chartEmpty.hidden = hasData;
    if (!hasData) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    chartCanvas.width = Math.round(w * dpr);
    chartCanvas.height = Math.round(h * dpr);
    chartCanvas.style.width = `${w}px`;
    chartCanvas.style.height = `${h}px`;

    const ctx = chartCanvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const layer = LAYERS[state.layer];
    const { data, from, times } = chartSeries();
    if (!data.length) return;

    const pad = CHART_PAD;
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    if (plotW <= 10 || plotH <= 10) return;

    const dataMax = Math.max(0, ...data);
    const yMax =
      state.layer === 'cloud'
        ? 100
        : niceCeil(Math.max(layer.max * 0.12, dataMax * 1.15));

    const xFor = (i) => pad.left + (i / Math.max(1, data.length - 1)) * plotW;
    const yFor = (v) => pad.top + plotH - (v / yMax) * plotH;

    /* vodorovná mřížka + osa Y */
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';

    const ySteps = 4;
    const yDecimals = yMax <= 5 ? 1 : 0;

    for (let i = 0; i <= ySteps; i++) {
      const value = (yMax / ySteps) * i;
      const y = yFor(value);

      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.strokeStyle =
        i === 0 ? 'rgba(148, 163, 184, 0.32)' : 'rgba(148, 163, 184, 0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
      ctx.fillText(fmtAxis(value, yDecimals), pad.left - 8, y);
    }

    /* svislé dělítka po dnech + popisky uprostřed dne */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let i = 0; i < data.length; i++) {
      const iso = times[from + i];
      if (!iso) continue;

      const hour = new Date(`${iso}Z`).getHours();
      const x = xFor(i);

      if (hour === 0) {
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, pad.top + plotH);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (hour === 12) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
        ctx.fillText(
          dayLabel(iso),
          clamp(x, pad.left + 18, w - pad.right - 18),
          pad.top + plotH + 10
        );
      }
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
    ctx.fillText('nyní', pad.left, pad.top + plotH + 10);

    /* plocha a čára */
    const stroke = layer.color;

    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, hexToRgba(stroke, 0.4));
    grad.addColorStop(1, hexToRgba(stroke, 0.02));

    ctx.beginPath();
    data.forEach((value, i) => {
      const x = xFor(i);
      const y = yFor(value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(xFor(data.length - 1), pad.top + plotH);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    data.forEach((value, i) => {
      const x = xFor(i);
      const y = yFor(value);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    /* vybraný čas (stejný jako na mapě) */
    const idx = clamp(state.timeIndex - from, 0, data.length - 1);
    const mx = xFor(idx);
    const my = yFor(data[idx]);

    ctx.beginPath();
    ctx.moveTo(mx, pad.top);
    ctx.lineTo(mx, pad.top + plotH);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(mx, my, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#0b1220';
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    /* bublina s hodnotou */
    const label = `${fmtAxis(data[idx], data[idx] < 10 ? 1 : 0)} ${layer.unit}`;
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
    const labelW = ctx.measureText(label).width;
    const bx = clamp(mx - labelW / 2 - 7, pad.left, w - pad.right - labelW - 14);
    const by = Math.max(pad.top + 2, my - 34);

    ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
    roundRect(ctx, bx, by, labelW + 14, 20, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + 7, by + 10);

    /* kurzor myši */
    if (state.chartHover != null) {
      const hi = clamp(state.chartHover, 0, data.length - 1);
      if (hi !== idx) {
        const hx = xFor(hi);
        const hy = yFor(data[hi]);

        ctx.beginPath();
        ctx.moveTo(hx, pad.top);
        ctx.lineTo(hx, pad.top + plotH);
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.32)';
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(hx, hy, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = '#e2e8f0';
        ctx.fill();

        const t1 = formatTime(times[from + hi]);
        const t2 = `${fmtAxis(data[hi], data[hi] < 10 ? 1 : 0)} ${layer.unit}`;
        ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
        const bw = Math.max(ctx.measureText(t1).width, ctx.measureText(t2).width) + 18;
        const bh = 38;
        const tbx = clamp(hx + 12, pad.left, w - pad.right - bw);
        const tby = clamp(hy - bh - 12, pad.top, pad.top + plotH - bh);

        ctx.fillStyle = 'rgba(2, 6, 23, 0.94)';
        roundRect(ctx, tbx, tby, bw, bh, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(148, 163, 184, 0.95)';
        ctx.fillText(t1, tbx + 9, tby + 6);
        ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(t2, tbx + 9, tby + 21);
      }
    }
  }

  function chartIndexFromEvent(event) {
    if (!state.grid) return null;
    const rect = chartCanvas.getBoundingClientRect();
    const plotW = rect.width - CHART_PAD.left - CHART_PAD.right;
    if (plotW <= 0) return null;
    const ratio = clamp((event.clientX - rect.left - CHART_PAD.left) / plotW, 0, 1);
    const { data } = chartSeries();
    return Math.round(ratio * (data.length - 1));
  }

  chartCanvas.addEventListener('pointermove', (event) => {
    if (state.view !== 'chart' || !state.grid) return;
    state.chartHover = chartIndexFromEvent(event);
    drawChart();
  });

  chartCanvas.addEventListener('pointerleave', () => {
    state.chartHover = null;
    if (state.view === 'chart') drawChart();
  });

  chartCanvas.addEventListener('click', (event) => {
    if (!state.grid) return;
    const idx = chartIndexFromEvent(event);
    if (idx == null) return;
    const { from } = chartSeries();
    state.timeIndex = from + idx;
    updateTimeline();
    renderOverlay();
    drawChart();
  });

  function setView(view) {
    state.view = view === 'chart' ? 'chart' : 'map';
    const isChart = state.view === 'chart';

    chartView.hidden = !isChart;
    timelinePanel.hidden = isChart;
    legendPanel.hidden = isChart;
    viewMapBtn.classList.toggle('active', !isChart);
    viewChartBtn.classList.toggle('active', isChart);
    viewMapBtn.setAttribute('aria-pressed', String(!isChart));
    viewChartBtn.setAttribute('aria-pressed', String(isChart));

    if (isChart) {
      updateChart();
    } else {
      state.chartHover = null;
      renderOverlay();
    }
  }

  viewMapBtn.addEventListener('click', () => setView('map'));
  viewChartBtn.addEventListener('click', () => setView('chart'));

  window.addEventListener('resize', () => {
    if (state.view === 'chart') drawChart();
  });

  map.on('dragstart', () => {
    state.placeName = null;
    if (state.view === 'chart') updateChartHeader();
  });

  /* ================= STAV / TOAST ================= */

  function setStatus(kind, text) {
    const dot = $('#statusDot');
    dot.className = `dot ${kind}`;
    $('#statusText').textContent =
      text || (kind === 'loading' ? 'Načítám data…' : '');
  }

  let toastTimer = null;

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.hidden = false;
    /* krátká prodleva, aby prohlížeč stihl přechodovou animaci */
    setTimeout(() => el.classList.add('show'), 20);

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => { el.hidden = true; }, 260);
    }, 6000);
  }

  /* ================= VYHLEDÁVÁNÍ ================= */

  const searchInput = $('#searchInput');
  const suggestionsEl = $('#suggestions');

  function hideSuggestions() {
    suggestionsEl.hidden = true;
    suggestionsEl.innerHTML = '';
    state.suggestions = [];
    state.suggestionIndex = -1;
  }

  async function runSearch(query) {
    const token = ++state.searchToken;
    if (state.searchController) state.searchController.abort();
    const controller = new AbortController();
    state.searchController = controller;

    try {
      const url =
        `${GEOCODE_URL}?name=${encodeURIComponent(query)}` +
        '&count=6&language=cs&format=json';
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (token !== state.searchToken) return;

      const results = Array.isArray(json.results) ? json.results : [];
      if (!results.length) {
        state.suggestions = [];
        suggestionsEl.innerHTML = '<li class="empty">Nic nenalezeno</li>';
        suggestionsEl.hidden = false;
        return;
      }

      state.suggestions = results;
      state.suggestionIndex = -1;

      suggestionsEl.innerHTML = results
        .map((r, idx) => {
          const sub = [r.admin1, r.country].filter(Boolean).join(', ');
          return (
            `<li role="option" data-idx="${idx}">` +
            `<span class="s-name">${escapeHtml(r.name)}</span>` +
            `<span class="s-sub">${escapeHtml(sub)}</span>` +
            '</li>'
          );
        })
        .join('');

      suggestionsEl.hidden = false;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      console.error(err);
      toast('Vyhledávání se nepodařilo. Zkontroluj připojení k internetu.');
    }
  }

  function showMarker(lat, lng, label) {
    if (state.marker) map.removeLayer(state.marker);
    state.marker = L.circleMarker([lat, lng], {
      radius: 6,
      color: '#38bdf8',
      weight: 2,
      fillColor: '#0ea5e9',
      fillOpacity: 0.9,
    })
      .addTo(map)
      .bindTooltip(label, { direction: 'top', offset: [0, -8] });
    state.marker.openTooltip();
  }

  function selectPlace(result) {
    searchInput.value = result.name;
    hideSuggestions();
    searchInput.blur();

    state.placeName = result.name;
    if (state.view === 'chart') updateChartHeader();

    map.flyTo([result.latitude, result.longitude], 10, { duration: 1.1 });

    const label = result.country
      ? `${result.name} (${result.country})`
      : result.name;
    showMarker(result.latitude, result.longitude, label);
  }

  let searchTimer = null;

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const query = searchInput.value.trim();
    if (query.length < 2) {
      hideSuggestions();
      return;
    }
    searchTimer = setTimeout(() => runSearch(query), 300);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (suggestionsEl.hidden) {
      if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query) runSearch(query);
      }
      return;
    }

    const items = [...suggestionsEl.querySelectorAll('li[data-idx]')];
    if (!items.length) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      state.suggestionIndex =
        (state.suggestionIndex + delta + items.length) % items.length;
      items.forEach((el, i) =>
        el.classList.toggle('active', i === state.suggestionIndex));
      items[state.suggestionIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = state.suggestionIndex >= 0 ? state.suggestionIndex : 0;
      const result = state.suggestions[idx];
      if (result) selectPlace(result);
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  });

  suggestionsEl.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-idx]');
    if (!li) return;
    const result = state.suggestions[Number(li.dataset.idx)];
    if (result) selectPlace(result);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) hideSuggestions();
  });

  /* ================= POPUP BODU ================= */

  function fmtNum(value, decimals) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return value.toFixed(decimals).replace('.', ',');
  }

  async function fetchPoint(lat, lng) {
    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lng.toFixed(4),
      current:
        'temperature_2m,apparent_temperature,relative_humidity_2m,' +
        'precipitation,snowfall,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code',
      hourly: 'precipitation,snowfall,cloud_cover,wind_speed_10m',
      forecast_days: '2',
      timezone: 'auto',
    });

    const res = await fetch(`${FORECAST_URL}?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return Array.isArray(json) ? json[0] : json;
  }

  function buildPopupHtml(data, latlng) {
    const cur = data.current || {};
    const layer = LAYERS[state.layer];
    const description = WMO[cur.weather_code] || '—';

    const rows = [
      ['Teplota', `${fmtNum(cur.temperature_2m, 1)} °C`],
      ['Pocitově', `${fmtNum(cur.apparent_temperature, 1)} °C`],
      ['Srážky', `${fmtNum(cur.precipitation, 1)} mm`],
      ['Oblačnost', `${fmtNum(cur.cloud_cover, 0)} %`],
      ['Vítr', `${fmtNum(cur.wind_speed_10m, 0)} km/h`],
      ['Vlhkost', `${fmtNum(cur.relative_humidity_2m, 0)} %`],
    ];

    if (cur.snowfall > 0) {
      rows.splice(3, 0, ['Sněžení', `${fmtNum(cur.snowfall, 1)} cm`]);
    }

    return (
      '<div class="popup-body">' +
      '<div class="popup-head">' +
      `<div class="popup-place">${latlng.lat.toFixed(3)}, ${latlng.lng.toFixed(3)}</div>` +
      `<div class="popup-desc">${escapeHtml(description)}</div>` +
      '</div>' +
      '<dl class="popup-rows">' +
      rows
        .map(([key, val]) => `<div><dt>${key}</dt><dd>${val}</dd></div>`)
        .join('') +
      '</dl>' +
      `<div class="popup-chart-title">${layer.title} – dalších 12 h</div>` +
      '<canvas class="spark" width="258" height="66"></canvas>' +
      '</div>'
    );
  }

  function drawSpark(canvas, data) {
    const layer = LAYERS[state.layer];
    const times = (data.hourly && data.hourly.time) || [];
    const series = (data.hourly && data.hourly[layer.field]) || [];
    if (!series.length) return;

    const currentTime = String((data.current && data.current.time) || '');
    const nowHour = `${currentTime.slice(0, 13)}:00`;
    let start = times.indexOf(nowHour);
    if (start < 0) start = 0;

    const vals = series
      .slice(start, start + 12)
      .map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0));
    if (!vals.length) return;

    const dpr = window.devicePixelRatio || 1;
    const w = 258;
    const h = 66;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const top = 6;
    const bottom = h - 12;
    const left = 3;
    const right = w - 3;
    const maxV = Math.max(layer.max * 0.12, ...vals) * 1.12;

    const xFor = (i) =>
      left + (i / Math.max(1, vals.length - 1)) * (right - left);
    const yFor = (v) => bottom - (v / maxV) * (bottom - top);

    /* plocha */
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = xFor(i);
      const y = yFor(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(right, bottom);
    ctx.lineTo(left, bottom);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.34)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.02)');
    ctx.fillStyle = grad;
    ctx.fill();

    /* čára */
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = xFor(i);
      const y = yFor(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.stroke();

    /* zvýraznění špičky */
    let peak = 0;
    vals.forEach((v, i) => { if (v > vals[peak]) peak = i; });
    if (vals[peak] > 0) {
      ctx.beginPath();
      ctx.arc(xFor(peak), yFor(vals[peak]), 2.6, 0, Math.PI * 2);
      ctx.fillStyle = '#7dd3fc';
      ctx.fill();
    }

    /* popisky */
    ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
    ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText('nyní', left, h - 1);
    ctx.textAlign = 'right';
    ctx.fillText('+12 h', right, h - 1);
  }

  async function openPointPopup(latlng) {
    const popup = L.popup({
      maxWidth: 320,
      className: 'wx-popup',
      autoPanPadding: [26, 26],
    })
      .setLatLng(latlng)
      .setContent(
        '<div class="popup-loading"><span class="spinner"></span> Načítám…</div>'
      )
      .openOn(map);

    try {
      const data = await fetchPoint(latlng.lat, latlng.lng);
      if (!map.hasLayer(popup)) return;

      popup.setContent(buildPopupHtml(data, latlng));

      /* setContent aktualizuje DOM synchronně – canvas je hned k dispozici.
       * (rAF se v některých prostředích vůbec nespustí.) */
      const el = popup.getElement();
      const canvas = el && el.querySelector('canvas.spark');
      if (canvas) drawSpark(canvas, data);
    } catch (err) {
      console.error(err);
      if (map.hasLayer(popup)) {
        popup.setContent(
          '<div class="popup-loading">Data se nepodařilo načíst.</div>'
        );
      }
    }
  }

  /* ================= OVLÁDACÍ PRVKY ================= */

  document.querySelectorAll('.layer-btn').forEach((btn) => {
    btn.addEventListener('click', () => setLayer(btn.dataset.layer));
  });

  $('#refreshBtn').addEventListener('click', () => refreshOverlay(true));

  $('#locateBtn').addEventListener('click', () => {
    if (!navigator.geolocation) {
      toast('Tvůj prohlížeč neumí zjistit polohu.');
      return;
    }

    setStatus('loading', 'Zjišťuji polohu…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        state.placeName = 'Moje poloha';
        if (state.view === 'chart') updateChartHeader();
        map.flyTo([latitude, longitude], 10, { duration: 1.1 });
        showMarker(latitude, longitude, 'Moje poloha');
      },
      () => {
        setStatus('error', 'Polohu se nepodařilo zjistit');
        toast('Polohu se nepodařilo zjistit. Povol přístup k poloze v prohlížeči.');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  });

  map.on('click', (e) => openPointPopup(e.latlng));

  let moveTimer = null;
  map.on('moveend', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(refreshOverlay, MOVE_DEBOUNCE_MS);
  });

  setInterval(() => {
    if (!document.hidden) refreshOverlay(true);
  }, REFRESH_MS);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - state.lastFetchAt > 60000) {
      refreshOverlay(true);
    }
  });

  /* ================= PWA: instalace a offline režim ================= */

  const installBtn = $('#installBtn');
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installBtn.hidden = false;
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    installBtn.hidden = true;
    if (choice && choice.outcome === 'accepted') {
      toast('Aplikace se instaluje…');
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installBtn.hidden = true;
    toast('Aplikace je nainstalovaná.');
  });

  window.addEventListener('offline', () => {
    setStatus('error', 'Offline – poslední data');
  });

  window.addEventListener('online', () => {
    refreshOverlay(true);
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Service worker se nepodařilo zaregistrovat:', err);
      });
    });
  }

  /* ================= START ================= */

  updateLegend();
  setStatus('loading');
  map.whenReady(() => refreshOverlay());
})();
