import { saveRecord, loadRecords, overwriteRecords, exportCSV } from './app-utils.js';

// ---------------------------------------------------------------------------
// Service Worker management
// ---------------------------------------------------------------------------
const IS_DEV = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  || location.hostname.includes('shakespeare.diy') || location.hostname.includes('ngit')
  || location.port !== '';

if (IS_DEV) {
  (async function clearStaleCaches() {
    if (sessionStorage.getItem('dev_sw_cleared')) return;
    if ('serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      } catch (e) { /* ignore */ }
    }
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      } catch (e) { /* ignore */ }
    }
    sessionStorage.setItem('dev_sw_cleared', '1');
    location.reload();
  })();
} else if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ---------------------------------------------------------------------------
// GKI calculation
// ---------------------------------------------------------------------------
function computeGKI(glucoseValue, glucoseUnit, ketonesValue) {
  const g = parseFloat(glucoseValue);
  if (isNaN(g)) return null;
  const gMmol = glucoseUnit === 'mgdL' ? g / 18 : g;
  const k = parseFloat(ketonesValue);
  if (isNaN(k) || k <= 0) return null;
  return Number((gMmol / k).toFixed(2));
}

// Expose for console debugging
window.AppUtils = { calculateGKI: computeGKI, saveRecord, loadRecords };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function pad2(n) { return String(n).padStart(2, '0'); }

function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fmtTime24(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtDateInput(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function getLevel(gki) {
  if (gki < 1) return { text: 'Extreme Ketosis', color: '#a855f7' };
  if (gki < 3) return { text: 'Deep Ketosis', color: '#3b82f6' };
  if (gki < 6) return { text: 'Nutritional Ketosis', color: '#22c55e' };
  if (gki < 9) return { text: 'Light Ketosis', color: '#eab308' };
  return { text: 'No Ketosis', color: '#aaa' };
}

// ---------------------------------------------------------------------------
// CSV parser (handles ; , \t delimiters and quoted fields)
// ---------------------------------------------------------------------------
function parseCSV(text) {
  return text.split(/\r?\n/).filter(l => l.trim() !== '').map(line => {
    const row = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else { inQ = !inQ; } continue; }
      if (!inQ && (ch === ',' || ch === ';' || ch === '\t')) { row.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    row.push(cur.trim());
    return row;
  });
}

// ---------------------------------------------------------------------------
// Chart zone plugin
// ---------------------------------------------------------------------------
const ketozonePlugin = {
  id: 'ketozones',
  beforeDraw(chart) {
    const { ctx, chartArea: { left, right, top, bottom }, scales: { y } } = chart;
    if (!y) return;
    const zones = [
      { min: 0, max: 1, color: 'rgba(168,85,247,0.28)', label: 'Extreme' },
      { min: 1, max: 3, color: 'rgba(59,130,246,0.28)', label: 'Deep' },
      { min: 3, max: 6, color: 'rgba(34,197,94,0.28)', label: 'Nutritional' },
      { min: 6, max: 9, color: 'rgba(234,179,8,0.28)', label: 'Light' },
      { min: 9, max: 999, color: 'rgba(170,170,170,0.14)', label: 'None' },
    ];
    ctx.save();
    for (const z of zones) {
      const yT = Math.max(y.getPixelForValue(z.max), top);
      const yB = Math.min(y.getPixelForValue(z.min), bottom);
      if (yB <= yT) continue;
      ctx.fillStyle = z.color;
      ctx.fillRect(left, yT, right - left, yB - yT);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(z.label, right - 6, yT + 14);
    }
    ctx.restore();
  }
};

// ---------------------------------------------------------------------------
// Main DOM initialisation
// ---------------------------------------------------------------------------
let chart = null;

function initApp() {
  const $ = id => document.getElementById(id);
  const els = {
    glucose: $('glucose'), glucoseUnit: $('glucoseUnit'), ketones: $('ketones'),
    timestamp: $('timestamp'), timestampDisp: $('timestampDisplay'), nowBtn: $('nowBtn'),
    note: $('note'), calcBtn: $('calcBtn'), justCalc: $('justCalc'), resultBox: $('result'),
    records: $('records'), rangeSelect: $('rangeSelect'), customWeeks: $('customWeeks'),
    exportCsv: $('exportCsv'), importCsv: $('importCsv'), importFile: $('importFile'),
    clearAll: $('clearAll'), form: $('calcForm'),
    chartCtx: $('gkiChart') ? $('gkiChart').getContext('2d') : null,
  };
  if (!els.glucose) return;

  // Prevent native form submit
  if (els.form) els.form.addEventListener('submit', e => e.preventDefault());

  // --- Timestamp helpers ---
  function setNow() {
    if (els.timestamp) els.timestamp.value = fmtDateInput(new Date());
    updateTimestampDisp();
  }
  function updateTimestampDisp() {
    if (!els.timestampDisp || !els.timestamp || !els.timestamp.value) return;
    const d = new Date(els.timestamp.value);
    els.timestampDisp.textContent = isNaN(d) ? '' : `${fmtDate(d)} ${fmtTime24(d)}`;
  }
  if (els.nowBtn) els.nowBtn.addEventListener('click', setNow);
  if (els.timestamp) els.timestamp.addEventListener('change', updateTimestampDisp);
  setNow();

  // --- Toast ---
  function toast(msg, ms = 2500) {
    const c = $('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg; c.appendChild(t);
    setTimeout(() => t.classList.add('visible'), 20);
    setTimeout(() => { t.classList.remove('visible'); setTimeout(() => c.removeChild(t), 300); }, ms);
  }

  // --- Result display ---
  function showResult(gki) {
    if (!els.resultBox) return;
    if (gki === null) { els.resultBox.textContent = 'Enter glucose and ketones (ketones > 0)'; return; }
    const lv = getLevel(gki);
    els.resultBox.innerHTML = `
      <div style="font-size:2.5rem;font-weight:800;color:#fff;letter-spacing:-0.03em" aria-live="polite">GKI: ${gki}</div>
      <div style="margin-top:0.4rem;font-size:1.1rem;font-weight:500;color:${lv.color}">${lv.text}</div>`;
    setTimeout(() => toast(`GKI: ${gki}`), 10);
  }

  // --- Form reading ---
  function readForm() {
    return {
      glucose: els.glucose.value,
      glucose_unit: els.glucoseUnit.value,
      ketones: els.ketones.value,
      timestamp: els.timestamp.value ? new Date(els.timestamp.value).toISOString() : new Date().toISOString(),
      note: els.note ? els.note.value : '',
    };
  }

  // --- Records (sorted newest-first) ---
  function sorted() { return loadRecords().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); }

  // --- Chart ---
  function filteredForChart() {
    const list = sorted();
    const range = els.rangeSelect ? els.rangeSelect.value : 'last7entries';
    if (range === 'last7entries') return list.slice(0, 7);
    if (range === 'all') return list;
    const cutoff = new Date();
    if (range === '7') cutoff.setDate(cutoff.getDate() - 7);
    else if (range === '30') cutoff.setDate(cutoff.getDate() - 30);
    else if (range === 'custom' && els.customWeeks) {
      cutoff.setDate(cutoff.getDate() - (parseInt(els.customWeeks.value) || 1) * 7);
    }
    return list.filter(r => new Date(r.timestamp) >= cutoff);
  }

  function buildChart(data) {
    if (!els.chartCtx || !window.Chart) return;
    if (chart) chart.destroy();
    const maxGki = data.length ? Math.max(...data.map(d => d.gki), 10) : 12;
    try {
      chart = new Chart(els.chartCtx, {
        type: 'line',
        data: {
          datasets: [{
            label: 'GKI',
            data: data.map(d => ({ x: new Date(d.timestamp), y: d.gki })),
            borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.08)',
            tension: 0.3, pointRadius: 4, pointBackgroundColor: '#fff', borderWidth: 2, fill: false,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            x: { type: 'time', time: { unit: 'day', tooltipFormat: 'MMM d, HH:mm', displayFormats: { day: 'MMM d', hour: 'HH:mm', minute: 'HH:mm' } }, ticks: { color: '#bbb', font: { size: 11 } } },
            y: { min: 0, max: Math.ceil(maxGki) + 1, title: { display: true, text: 'GKI', color: '#bbb' }, ticks: { color: '#bbb', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title(items) { if (!items.length) return ''; const d = new Date(items[0].parsed.x); return `${fmtDate(d)} ${fmtTime24(d)}`; },
                label(c) { return `GKI: ${c.parsed.y}`; },
              }
            }
          }
        },
        plugins: [ketozonePlugin],
      });
    } catch (e) { console.error('Chart init failed', e); }
  }

  function updateChart() { buildChart(filteredForChart()); }

  // --- Record list (show 3, expand/collapse) ---
  let expanded = false;
  const VISIBLE = 3;

  function renderRecords() {
    if (!els.records) return;
    const all = sorted();
    els.records.innerHTML = '';
    const show = expanded ? all : all.slice(0, VISIBLE);

    for (const r of show) {
      const li = document.createElement('li');
      const left = document.createElement('div');
      left.className = 'record-left';
      let html = `<div class="record-top"><div class="record-gki">${r.gki}</div><div class="record-info">${fmtDate(r.timestamp)} • ${fmtTime24(r.timestamp)} • ${r.glucose} ${r.glucose_unit} • ${r.ketones} mmol/L</div></div>`;
      if (r.note && r.note.trim()) html += `<div class="record-note">${r.note}</div>`;
      left.innerHTML = html;

      const right = document.createElement('div');
      right.className = 'record-actions';
      const eBtn = document.createElement('button'); eBtn.textContent = 'Edit'; eBtn.className = 'small';
      const dBtn = document.createElement('button'); dBtn.textContent = 'Del'; dBtn.className = 'small danger';
      eBtn.addEventListener('click', () => editRecord(r.id));
      dBtn.addEventListener('click', () => deleteRecord(r.id));
      right.append(eBtn, dBtn);
      li.append(left, right);
      els.records.appendChild(li);
    }

    if (all.length > VISIBLE) {
      const tog = document.createElement('div');
      tog.className = 'show-more-link';
      tog.textContent = expanded ? 'Show less' : `Show ${all.length - VISIBLE} more entries`;
      tog.addEventListener('click', () => { expanded = !expanded; renderRecords(); });
      els.records.appendChild(tog);
    }
  }

  // --- Edit record ---
  let editHandler = null;
  function editRecord(id) {
    const list = loadRecords();
    const rec = list.find(x => x.id === id);
    if (!rec) return;
    els.glucose.value = rec.glucose;
    els.glucoseUnit.value = rec.glucose_unit;
    els.ketones.value = rec.ketones;
    if (els.note) els.note.value = rec.note || '';
    if (els.timestamp) els.timestamp.value = fmtDateInput(new Date(rec.timestamp));
    updateTimestampDisp();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (els.calcBtn) {
      els.calcBtn.textContent = 'Save Changes';
      els.calcBtn.removeEventListener('click', saveHandler);
      if (editHandler) els.calcBtn.removeEventListener('click', editHandler);
      editHandler = function (e) {
        e.preventDefault();
        const f = readForm();
        const gki = computeGKI(f.glucose, f.glucose_unit, f.ketones);
        if (gki === null) { alert('Invalid values'); return; }
        showResult(gki);
        Object.assign(rec, { glucose: f.glucose, glucose_unit: f.glucose_unit, ketones: f.ketones, gki, note: f.note, timestamp: f.timestamp });
        overwriteRecords(list);
        renderRecords(); updateChart();
        els.calcBtn.removeEventListener('click', editHandler);
        els.calcBtn.addEventListener('click', saveHandler);
        els.calcBtn.textContent = 'Calculate & Save';
        editHandler = null;
        toast('Changes saved');
      };
      els.calcBtn.addEventListener('click', editHandler);
    }
  }

  function deleteRecord(id) {
    if (!confirm('Delete this record?')) return;
    overwriteRecords(loadRecords().filter(x => x.id !== id));
    renderRecords(); updateChart();
  }

  // --- Save handler ---
  const saveHandler = (e) => {
    if (e) e.preventDefault();
    const f = readForm();
    const gki = computeGKI(f.glucose, f.glucose_unit, f.ketones);
    showResult(gki);
    if (gki !== null) {
      saveRecord({ id: 'r_' + Date.now(), glucose: f.glucose, glucose_unit: f.glucose_unit, ketones: f.ketones, gki, note: f.note, timestamp: f.timestamp });
      renderRecords(); updateChart(); toast('Saved');
    }
  };

  if (els.calcBtn) els.calcBtn.addEventListener('click', saveHandler);
  if (els.justCalc) els.justCalc.addEventListener('click', () => {
    const f = readForm();
    showResult(computeGKI(f.glucose, f.glucose_unit, f.ketones));
  });

  // --- Live update on input ---
  const live = debounce(() => {
    const f = readForm();
    showResult(computeGKI(f.glucose, f.glucose_unit, f.ketones));
  });
  els.glucose.addEventListener('input', live);
  if (els.glucoseUnit) els.glucoseUnit.addEventListener('change', live);
  els.ketones.addEventListener('input', live);

  // --- Chart range controls ---
  if (els.rangeSelect) els.rangeSelect.addEventListener('change', () => {
    if (els.customWeeks) els.customWeeks.style.display = els.rangeSelect.value === 'custom' ? 'inline-block' : 'none';
    updateChart();
  });
  if (els.customWeeks) els.customWeeks.addEventListener('input', updateChart);

  // --- Export CSV ---
  if (els.exportCsv) els.exportCsv.addEventListener('click', () => {
    const blob = new Blob([exportCSV(loadRecords())], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'gki-records.csv'; a.click();
    URL.revokeObjectURL(url);
  });

  // --- Import CSV ---
  if (els.importCsv && els.importFile) {
    els.importCsv.addEventListener('click', () => els.importFile.click());
    els.importFile.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = parseCSV(text);

        // Strip BOM
        if (parsed[0] && parsed[0][0] && parsed[0][0].startsWith('\uFEFF')) {
          parsed[0][0] = parsed[0][0].replace('\uFEFF', '');
        }

        const hdr = parsed[0].map(h => h.toLowerCase().trim());
        const col = name => hdr.indexOf(name);
        const date_i = col('date'), time_i = col('time'), tz_i = col('timezone');
        const g_i = col('glucose'), gu_i = col('glucose_unit') !== -1 ? col('glucose_unit') : col('glucose unit');
        const k_i = col('ketones'), gki_i = col('gki'), note_i = col('note');

        const rows = parsed.slice(1).filter(r => r && r.join('').trim() !== '').map(r => r.map(c => c == null ? '' : String(c)));
        const records = rows.map(r => {
          let ts = new Date().toISOString();
          if (date_i !== -1 && time_i !== -1 && r[date_i] && r[time_i]) {
            try {
              const dm = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(r[date_i]);
              const tm = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(r[time_i].trim());
              if (dm && tm) {
                const d = new Date(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2], +(tm[3] || 0));
                if (!isNaN(d)) ts = d.toISOString();
              }
            } catch (err) { /* use default */ }
          } else if (col('timestamp') !== -1) {
            ts = r[col('timestamp')] || ts;
          }

          const glucose = r[g_i] || '';
          const glucose_unit = (gu_i !== -1 && r[gu_i]) ? r[gu_i] : (glucose.includes('.') ? 'mmolL' : 'mgdL');
          const ketones = r[k_i] || '';
          const gkiRaw = (gki_i !== -1 && r[gki_i] !== undefined && r[gki_i].trim() !== '') ? parseFloat(r[gki_i]) : null;
          const gki = gkiRaw !== null ? gkiRaw : (glucose && ketones ? computeGKI(glucose, glucose_unit, ketones) : null);

          return { timestamp: ts, glucose, glucose_unit: glucose_unit || 'mgdL', ketones, gki, note: note_i !== -1 ? (r[note_i] || '') : '' };
        }).filter(r => r.gki !== null);

        // Merge + dedupe
        const existing = loadRecords();
        const seen = new Set();
        const unique = [];
        for (const rec of [...records, ...existing]) {
          const key = `${rec.timestamp}||${rec.glucose}||${rec.ketones}`;
          if (seen.has(key)) continue;
          seen.add(key);
          unique.push({ ...rec, id: rec.id || ('r_' + Date.now() + Math.random().toString(36).slice(2)) });
        }
        overwriteRecords(unique);
        renderRecords(); updateChart();
        toast(`Imported ${records.length} entries`);
      } catch (err) {
        console.error(err); alert('Failed to import CSV');
      } finally {
        els.importFile.value = '';
      }
    });
  }

  // --- Clear all ---
  if (els.clearAll) els.clearAll.addEventListener('click', () => {
    if (confirm('Clear all history?')) { overwriteRecords([]); renderRecords(); updateChart(); }
  });

  // --- Initial render ---
  renderRecords();
  updateChart();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();
